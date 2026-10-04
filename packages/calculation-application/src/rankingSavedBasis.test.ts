import { describe, expect, it } from 'vitest';
import {
  activeServantSkillSchema,
  getDefaultInitialActorForm,
  masterSnapshotSchema,
} from '@fgo-lab/master-data';
import { servantBuildSchema, resolvedRankingBasisSchema, APP_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import { DEFAULT_RANKING_POLICY_CONDITIONS as defaults } from './rankingContracts';
import {
  applyRankingSelectionCommand,
  compileRankingSelection,
  resolveRankingBasis,
} from './rankingBasis';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { createRankingBaseScenario } from './rankingPolicy';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { stackEffectTemplate } from './stackQuantityFixture';
import {
  AttackProfileRequestFailure,
  createCalculatorPortableRequest,
  createCalculatorPortableRequestForAttackProfile,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  recoverPortableCalculation,
} from './portableCalculation';

const source = masterSnapshotSchema.parse(fixture);
const base = source.servants[0]!;
// A new semantic fixture for command-level binding; the immutable source fixture has no active skills.
const skill = activeServantSkillSchema.parse({
  id: 'saved-basis-skill',
  priority: 0,
  name: 'saved-basis-skill',
  detail: '',
  imageKey: null,
  resourceRequirement: null,
  slot: 1,
  effects: [],
});
const master = masterSnapshotSchema.parse({
  ...source,
  servants: [
    {
      ...base,
      skills: [skill],
      actorFormGraph: {
        ...base.actorFormGraph,
        forms: base.actorFormGraph.forms.map((form) => ({ ...form, skillIds: [skill.id] })),
      },
    },
  ],
});
const servant = master.servants[0]!;
const single = master;
const build = servantBuildSchema.parse({
  servantId: servant.id,
  level: 90,
  ascension: 4,
  npLevel: 1,
  fouAtk: 0,
  skills: Object.fromEntries(servant.skills.map(({ slot }) => [String(slot), 1])),
  appends: {},
  updatedAt: '2026-10-03T00:00:00.000Z',
});
const profile = { servantBuilds: { [servant.id]: build } };
const versions = {
  ...currentCalculationVersionContext(master),
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const selection = compileRankingSelection({
  ...defaults,
  growthBasis: 'saved',
  population: 'owned',
  levelBasis: 'ownedLevel',
  npLevelBasis: { kind: 'owned' },
});
if (selection.status !== 'valid') throw new Error(selection.detail);

describe('saved ranking growth basis', () => {
  it.each(['success', 'failure'] as const)(
    'does not guarantee an NP after a possible loss (declared default: %s)',
    (defaultOutcome) => {
      const damage = {
        ...stackEffectTemplate,
        id: 'legal-loss-damage',
        occurrenceId: 'legal-loss-damage',
        gameActivation: 'skillUse' as const,
        proc: { kind: 'guaranteed' as const },
        selection: null,
        inputDefinitions: [],
        requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
        execution: [
          {
            kind: 'damageModifier' as const,
            modifier: 'attackBuff' as const,
            sign: 1 as const,
            card: null,
            route: {
              target: 'sourceSelf' as const,
              contributionScope: 'personal' as const,
              eligibility: { kind: 'anyRecipient' as const, onMissing: 'unsupported' as const },
            },
            values: [Array(10).fill(500), [], [], [], []],
            valueExpressions: [Array(10).fill(null), [], [], [], []],
            semanticSupport: 'supported' as const,
          },
        ],
      };
      const selectedSkill = activeServantSkillSchema.parse({
        ...skill,
        effects: [
          damage,
          {
            ...damage,
            id: 'legal-loss-resource',
            occurrenceId: 'legal-loss-resource',
            proc: { kind: 'singleRoll', ratePermille: [Array(10).fill(500), [], [], [], []] },
            selection: {
              kind: 'stochasticOutcome',
              group: { kind: 'binary', key: 'legal-loss-proc', defaultOutcome },
            },
            execution: [
              {
                kind: 'resourceMutation',
                resource: 'npGauge',
                direction: 'loss',
                unit: 'fixed',
                recipient: 'sourceSelf',
                subjectId: null,
                amount: { kind: 'fixed', values: [Array(10).fill(5000), [], [], [], []] },
              },
            ],
          },
        ],
      });
      const current = masterSnapshotSchema.parse({
        ...master,
        servants: [{ ...servant, skills: [selectedSkill] }],
      });
      const savedProfile = { servantBuilds: { [servant.id]: { ...build, skills: { '1': 10 } } } };
      const compared = calculateRankingPolicy(
        current,
        savedProfile,
        { ...selection.selection, conditionalEffects: 'baseline' },
        versions,
      );
      const result = Object.values(compared.profileResults).find(
        ({ status }) => status === 'calculated',
      );
      if (result?.status !== 'calculated') throw new Error('calculated legal-loss oracle required');
      // The skill can leave only 5000 gauge. Its guaranteed buff cannot guarantee a legal NP.
      expect(result.detail.input.attackBuff).toBe(0);
    },
  );

  it.each([1, 2] as const)(
    'matches a small legal NP-order oracle at saved NP%s without borrowing a future charge',
    (npLevel) => {
      const resource = (direction: 'gain' | 'loss') => ({
        kind: 'resourceMutation' as const,
        resource: 'npGauge' as const,
        direction,
        unit: 'fixed' as const,
        recipient: 'sourceSelf' as const,
        subjectId: null,
        amount: { kind: 'fixed' as const, values: [Array(10).fill(5000), [], [], [], []] },
      });
      const charge = activeServantSkillSchema.parse({
        ...skill,
        effects: [
          {
            ...stackEffectTemplate,
            id: 'oracle-charge',
            occurrenceId: 'oracle-charge',
            gameActivation: 'skillUse',
            proc: { kind: 'guaranteed' },
            selection: null,
            inputDefinitions: [],
            requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
            execution: [resource('gain')],
          },
        ],
      });
      const gated = activeServantSkillSchema.parse({
        ...skill,
        id: 'oracle-gated',
        name: 'oracle-gated',
        slot: 2,
        resourceRequirement: { kind: 'atLeast', amountsBySkillLevel: Array(10).fill(15000) },
        effects: [
          {
            ...charge.effects[0]!,
            id: 'oracle-gated-effect',
            occurrenceId: 'oracle-gated-effect',
            execution: [
              resource('loss'),
              {
                kind: 'damageModifier',
                modifier: 'attackBuff',
                sign: 1,
                card: null,
                route: {
                  target: 'sourceSelf',
                  contributionScope: 'personal',
                  eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
                },
                values: [Array(10).fill(500), [], [], [], []],
                valueExpressions: [Array(10).fill(null), [], [], [], []],
                semanticSupport: 'supported',
              },
            ],
          },
        ],
      });
      const actor = {
        ...servant,
        skills: [charge, gated],
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: [charge.id, gated.id],
          })),
        },
      };
      const current = masterSnapshotSchema.parse({ ...master, servants: [actor] });
      const canonical = current.servants[0]!;
      const saved = { ...build, npLevel, skills: { '1': 10, '2': 10 } };
      const savedProfile = { servantBuilds: { [servant.id]: saved } };
      const basis = resolveRankingBasis(canonical, savedProfile, selection.selection);
      const initial = getDefaultInitialActorForm(canonical);
      if (!initial) throw new Error('initial oracle form required');
      const baseScenario = createRankingBaseScenario(
        canonical,
        current,
        basis,
        selection.selection,
        initial.id,
      );
      // This oracle enumerates the complete two-slot universe independently of the
      // ranking compiler. Requirement reads precede every mutation in that command.
      const plans = [[], [1], [2], [1, 2], [2, 1]] as const;
      let maximumBuff = 0;
      for (const slots of plans) {
        const capacity = npLevel === 1 ? 10000 : 20000;
        let gauge = 10000;
        let legal = true;
        let buff = 0;
        for (const slot of slots) {
          if (slot === 1) gauge = Math.min(capacity, gauge + 5000);
          else if (gauge < 15000) {
            legal = false;
            break;
          } else {
            gauge -= 5000;
            buff = 0.5;
          }
        }
        const request = createCalculatorPortableRequest(
          {
            ...baseScenario,
            preNoblePhantasmPlan: [
              ...slots.map((slot) => ({
                kind: 'useSkillSlot' as const,
                slot,
                skillLevel: 10,
                choice: null,
              })),
              { kind: 'executeAttackNoblePhantasm' },
            ],
          },
          currentCalculationVersionContext(current),
        );
        const retained = structuredClone(request);
        const outcome = executePortableCalculation(request, current);
        expect(request).toEqual(retained);
        if (!legal) {
          expect(outcome).toMatchObject({
            status: 'executed',
            execution: {
              result: {
                status: 'unavailable',
                reason: npLevel === 1 ? 'npCapacityExceeded' : 'insufficientNpGauge',
              },
            },
          });
          continue;
        }
        expect(outcome.status).toBe('executed');
        if (outcome.status !== 'executed' || outcome.execution.status !== 'executable')
          throw new Error('executable oracle member required');
        expect(outcome.execution.input.attackBuff).toBe(buff);
        expect(outcome.execution.appliedPreparationActions.at(-1)?.ocUse?.gaugeBefore).toBe(gauge);
        maximumBuff = Math.max(maximumBuff, buff);
      }
      const ranking = calculateRankingPolicy(current, savedProfile, selection.selection, versions);
      const selected = Object.values(ranking.profileResults).find(
        ({ status }) => status === 'calculated',
      );
      if (selected?.status !== 'calculated') throw new Error('calculated oracle maximum required');
      expect(selected.detail.input.attackBuff).toBe(maximumBuff);
      const slots = selected.detail.appliedPreparationActions.flatMap(({ command }) =>
        command.kind === 'useSkillSlot' ? [command.slot] : [],
      );
      if (npLevel === 2) expect(slots).toEqual([1, 2]);
      else expect(slots).not.toContain(2);
      if (npLevel === 2) {
        for (const defaultOutcome of ['success', 'failure'] as const) {
          const uncertain = masterSnapshotSchema.parse({
            ...current,
            servants: [
              {
                ...canonical,
                skills: canonical.skills.map((source) =>
                  source.slot !== 1
                    ? source
                    : {
                        ...source,
                        effects: source.effects.map((effect) => ({
                          ...effect,
                          proc: {
                            kind: 'singleRoll',
                            ratePermille: [Array(10).fill(500), [], [], [], []],
                          },
                          selection: {
                            kind: 'stochasticOutcome',
                            group: {
                              kind: 'binary',
                              key: 'oracle-charge-proc',
                              defaultOutcome,
                            },
                          },
                        })),
                      },
                ),
              },
            ],
          });
          for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
            const selectedPolicy = calculateRankingPolicy(
              uncertain,
              savedProfile,
              { ...selection.selection, conditionalEffects },
              versions,
            );
            const result = Object.values(selectedPolicy.profileResults).find(
              ({ status }) => status === 'calculated',
            );
            if (result?.status !== 'calculated')
              throw new Error('calculated stochastic oracle required');
            // A declared success is a possible outcome, not proof of a guaranteed charge.
            expect(
              result.detail.input.attackBuff,
              JSON.stringify({
                defaultOutcome,
                conditionalEffects,
                actions: result.detail.appliedPreparationActions,
                certificate: result.detail.possibilityCertificate,
              }),
            ).toBe(conditionalEffects === 'baseline' ? 0 : 0.5);
          }
        }
      }
    },
  );

  it.each(['common', 'saved'] as const)(
    'rejects a pinned %s basis when the current master servant or slot inventory is missing',
    (growthBasis) => {
      const selected = compileRankingSelection({ ...selection.selection, growthBasis });
      if (selected.status !== 'valid') throw new Error(selected.detail);
      const ranking = calculateRankingPolicy(single, profile, selected.selection, versions);
      const entry = Object.values(ranking.profileResults).find(
        ({ status }) => status === 'calculated',
      );
      if (entry?.status !== 'calculated') throw new Error('calculated fixture required');
      const request = createRankingPortableRequest(
        entry.detail,
        currentCalculationVersionContext(master),
      );
      const retained = structuredClone({ request, result: entry.detail.result });
      for (const changed of [
        masterSnapshotSchema.parse({ ...master, servants: [] }),
        masterSnapshotSchema.parse({
          ...master,
          servants: [
            {
              ...servant,
              skills: [],
              actorFormGraph: {
                ...servant.actorFormGraph,
                forms: servant.actorFormGraph.forms.map((form) => ({ ...form, skillIds: [] })),
              },
            },
          ],
        }),
      ]) {
        expect(executePortableCalculation(request, changed)).toMatchObject({
          status: 'invalid',
          reason: 'scenarioInvalid',
          detail: 'ranking_basis_invalid',
        });
        expect(recoverPortableCalculation(request, entry.detail.result, changed)).toMatchObject({
          status: 'invalid',
          reason: 'scenarioInvalid',
        });
        expect({ request, result: entry.detail.result }).toEqual(retained);
      }
    },
  );

  it('uses saved skill cells for damage and ordered NP mutations, including capacity clipping', () => {
    const cellSkill = activeServantSkillSchema.parse({
      ...skill,
      effects: [
        {
          ...stackEffectTemplate,
          id: 'saved-cell-effect',
          occurrenceId: 'saved-cell-effect:0',
          gameActivation: 'skillUse',
          proc: { kind: 'guaranteed' },
          selection: null,
          inputDefinitions: [],
          requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
          execution: [
            {
              kind: 'damageModifier',
              modifier: 'attackBuff',
              sign: 1,
              card: null,
              route: {
                target: 'sourceSelf',
                contributionScope: 'personal',
                eligibility: {
                  kind: 'requiredRecipient',
                  recipient: 'attacker',
                  onMissing: 'ignore',
                  onMismatch: 'ignore',
                },
              },
              values: [Array.from({ length: 10 }, (_, i) => 100 * (i + 1)), [], [], [], []],
              valueExpressions: [Array.from({ length: 10 }, () => null), [], [], [], []],
              semanticSupport: 'supported',
            },
            ...(['loss', 'gain'] as const).map((direction) => ({
              kind: 'resourceMutation',
              resource: 'npGauge',
              direction,
              unit: 'fixed',
              recipient: 'sourceSelf',
              subjectId: null,
              amount: {
                kind: 'fixed',
                values: [
                  Array.from({ length: 10 }, (_, i) =>
                    direction === 'loss' ? 1000 : 2000 * (i + 1),
                  ),
                  [],
                  [],
                  [],
                  [],
                ],
              },
            })),
          ],
        },
      ],
    });
    const cellMaster = masterSnapshotSchema.parse({
      ...master,
      servants: [
        {
          ...servant,
          skills: [cellSkill],
        },
      ],
    });
    for (const skillLevel of [1, 5, 10]) {
      const saved = { ...build, npLevel: 2, skills: { '1': skillLevel } };
      const calculated = calculateRankingPolicy(
        cellMaster,
        { servantBuilds: { [servant.id]: saved } },
        selection.selection,
        { ...versions, masterDataVersion: cellMaster.version },
      );
      const entry = Object.values(calculated.profileResults).find(
        ({ status }) => status === 'calculated',
      );
      if (entry?.status !== 'calculated') throw new Error(JSON.stringify(calculated.exclusions));
      const detail = entry.detail;
      expect(detail.input.attackBuff).toBe(skillLevel / 10);
      const action = detail.appliedPreparationActions.find(
        ({ command }) => command.kind === 'useSkillSlot',
      );
      expect(action?.command).toMatchObject({ skillLevel });
      expect(
        action?.resourceTransaction.mutations.map(({ before, after }) => [
          before.gauge,
          after.gauge,
        ]),
      ).toEqual([
        [10000, 9000],
        [9000, Math.min(20000, 9000 + 2000 * skillLevel)],
      ]);
      expect(detail.appliedPreparationActions.at(-1)?.ocUse?.gaugeBefore).toBe(
        Math.min(20000, 9000 + 2000 * skillLevel),
      );
      const request = createRankingPortableRequest(
        detail,
        currentCalculationVersionContext(cellMaster),
      );
      const replay = executePortableCalculation(request, cellMaster);
      expect(replay.status).toBe('executed');
      if (replay.status === 'executed') {
        expect(replay.execution.status).toBe('executable');
        if (replay.execution.status !== 'executable') throw new Error('executable replay required');
        expect(replay.execution.input).toEqual(detail.input);
        expect(replay.execution.result).toEqual(detail.result);
        expect(replay.execution.appliedPreparationActions).toEqual(
          detail.appliedPreparationActions,
        );
      }
    }
  });

  it('binds level, NP and Fou independently to the actual damage input and selected row', () => {
    const lowLevel = Math.min(...Object.keys(servant.atkByLevel).map(Number));
    for (const saved of [
      build,
      { ...build, level: lowLevel },
      { ...build, npLevel: 5 },
      { ...build, fouAtk: 3000 },
    ]) {
      const ranking = calculateRankingPolicy(
        single,
        { servantBuilds: { [servant.id]: saved } },
        selection.selection,
        versions,
      );
      const entry = Object.values(ranking.profileResults).find(
        ({ status }) => status === 'calculated',
      );
      if (entry?.status !== 'calculated') throw new Error(JSON.stringify(ranking.exclusions));
      expect(entry.detail.input).toMatchObject({
        attackerLevel: saved.level,
        attackerAtk: servant.atkByLevel[saved.level],
        npLevel: saved.npLevel,
        fouAtk: saved.fouAtk,
      });
      expect(ranking.rows[0]?.average).toBe(entry.detail.result.rows[saved.npLevel - 1]!.average);
    }
  });

  it('rejects incomplete owned growth when opening an AttackProfile and retains the build', () => {
    const attackProfile = compileStaticRankingPreparationPrograms(servant, build.skills)[0]!
      .attackProfile;
    const incomplete = { ...build, skills: {} };
    const retained = structuredClone(incomplete);
    expect(() =>
      createCalculatorPortableRequestForAttackProfile(master, incomplete, servant, attackProfile),
    ).toThrow(AttackProfileRequestFailure);
    expect(() =>
      createCalculatorPortableRequestForAttackProfile(master, incomplete, servant, attackProfile),
    ).toThrow('servantBuildIncomplete');
    expect(incomplete).toEqual(retained);
    const request = createCalculatorPortableRequestForAttackProfile(
      master,
      build,
      servant,
      attackProfile,
    );
    if (request.scenario.mode !== 'resolved') throw new Error('resolved request required');
    expect(request.scenario.attacker).toMatchObject({
      source: 'owned',
      level: 90,
      npLevel: 1,
      fouAtk: 0,
    });
    expect(
      createCalculatorPortableRequestForAttackProfile(master, undefined, servant, attackProfile)
        .executionIntent.kind,
    ).toBe('calculator');
  });

  it('rejects saved slots absent from the canonical servant instead of ignoring them', () => {
    const result = calculateRankingPolicy(
      single,
      {
        servantBuilds: { [servant.id]: { ...build, skills: { ...build.skills, '2': 5 } } },
      },
      selection.selection,
      versions,
    );
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions.length).toBeGreaterThan(0);
    expect(
      result.exclusions.every(
        (entry) =>
          entry.reason === 'rankingBuildIncomplete' && entry.recovery.kind === 'editSavedBuild',
      ),
    ).toBe(true);
  });

  it.each(['common', 'saved'] as const)(
    'rejects missing or extra pinned slots for %s replay',
    (growthBasis) => {
      const selected = compileRankingSelection({ ...selection.selection, growthBasis });
      if (selected.status !== 'valid') throw new Error(selected.detail);
      const ranking = calculateRankingPolicy(single, profile, selected.selection, versions);
      const calculated = Object.values(ranking.profileResults).find(
        (entry) => entry.status === 'calculated',
      );
      if (calculated?.status !== 'calculated') throw new Error(JSON.stringify(ranking.exclusions));
      const request = createRankingPortableRequest(
        calculated.detail,
        currentCalculationVersionContext(master),
      );
      for (const skillLevels of [
        {},
        { ...calculated.detail.basis.skillLevels, '2': growthBasis === 'common' ? 10 : 5 },
      ]) {
        const forged = structuredClone(request);
        if (forged.executionIntent.kind !== 'ranking') throw new Error('ranking fixture required');
        forged.executionIntent.basis = resolvedRankingBasisSchema.parse({
          ...forged.executionIntent.basis,
          skillLevels,
        });
        expect(executePortableCalculation(forged, master)).toMatchObject({
          status: 'invalid',
          reason: 'scenarioInvalid',
          detail: 'ranking_basis_invalid',
        });
      }
    },
  );

  it('binds one pinned build to scenario and every ordered source use', () => {
    const basis = resolveRankingBasis(servant, profile, selection.selection);
    expect(basis).toMatchObject({
      growthBasis: 'saved',
      level: 90,
      npLevel: 1,
      fouAtk: 0,
      skillLevels: build.skills,
    });
    expect(
      createRankingBaseScenario(
        servant,
        master,
        basis,
        defaults,
        getDefaultInitialActorForm(servant)!.id,
      ).attacker.fouAtk,
    ).toBe(0);
    const programs = compileStaticRankingPreparationPrograms(servant, basis.skillLevels);
    const commands = programs.flatMap(({ commands }) =>
      commands.filter((command) => command.kind === 'useSkillSlot'),
    );
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.skillLevel === 1)).toBe(true);
    expect(
      programs
        .flatMap(({ sourceUses }) => sourceUses)
        .filter((source) => source.kind === 'skill')
        .every((source) => source.skillLevel === 1),
    ).toBe(true);
  });
  it('preserves common fou and skills when using owned level and NP choices', () => {
    const common = compileRankingSelection({ ...selection.selection, growthBasis: 'common' });
    if (common.status !== 'valid') throw new Error(common.detail);
    expect(resolveRankingBasis(servant, profile, common.selection)).toMatchObject({
      level: 90,
      npLevel: 1,
      fouAtk: 1000,
    });
    expect(
      Object.values(resolveRankingBasis(servant, profile, common.selection).skillLevels).every(
        (level) => level === 10,
      ),
    ).toBe(true);
  });
  it('refuses absent skills without manufacturing level 1, and refuses contradictory saved selections', () => {
    const broken = { servantBuilds: { [servant.id]: { ...build, skills: {} } } };
    const result = calculateRankingPolicy(single, broken, selection.selection, versions);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions.length).toBeGreaterThan(0);
    expect(
      result.exclusions.every(
        (entry) =>
          entry.reason === 'rankingBuildIncomplete' && entry.recovery.kind === 'editSavedBuild',
      ),
    ).toBe(true);
    expect(compileRankingSelection({ ...selection.selection, population: 'all' }).status).toBe(
      'invalid',
    );
    expect(
      compileRankingSelection({ ...selection.selection, levelBasis: 'naturalLimit' }).status,
    ).toBe('invalid');
    expect(
      compileRankingSelection({
        ...selection.selection,
        npLevelBasis: { kind: 'specified', npLevel: 1 },
      }).status,
    ).toBe('invalid');
    expect(
      applyRankingSelectionCommand(defaults, { kind: 'setGrowthBasis', value: 'saved' }).status,
    ).toBe('invalid');
  });
  it('replays pinned values after a saved build changes', () => {
    const ranking = calculateRankingPolicy(single, profile, selection.selection, versions);
    const calculated = Object.values(ranking.profileResults).find(
      (entry) => entry.status === 'calculated',
    );
    expect(calculated?.status).toBe('calculated');
    if (calculated?.status !== 'calculated') throw new Error(JSON.stringify(ranking.exclusions));
    const request = createRankingPortableRequest(
      calculated.detail,
      currentCalculationVersionContext(master),
    );
    const before = executePortableCalculation(request, master);
    const changed = {
      ...build,
      fouAtk: 2000,
      skills: Object.fromEntries(servant.skills.map(({ slot }) => [String(slot), 10])),
    };
    calculateRankingPolicy(
      single,
      { servantBuilds: { [servant.id]: changed } },
      selection.selection,
      versions,
    );
    const after = executePortableCalculation(request, master);
    expect(after).toEqual(before);
    expect(after.status).toBe('executed');
  });
});
