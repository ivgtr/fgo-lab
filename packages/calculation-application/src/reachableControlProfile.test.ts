import type { RankingCandidateEvent } from './rankingCandidateBatch';
import { evaluateRankingCandidateBatch } from './rankingCandidateBatch';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { calculationScenarioSchema, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { applyEffectControlPresentationDecision } from './effectDecision';
import { attackProfileKey } from './attackProfile';
import { preparationChoiceOptions, setPreparationSkillChoice } from './scenarioCommands';
import {
  calculateScenario,
  createDefaultCalculatorScenario,
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  requireExecutableCalculation,
} from './scenario';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';

const occurrenceIds = ['22883:0', '22888:0', '22874:0'] as const;
let master: MasterDataSnapshot;
beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
        'utf8',
      ),
    ),
  );
});

function fixture() {
  const servant = master.servants.find(({ id }) => id === '2301100')!;
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
    masterDataVersion: master.version,
  };
  const calculate = (scenario: ReturnType<typeof createDefaultResolvedScenario>) =>
    requireExecutableCalculation(
      evaluatePreparedCalculationScenario(
        prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }, {}, true),
        versions,
      ),
    );
  return { servant, versions, calculate };
}

describe('reachable control profile', () => {
  it('keeps the choice command separate from three effect controls and recovers on re-enable and restore', () => {
    const { servant, calculate } = fixture();
    const dayScenario = createDefaultResolvedScenario(master, undefined, servant);
    const day = calculate(dayScenario);
    const uiScenario = createDefaultCalculatorScenario(master, undefined, servant);
    const ui = calculate(uiScenario);
    const choice = preparationChoiceOptions(ui.appliedPreparationActions, servant).find(
      ({ slot, choice }) => slot === 2 && choice.candidateKey === '0',
    );
    expect(choice).toBeDefined();
    expect(choice?.active).toBe(false);
    const moonScenario = setPreparationSkillChoice(uiScenario, choice!, ui.effects);
    expect(moonScenario.effectDecisions).toEqual([]);
    const moon = calculate(moonScenario);
    expect(moon.noblePhantasmVariant?.ref.noblePhantasmId).toBe('2301198');
    expect(moon.profileContinuity?.kind).toBe('matched');
    for (const occurrenceId of occurrenceIds) {
      const dayControl = day.effectControls.find(
        ({ projection }) => projection.source.effectOccurrenceId === occurrenceId,
      )!;
      const dayOn = calculate(
        applyEffectControlPresentationDecision(
          dayScenario,
          dayControl,
          true,
          day.activationRequirements,
          day.effects,
          day.effectInputs,
        ),
      );
      expect(dayOn.result.status).toBe('unsupported');
      if (dayOn.result.status === 'unsupported')
        expect(dayOn.result.missingEvidence).toEqual([
          expect.stringContaining('constraintConflict:selected-form:'),
        ]);

      const control = moon.effectControls.find(
        ({ projection }) => projection.source.effectOccurrenceId === occurrenceId,
      )!;
      const offScenario = applyEffectControlPresentationDecision(
        moonScenario,
        control,
        false,
        moon.activationRequirements,
        moon.effects,
        moon.effectInputs,
      );
      const off = calculate(offScenario);
      const reonScenario = applyEffectControlPresentationDecision(
        offScenario,
        off.effectControls.find(({ key }) => key === control.key)!,
        true,
        off.activationRequirements,
        off.effects,
        off.effectInputs,
      );
      const reon = calculate(reonScenario);
      const restored = calculate(
        calculationScenarioSchema.parse(
          JSON.parse(JSON.stringify(reonScenario)),
        ) as typeof reonScenario,
      );
      const projection = (calculation: typeof moon) =>
        calculation.effects.find(({ projectionKey }) => projectionKey === control.key)!;
      const event = (calculation: typeof moon) =>
        calculation.executionObservation?.targetExecution?.selection === 'selected'
          ? calculation.executionObservation.targetExecution.operationEvents.find(
              ({ operationId }) => operationId === control.projection.operationId,
            )
          : undefined;
      expect([
        moon.result.status,
        off.result.status,
        reon.result.status,
        restored.result.status,
      ]).toEqual(['calculated', 'calculated', 'calculated', 'calculated']);
      expect([projection(moon).outcome, projection(off).outcome, projection(reon).outcome]).toEqual(
        ['applied', 'notApplied', 'applied'],
      );
      expect([event(moon)?.operationOutcome, event(off)?.operationOutcome]).toEqual([
        'applied',
        'notApplied',
      ]);
      expect(
        reon.input[control.projection.modifier as 'attackBuff' | 'npDamageBuff' | 'cardBuff'],
      ).toBeGreaterThan(
        off.input[control.projection.modifier as 'attackBuff' | 'npDamageBuff' | 'cardBuff'],
      );
      expect(reon.input).toEqual(restored.input);
      expect(reon.result).toEqual(restored.result);
      expect(reon.profileContinuity).toEqual(off.profileContinuity);
    }
  });

  it('materializes the same moon attack profile through ranking without changing calculator commands', () => {
    const { servant, versions, calculate } = fixture();
    const uiScenario = createDefaultCalculatorScenario(master, undefined, servant);
    const ui = calculate(uiScenario);
    const option = preparationChoiceOptions(ui.appliedPreparationActions, servant).find(
      ({ slot, choice }) => slot === 2 && choice.candidateKey === '0',
    )!;
    const moon = calculate(setPreparationSkillChoice(uiScenario, option, ui.effects));
    const plan = compileRankingExecutionPlan(
      servant,
      master,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
    );
    const batchEvents: RankingCandidateEvent[] = [];
    evaluateRankingCandidateBatch(plan, master, versions, undefined, true, (event) =>
      batchEvents.push(event),
    );
    const index = Array.from(plan.candidateDescriptors)
      .map((candidate) => candidate.scenario)
      .findIndex(
        (scenario) =>
          scenario.preNoblePhantasmPlan.some(
            (command) =>
              command.kind === 'useSkillSlot' &&
              command.slot === 2 &&
              command.choice?.candidateKey === '0',
          ) &&
          scenario.preNoblePhantasmPlan.some(
            (command) => command.kind === 'useSkillSlot' && command.slot === 3,
          ),
      );
    expect(index).toBeGreaterThanOrEqual(0);
    const ranking = requireExecutableCalculation(
      evaluatePreparedCalculationScenario(
        batchEvents.map(({ prepared }) => prepared)[index]!,
        versions,
      ),
    );
    expect(ranking.result.status).toBe('calculated');
    expect(ranking.noblePhantasmVariant?.canonicalId).toBe(moon.noblePhantasmVariant?.canonicalId);
    expect(attackProfileKey(Array.from(plan.candidateDescriptors)[index]!.attackProfile)).toBe(
      moon.profileContinuity?.kind === 'matched' ? moon.profileContinuity.intendedProfileKey : null,
    );
    for (const occurrenceId of occurrenceIds)
      expect(
        ranking.effects.find(({ source }) => source.effectOccurrenceId === occurrenceId)?.outcome,
      ).toBe('applied');
  });

  it('separates fixed true, fixed false, unresolved, card and competing choice inputs', () => {
    const { servant, calculate } = fixture();
    const uiScenario = createDefaultCalculatorScenario(master, undefined, servant);
    const ui = calculate(uiScenario);
    const choices = preparationChoiceOptions(ui.appliedPreparationActions, servant);
    const moonChoice = choices.find(
      ({ slot, choice }) => slot === 2 && choice.candidateKey === '0',
    )!;
    const dayChoice = choices.find(
      ({ slot, choice }) => slot === 2 && choice.candidateKey === '1',
    )!;
    const moonScenario = setPreparationSkillChoice(uiScenario, moonChoice, ui.effects);
    const moon = calculate(moonScenario);
    const control = moon.effectControls.find(
      ({ projection }) => projection.source.effectOccurrenceId === '22874:0',
    )!;
    expect(control.projection.outcome).toBe('applied');
    expect(JSON.stringify(control.projection.explanation.condition)).toContain('activeOnly');

    const dayScenario = setPreparationSkillChoice(moonScenario, dayChoice, moon.effects);
    expect(dayScenario.effectDecisions).toEqual([]);
    const day = calculate(dayScenario);
    const dayControl = day.effectControls.find(({ key }) => key === control.key)!;
    const dayOnScenario = applyEffectControlPresentationDecision(
      dayScenario,
      dayControl,
      true,
      day.activationRequirements,
      day.effects,
      day.effectInputs,
    );
    const dayOn = calculate(dayOnScenario);
    expect(dayOn.result.status).toBe('unsupported');
    expect(dayOnScenario.worldFactAssertions).toEqual([]);
    const competingFact = calculate({
      ...moonScenario,
      worldFactAssertions: [
        {
          decisionKey: 'fixture:competing-form',
          fact: { kind: 'trait', scope: 'attacker', trait: 'traitId:3122', present: true },
        },
      ],
    });
    expect(competingFact.result.status).toBe('unsupported');
    expect(
      competingFact.effects.find(({ projectionKey }) => projectionKey === control.key)?.outcome,
    ).not.toBe('applied');

    const noFixedServant = {
      ...servant,
      passives: servant.passives.map((passive) => ({
        ...passive,
        effects: passive.effects.filter(({ occurrenceId }) => occurrenceId !== '22871:0'),
      })),
    };
    const noFixedMaster = masterSnapshotSchema.parse({ ...master, servants: [noFixedServant] });
    const noFixedScenario = createDefaultResolvedScenario(
      noFixedMaster,
      undefined,
      noFixedMaster.servants[0],
    );
    const noFixedBase = requireExecutableCalculation(
      calculateScenario(noFixedScenario, noFixedMaster, {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: noFixedMaster.version,
      }),
    );
    const noFixedControl = noFixedBase.effectControls.find(({ key }) => key === control.key)!;
    const assumedScenario = applyEffectControlPresentationDecision(
      noFixedScenario,
      noFixedControl,
      true,
      noFixedBase.activationRequirements,
      noFixedBase.effects,
      noFixedBase.effectInputs,
    );
    expect(assumedScenario.worldFactAssertions).toEqual([]);
    expect(assumedScenario.effectDecisions).toContainEqual(
      expect.objectContaining({ operationEnabled: true, conditionSatisfaction: 'assumeSatisfied' }),
    );
    const unresolved = requireExecutableCalculation(
      calculateScenario(assumedScenario, noFixedMaster, {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: noFixedMaster.version,
      }),
    );
    expect(unresolved.result.status).toBe('calculated');
    expect(
      unresolved.effects.find(({ projectionKey }) => projectionKey === control.key)?.outcome,
    ).toBe('applied');

    const nonArtsServant = {
      ...servant,
      noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
        ...group,
        variants: group.variants.map((variant) =>
          variant.ref.noblePhantasmId === '2301198'
            ? { ...variant, card: 'buster' as const }
            : variant,
        ),
      })),
    };
    const nonArtsMaster = masterSnapshotSchema.parse({ ...master, servants: [nonArtsServant] });
    const nonArts = requireExecutableCalculation(
      calculateScenario(moonScenario, nonArtsMaster, {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: nonArtsMaster.version,
      }),
    );
    expect(nonArts.result.status).toBe('calculated');
    expect(
      nonArts.effects.find(({ projectionKey }) => projectionKey === control.key)?.outcome,
    ).toBe('impossible');
    expect(nonArts.input.cardBuff).toBeLessThan(moon.input.cardBuff);
    expect(
      nonArts.effectiveContributions.contributions.find(
        ({ contributionId }) => contributionId === control.projection.contributionId,
      )?.effective,
    ).toBe(false);
  });
});
