import { commonPreparationSkillLevels } from './rankingBasis';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CANONICAL_TARGET_CLASS_IDS,
  attributeAffinity,
  classAffinity,
  defaultTargetClassRelation,
  servantAttribute,
  targetClassCandidates,
} from '@fgo-lab/calc-core';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));
import { applyEffectProjectionDecision } from './effectDecision';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { getAttackReachableInitialActorForms } from './actorFormGraph';
import { createStaticAttackProfiles } from './attackProfile';

const root = resolve(import.meta.dirname, '../../..');

const productionMaster = readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
  (bytes) => masterSnapshotSchema.parse(JSON.parse(bytes)),
);
const loadMaster = () => productionMaster;

describe('production canonical target context', () => {
  it('keeps every ambiguous default explicit and repairs each one with target identity and applicable family', async () => {
    const master = await loadMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const ambiguousIds = [
      '102900',
      '303200',
      '505200',
      '505500',
      '603300',
      '605000',
      '704400',
      '901700',
      '1100600',
      '1101900',
      '2500200',
      '2500500',
      '2500900',
      '2501100',
      '4000100',
    ];
    for (const id of ambiguousIds) {
      const servant = master.servants.find((candidate) => candidate.id === id)!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const initial = calculateScenarioOutcome(scenario, master, versions);
      expect(initial.result, id).toMatchObject({
        status: 'inputRequired',
        issues: [{ code: 'invalidTargetContext:ambiguousTargetResult:' }],
        rows: [],
      });
      const classId = targetClassCandidates(servant.classId, scenario.targetContext.class)[0]!;
      const concrete = {
        ...scenario,
        targetContext: {
          ...scenario.targetContext,
          class: { kind: 'concrete' as const, classId },
          attribute: { kind: 'concrete' as const, attribute: 'earth' as const },
        },
      };
      const resolved = calculateScenarioOutcome(concrete, master, versions);
      if (id !== '102900') {
        expect(resolved.result.status, id).toBe('calculated');
        continue;
      }
      expect(resolved.result.status).toBe('inputRequired');
      const beastControl = resolved.effectControls.find(
        ({ projection }) =>
          projection.decision.state !== 'none' &&
          projection.decision.kind === 'targetPredicate' &&
          projection.decision.target.kind === 'familyMembership' &&
          projection.decision.target.familyId === 'beast',
      );
      expect(beastControl).toBeDefined();
      const withFamily = applyEffectProjectionDecision(concrete, beastControl!.projection, true);
      expect(calculateScenarioOutcome(withFamily, master, versions).result.status).toBe(
        'calculated',
      );
    }
  }, 30_000);

  it('keeps scalar NP reads exact across relative identities and explicit local state', async () => {
    const master = await loadMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const musashi = master.servants.find(({ id }) => id === '101700')!;
    const tell = master.servants.find(({ id }) => id === '203400')!;
    const olga = master.servants.find(({ id }) => id === '4000100')!;
    const musashiResult = calculateScenarioOutcome(
      createDefaultResolvedScenario(master, undefined, musashi),
      master,
      versions,
    );
    expect(musashiResult.result.status).toBe('calculated');
    if (musashiResult.status === 'executable')
      expect(musashiResult.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);

    const musashiRanking = calculateRankingPolicyDetail(
      musashi,
      master,
      { servantBuilds: {} },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    expect(musashiRanking.status).toBe('calculated');
    if (musashiRanking.status === 'calculated') {
      expect(musashiRanking.detail.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
      expect(
        musashiRanking.detail.effects
          .filter(({ contributionControl }) => contributionControl === 'worldAssumption')
          .map(({ outcome }) => outcome),
      ).toEqual(['notRelevant', 'notRelevant']);
    }

    const tellScenario = createDefaultResolvedScenario(master, undefined, tell);
    expect(
      tellScenario.worldFactAssertions
        .filter(
          ({ fact }) => fact.kind === 'trait' && ['buffEvade', 'marking'].includes(fact.trait),
        )
        .map(({ fact }) => fact),
    ).toEqual([
      { kind: 'trait', scope: 'targetState', trait: 'buffEvade', present: false },
      { kind: 'trait', scope: 'targetState', trait: 'marking', present: false },
    ]);
    const tellResult = calculateScenarioOutcome(tellScenario, master, versions);
    expect(tellResult.result.status).toBe('calculated');

    const relative = createDefaultResolvedScenario(master, undefined, olga);
    for (const profile of createStaticAttackProfiles(olga)) {
      const ranking = calculateRankingPolicyDetail(
        olga,
        master,
        { servantBuilds: {} },
        DEFAULT_RANKING_POLICY_CONDITIONS,
        versions,
        profile,
      );
      expect(ranking.status).toBe('calculated');
      if (ranking.status === 'calculated') {
        const inactive = ranking.detail.effects.filter(
          ({ contributionControl, visibility }) =>
            contributionControl === 'worldAssumption' && visibility === 'hidden',
        );
        expect(inactive.length).toBeGreaterThan(0);
        expect(inactive.every(({ outcome }) => outcome === 'impossible')).toBe(true);
      }
    }
    const ambiguous = calculateScenarioOutcome(
      {
        ...relative,
        targetContext: {
          ...relative.targetContext,
          attribute: { kind: 'relative', relation: 'neutral' },
        },
      },
      master,
      versions,
    );
    expect(ambiguous.result).toMatchObject({
      status: 'inputRequired',
      issues: [{ code: 'invalidTargetContext:ambiguousTargetResult:' }],
      rows: [],
    });
    for (const [attribute, multiplier] of [
      ['man', 1.625],
      ['earth', 1],
    ] as const) {
      const concrete = calculateScenarioOutcome(
        {
          ...relative,
          targetContext: { ...relative.targetContext, attribute: { kind: 'concrete', attribute } },
        },
        master,
        versions,
      );
      expect(concrete.result.status).toBe('calculated');
      if (concrete.status === 'executable')
        expect(concrete.input.npSpecialMultipliers).toEqual(Array(5).fill(multiplier));
    }
  });

  it('derives every default relation from the canonical class relation', async () => {
    const master = await loadMaster();
    const attackers = master.servants.filter(
      (servant) =>
        getAttackReachableInitialActorForms(
          servant,
          master.npResourceSemantics,
          commonPreparationSkillLevels(servant),
          1,
          1,
        ).length > 0,
    );
    const inventory = { advantage2: 0, advantage15: 0, neutral: 0, disadvantage: 0 };
    for (const attacker of attackers) {
      const relation = defaultTargetClassRelation(attacker.classId);
      inventory[relation] += 1;
      expect(
        targetClassCandidates(attacker.classId, { kind: 'relative', relation }),
      ).not.toHaveLength(0);
      expect(
        createDefaultResolvedScenario(master, undefined, attacker).targetContext.class,
      ).toEqual({ kind: 'relative', relation });
    }
    expect(attackers).toHaveLength(422);
    expect(inventory).toEqual({
      advantage2: 376,
      advantage15: 45,
      neutral: 1,
      disadvantage: 0,
    });
    expect(attackers.filter((attacker) => attacker.classId === 'berserker')).toHaveLength(44);
  }, 30_000);

  it('locks the approved NP1-5 default damage corrections', async () => {
    const master = await loadMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const cases = [
      ['700100', [43_170.205, 57_493.875, 64_655.655, 68_236.565, 71_817.46]],
      ['800100', [16_104.32, 20_130.525, 22_143.64, 23_150.195, 24_156.735]],
      ['3300200', [21_351.055, 28_421.63, 31_956.83, 33_724.525, 35_492.17]],
    ] as const;
    for (const [servantId, expected] of cases) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const calculation = calculateScenario(
        {
          ...createDefaultResolvedScenario(master, undefined, servant),
          preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
        },
        master,
        versions,
      );
      expect(calculation.result.status).toBe('calculated');
      if (calculation.result.status !== 'calculated') continue;
      expect(calculation.result.rows.map(({ average }) => average)).toEqual(expected);
    }
  });

  it('keeps all 376 reachable advantage2 default calculations unchanged', async () => {
    const master = await loadMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    let compared = 0;
    for (const servant of master.servants.filter(
      (candidate) =>
        getAttackReachableInitialActorForms(
          candidate,
          master.npResourceSemantics,
          commonPreparationSkillLevels(candidate),
          1,
          1,
        ).length > 0,
    )) {
      if (defaultTargetClassRelation(servant.classId) !== 'advantage2') continue;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const current = calculateScenario(scenario, master, versions);
      const explicitPrevious = calculateScenario(
        {
          ...scenario,
          targetContext: {
            ...scenario.targetContext,
            class: { kind: 'relative', relation: 'advantage2' },
          },
        },
        master,
        versions,
      );
      expect(current.input, servant.id).toEqual(explicitPrevious.input);
      expect(current.result, servant.id).toEqual(explicitPrevious.result);
      compared += 1;
    }
    expect(compared).toBe(376);
  }, 30_000);

  it('derives concrete class, attribute, and independent family membership', async () => {
    const master = await loadMaster();
    const attacker = master.servants.find((servant) => servant.id === '100100')!;
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    for (const classId of ['saber', 'rider'] as const) {
      const scenario = createDefaultResolvedScenario(master, undefined, attacker);
      scenario.targetContext = {
        class: { kind: 'concrete', classId },
        attribute: { kind: 'concrete', attribute: 'sky' },
        families: [{ familyId: 'demonGodPillar' }],
        absentFamilies: [],
      };
      const calculation = calculateScenario(scenario, master, versions);
      expect(calculation.result.status).toBe('calculated');
      expect(calculation.input).toMatchObject({
        classAffinity: classAffinity(attacker.classId, classId),
        attributeAffinity: attributeAffinity(servantAttribute(attacker.traits), 'sky'),
        target: { classId, attribute: 'sky' },
      });
      expect(calculation.input.target.traits).not.toContain('classDemonGodPillar');
    }
  });

  it('keeps family membership independent and rejects free identity world facts', async () => {
    const master = await loadMaster();
    const attacker = master.servants.find((servant) => servant.id === '100100')!;
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const independent = createDefaultResolvedScenario(master, undefined, attacker);
    independent.targetContext = {
      class: { kind: 'concrete', classId: 'lancer' },
      attribute: { kind: 'relative', relation: 'neutral' },
      families: [{ familyId: 'demonGodPillar' }],
      absentFamilies: [],
    };
    expect(calculateScenario(independent, master, versions).result.status).toBe('calculated');

    const forged = createDefaultResolvedScenario(master, undefined, attacker);
    forged.worldFactAssertions = [
      {
        decisionKey: 'forged:attribute',
        fact: { kind: 'trait', scope: 'target', trait: 'attributeSky', present: true },
      },
    ];
    const forgedResult = calculateScenario(forged, master, versions);
    expect(forgedResult.result.status).toBe('calculated');
    expect(forgedResult.input.attributeAffinity).toBe(1);
    expect(forgedResult.input.target.attribute).not.toBe('sky');
  });

  it('projects class and attribute special selections directly into TargetContext', async () => {
    const master = await loadMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    for (const [servantId, expected] of [
      ['101700', { classId: 'alterEgo' }],
      ['4000100', { attribute: 'man' }],
    ] as const) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const initial = calculateScenario(scenario, master, versions);
      const projection = initial.effects.find(
        (effect) =>
          effect.decision.state !== 'none' &&
          effect.decision.kind === 'targetPredicate' &&
          (effect.decision.target.kind === 'classIdentity'
            ? effect.decision.target.classId === expected.classId
            : effect.decision.target.kind === 'attributeIdentity'
              ? effect.decision.target.attribute === expected.attribute
              : false),
      )!;
      const selectedScenario = applyEffectProjectionDecision(scenario, projection, true);
      expect(selectedScenario.worldFactAssertions).toEqual([]);
      const selected = calculateScenario(selectedScenario, master, versions);
      expect(selected.result.status).toBe('calculated');
      expect(selected.input.target).toMatchObject(expected);
      const restored = applyEffectProjectionDecision(
        selectedScenario,
        selected.effects.find((effect) => effect.projectionKey === projection.projectionKey)!,
        false,
      );
      expect(restored.targetContext).toEqual(scenario.targetContext);
    }
  });

  it('has no calculated relation without a real target candidate', async () => {
    const master = await loadMaster();
    for (const attacker of master.servants.filter(
      (servant) =>
        getAttackReachableInitialActorForms(
          servant,
          master.npResourceSemantics,
          commonPreparationSkillLevels(servant),
          1,
          1,
        ).length > 0,
    ))
      for (const relation of ['advantage2', 'advantage15', 'neutral', 'disadvantage'] as const) {
        const candidates = targetClassCandidates(attacker.classId, { kind: 'relative', relation });
        if (candidates.length > 0) continue;
        expect(defaultTargetClassRelation(attacker.classId)).not.toBe(relation);
      }
    expect(CANONICAL_TARGET_CLASS_IDS).toHaveLength(17);
  });
});
