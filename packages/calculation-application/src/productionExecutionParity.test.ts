import { liveTraitQuantityRead } from '@fgo-lab/battle-execution';
import { commonPreparationSkillLevels } from './rankingBasis';
import { calculateScenarioWithPolicy } from './scenario';
import { createRankingPortableRequest } from './portableCalculation';
import { createStaticAttackProfiles } from './attackProfile';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  servantStackInputs,
} from '@fgo-lab/battle-execution';
import { calculateRankingPolicyDetail } from './rankingProfileCalculation';
import { calculateRankingCandidateSet } from './rankingPolicyCandidates';
import { unresolvedProfileResult } from './rankingProfileOutcome';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  currentCalculationVersionContext,
  createCalculatorPortableRequest,
  executePortableCalculation,
  attemptPortableCalculationScenarioChange,
  resetPortableCalculationRequest,
} from './portableCalculation';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';

const root = resolve(import.meta.dirname, '../../..');
let loaded: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;
const loadMaster = () =>
  (loaded ??= readFile(
    resolve(root, 'packages/test-fixtures/production-master/master.json'),
    'utf8',
  ).then((content) => masterSnapshotSchema.parse(JSON.parse(content))));

describe('production execution parity ratchet', () => {
  it('executes every reachable default calculator scenario through preparation actions', async () => {
    const master = await loadMaster();
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const typedUnsupported = new Set<string>();
    const targetInputRequired = new Set([
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
    ]);
    const records = master.servants.flatMap((servant) => {
      if (
        planPreNoblePhantasmCandidates(
          servant,
          master.npResourceSemantics,
          commonPreparationSkillLevels(servant),
          1,
          1,
        ).candidates.length === 0
      )
        return [];
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const calculation = calculateScenario(scenario, master, versions);
      // E2E-A032-ORDER
      expect(calculation.result.status, `${servant.id}:${servant.name}`).toBe(
        typedUnsupported.has(servant.id)
          ? 'unsupported'
          : targetInputRequired.has(servant.id)
            ? 'inputRequired'
            : 'calculated',
      );
      if (targetInputRequired.has(servant.id))
        expect(calculation.result.issues).toMatchObject([
          { code: 'invalidTargetContext:ambiguousTargetResult:' },
        ]);
      expect(calculation.appliedPreparationActions).toHaveLength(
        scenario.preNoblePhantasmPlan.length,
      );
      return [
        {
          attackerId: servant.id,
          initialActorFormId: scenario.attacker.initialActorFormId,
          plan: scenario.preNoblePhantasmPlan,
          noblePhantasmVariant: calculation.noblePhantasmVariant?.ref ?? null,
          input: calculation.input,
          rows: calculation.result.rows,
        },
      ];
    });

    expect(records).toHaveLength(422);
    expect(
      records
        .filter(({ attackerId }) => typedUnsupported.has(attackerId))
        .map(({ attackerId }) => attackerId),
    ).toEqual([]);
    expect(records.filter(({ attackerId }) => targetInputRequired.has(attackerId))).toHaveLength(
      targetInputRequired.size,
    );
    const digest = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    // production audit: old 422-record digest is reconstructed by restoring only the approved input/rows.
    expect(digest).toBe('c276b2d215d7c84a4a9dd6a3896bfe62a839a482dd9b36a5dc65b865d7dcee7b');
  }, 60_000);
});

// Acceptance identities select evidence only; execution is entirely canonical.
it('connects attack buff counts through selected variants, NP/OC, portable recovery and four ranking policies', async () => {
  const master = await loadMaster();
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records = [];
  for (const id of ['1000900', '1101600']) {
    const actor = master.servants.find((actor) => actor.id === id)!;
    const inputs = servantStackInputs(actor).filter((input) => input.instanceTraits !== undefined);
    expect(inputs).toHaveLength(1);
    const input = inputs[0]!;
    const countSkill = actor.skills.find((skill) =>
      skill.effects.some((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' && operation.amount.kind === 'buffCount',
        ),
      ),
    )!;
    for (const count of [0, 1, 10]) {
      const context = {
        stochasticSelection: { kind: 'declared' as const },
        resourceSemantics: master.npResourceSemantics,
        npLevel: 2 as const,
        overcharge: 1 as const,
        initialGauge: 10_000,
        stackInputs: servantStackInputs(actor),
        canonicalInputValues: { [input.key]: count },
      };
      const initial = createPreNoblePhantasmState(
        actor,
        actor.actorFormGraph.defaultInitialFormId,
        context,
      );
      if (initial.status !== 'applied') throw new Error(initial.code);
      expect(
        liveTraitQuantityRead(initial.state, {
          scope: 'attackerState',
          trait: input.quantitySource.trait,
        }).value,
      ).toBe(count);
      const result = reducePreNoblePhantasmAction(
        actor,
        initial.state,
        { kind: 'useSkillSlot', slot: countSkill.slot, skillLevel: 10, choice: null },
        context,
      );
      if (result.status !== 'applied') throw new Error(result.code);
      const coefficient = countSkill.effects
        .flatMap((effect) => effect.execution)
        .find(
          (operation) =>
            operation.kind === 'resourceMutation' && operation.amount.kind === 'buffCount',
        )!;
      if (coefficient.kind !== 'resourceMutation' || coefficient.amount.kind !== 'buffCount')
        throw new Error('coefficient');
      expect(result.state.npResource.gauge).toBe(
        Math.min(20_000, 10_000 + count * coefficient.amount.values[0][9]!),
      );
      expect(
        liveTraitQuantityRead(result.state, {
          scope: 'attackerState',
          trait: input.quantitySource.trait,
        }).value,
      ).toBe(0);
      expect(result.state.buffInstances).toHaveLength(1);
      expect(result.state.buffInstances[0]).toMatchObject({
        actor: 'attacker',
        traits: [...new Set(input.instanceTraits)].sort(),
        count: 0,
      });
      expect(
        liveTraitQuantityRead(initial.state, {
          scope: 'attackerState',
          trait: input.quantitySource.trait,
        }).value,
      ).toBe(count);
    }
    for (const npLevel of [1, 2, 5] as const)
      for (const selfBuffs of ['included', 'excluded'] as const)
        for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
          const ranking = calculateRankingPolicyDetail(
            actor,
            master,
            { servantBuilds: {} },
            {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              npLevelBasis: { kind: 'specified', npLevel },
              selfBuffs,
              conditionalEffects,
            },
            versions,
          );
          expect(ranking.status, JSON.stringify('reason' in ranking ? ranking.reason : null)).toBe(
            'calculated',
          );
          if (ranking.status !== 'calculated') throw new Error('ranking');
          const replay = calculateScenario(ranking.detail.scenario, master, versions);
          expect(replay.result.rows).toEqual(ranking.detail.result.rows);
          if (selfBuffs === 'included')
            expect(replay.effectInputs.some((item) => item.key === input.key)).toBe(true);
          const request = createCalculatorPortableRequest(
            ranking.detail.scenario,
            currentCalculationVersionContext(master),
          );
          const portable = executePortableCalculation(request, master);
          if (portable.status !== 'executed') throw new Error('portable');
          expect(portable.execution.result).toEqual(replay.result);
          records.push({
            id,
            npLevel,
            selfBuffs,
            conditionalEffects,
            input: replay.input,
            rows: replay.result.rows,
            plan: ranking.detail.scenario.preNoblePhantasmPlan,
            inputs: ranking.detail.scenario.canonicalInputValues,
          });
          if (npLevel !== 2 || selfBuffs !== 'included' || conditionalEffects !== 'satisfied')
            continue;
          if (id === '1101600') {
            const beyondNpRead = structuredClone(ranking.detail.scenario);
            beyondNpRead.canonicalInputValues[input.key] = { kind: 'integer', value: 11 };
            beyondNpRead.preNoblePhantasmPlan = [{ kind: 'executeAttackNoblePhantasm' }];
            expect(calculateScenarioOutcome(beyondNpRead, master, versions).result.status).toBe(
              'inputRequired',
            );
            beyondNpRead.canonicalInputValues[input.key] = { kind: 'integer', value: 10 };
            expect(calculateScenarioOutcome(beyondNpRead, master, versions).result.status).toBe(
              'calculated',
            );
            beyondNpRead.canonicalInputValues[input.key] = { kind: 'integer', value: 11 };
            beyondNpRead.preNoblePhantasmPlan = [
              { kind: 'useSkillSlot', slot: countSkill.slot, skillLevel: 10, choice: null },
              { kind: 'executeAttackNoblePhantasm' },
            ];
            expect(calculateScenarioOutcome(beyondNpRead, master, versions).result.status).toBe(
              'calculated',
            );
          }
          // Independent finite oracle: every integer initial count and every ordered skill subset.
          const permutations = (slots: readonly number[]): number[][] => [
            [],
            ...slots.flatMap((slot) =>
              permutations(slots.filter((other) => other !== slot)).map((tail) => [slot, ...tail]),
            ),
          ];
          const averages: number[] = [];
          for (let count = 0; count <= input.maximum; count++)
            for (const slots of permutations([1, 2, 3])) {
              const scenario = structuredClone(ranking.detail.scenario);
              scenario.canonicalInputValues[input.key] = { kind: 'integer', value: count };
              scenario.preNoblePhantasmPlan = [
                ...slots.map((slot) => ({
                  kind: 'useSkillSlot' as const,
                  slot: slot as 1 | 2 | 3,
                  skillLevel: 10,
                  choice: null,
                })),
                { kind: 'executeAttackNoblePhantasm' },
              ];
              let execution: ReturnType<typeof calculateScenarioOutcome>;
              try {
                execution = calculateScenarioOutcome(scenario, master, versions);
              } catch (cause) {
                throw new Error(
                  `buff count scenario ${id} NP${npLevel} count${count} slots${slots.join(',')}`,
                  { cause },
                );
              }
              if (execution.result.status === 'calculated')
                averages.push(execution.result.rows[1].average);
            }
          expect(ranking.detail.result.rows[1].average).toBe(Math.max(...averages));
          const invalid = structuredClone(ranking.detail.scenario);
          invalid.canonicalInputValues[input.key] = { kind: 'integer', value: input.maximum + 1 };
          const failed = attemptPortableCalculationScenarioChange(
            request,
            replay.result,
            invalid,
            master,
          );
          expect(
            failed,
            JSON.stringify({
              id,
              result: failed.status === 'committed' ? failed.result : failed.failure,
            }),
          ).toMatchObject({ status: 'committed', result: { status: 'inputRequired' } });
          if (failed.status !== 'committed') throw new Error('repairable count');
          const retry = attemptPortableCalculationScenarioChange(
            failed.request,
            failed.result,
            ranking.detail.scenario,
            master,
          );
          expect(retry.status).toBe('committed');
          if (retry.status !== 'committed') throw new Error('retry');
          expect(retry.result).toEqual(replay.result);
          const malformed = structuredClone(ranking.detail.scenario);
          malformed.canonicalInputValues[input.key] = { kind: 'integer', value: 0.5 };
          const invalidAttempt = attemptPortableCalculationScenarioChange(
            request,
            replay.result,
            malformed,
            master,
          );
          expect(invalidAttempt.status).toBe('rejected');
          if (invalidAttempt.status !== 'rejected') throw new Error('malformed count');
          expect(invalidAttempt.retainedRequest).toBe(request);
          expect(invalidAttempt.retainedResult).toBe(replay.result);
          const reset = resetPortableCalculationRequest(request);
          const resetResult = executePortableCalculation(reset, master);
          expect(resetResult.status).toBe('executed');
        }
  }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'attack-buff-count-acceptance.json'),
      `${JSON.stringify(records, null, 2)}\n`,
    );
}, 60_000);

it('accepts all seven population-count profiles through calculator, four ranking policies and portable recovery', async () => {
  const master = await loadMaster();
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records = [];
  for (const id of ['106200', '306000', '306200', '502600', '1001800', '2501600']) {
    const actor = master.servants.find((actor) => actor.id === id)!;
    const candidateSets = new Map<string, ReturnType<typeof calculateRankingCandidateSet>>();
    const rankingFor = (
      profile: ReturnType<typeof createStaticAttackProfiles>[number],
      npLevel: 1 | 2 | 5,
      selfBuffs: 'included' | 'excluded',
      conditionalEffects: 'baseline' | 'satisfied',
    ) => {
      const key = `${npLevel}:${selfBuffs}:${conditionalEffects}`;
      let candidateSet = candidateSets.get(key);
      if (!candidateSet) {
        candidateSet = calculateRankingCandidateSet(
          actor,
          master,
          { servantBuilds: {} },
          {
            ...DEFAULT_RANKING_POLICY_CONDITIONS,
            npLevelBasis: { kind: 'specified', npLevel },
            selfBuffs,
            conditionalEffects,
          },
          versions,
          true,
        );
        candidateSets.set(key, candidateSet);
      }
      return unresolvedProfileResult(candidateSet, profile);
    };
    for (const profile of createStaticAttackProfiles(actor)) {
      for (const npLevel of [1, 2, 5] as const) {
        const ranking = rankingFor(profile, npLevel, 'included', 'baseline');
        expect(
          ranking.status,
          JSON.stringify({ id, npLevel, reason: 'reason' in ranking ? ranking.reason : null }),
        ).toBe('calculated');
        if (ranking.status !== 'calculated') throw new Error('population baseline');
        const replay = calculateScenario(ranking.detail.scenario, master, versions);
        expect(replay.result.rows).toEqual(ranking.detail.result.rows);
        const request = createCalculatorPortableRequest(
          ranking.detail.scenario,
          currentCalculationVersionContext(master),
        );
        const portable = executePortableCalculation(request, master);
        expect(portable.status).toBe('executed');
        if (portable.status !== 'executed') throw new Error('population portable');
        expect(portable.execution.result).toEqual(replay.result);
        records.push({
          id,
          profile,
          npLevel,
          status: ranking.status,
          input: replay.input,
          rows: replay.result.rows,
          inputs: ranking.detail.scenario.canonicalInputValues,
          plan: ranking.detail.scenario.preNoblePhantasmPlan,
        });
        if (id === '106200' && npLevel === 2) {
          const countSkill = actor.skills.find((skill) =>
            skill.effects.some((effect) =>
              effect.inputDefinitions.some((input) => input.kind === 'populationCount'),
            ),
          )!;
          const count = countSkill.effects
            .flatMap((effect) => effect.inputDefinitions)
            .find((input) => input.kind === 'populationCount')!;
          const inconsistent = structuredClone(ranking.detail.scenario);
          if (
            !inconsistent.preNoblePhantasmPlan.some(
              (command) => command.kind === 'useSkillSlot' && command.slot === countSkill.slot,
            )
          )
            inconsistent.preNoblePhantasmPlan.unshift({
              kind: 'useSkillSlot',
              slot: countSkill.slot,
              skillLevel: 10,
              choice: null,
            });
          inconsistent.canonicalInputValues['population:allies:additional'] = {
            kind: 'integer',
            value: 0,
          };
          inconsistent.canonicalInputValues['population:enemies:additional'] = {
            kind: 'integer',
            value: 0,
          };
          inconsistent.canonicalInputValues[count.key] = { kind: 'integer', value: 1 };
          inconsistent.worldFactAssertions.push(
            ...(['dragon', 'lamia'] as const).map((trait) => ({
              decisionKey: `population:attackerState:${trait}:absent`,
              fact: {
                kind: 'trait' as const,
                scope: 'attackerState' as const,
                trait,
                present: false,
              },
            })),
          );
          const failed = attemptPortableCalculationScenarioChange(
            request,
            replay.result,
            inconsistent,
            master,
          );
          expect(failed).toMatchObject({
            status: 'committed',
            result: { status: 'inputRequired' },
          });
          if (failed.status !== 'committed') throw new Error('population input');
          const failedReplay = executePortableCalculation(failed.request, master);
          if (failedReplay.status !== 'executed') throw new Error('population recovery inputs');
          expect(
            failedReplay.execution.effectInputs.filter((input) => input.kind === 'populationSize'),
          ).toHaveLength(2);
          const repaired = structuredClone(inconsistent);
          repaired.canonicalInputValues['population:allies:additional'] = {
            kind: 'integer',
            value: 1,
          };
          const retry = attemptPortableCalculationScenarioChange(
            failed.request,
            failed.result,
            repaired,
            master,
          );
          expect(retry).toMatchObject({ status: 'committed', result: { status: 'calculated' } });
          expect(
            executePortableCalculation(resetPortableCalculationRequest(request), master).status,
          ).toBe('executed');
        }
      }
      for (const selfBuffs of ['included', 'excluded'] as const)
        for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
          const ranking = rankingFor(profile, 2, selfBuffs, conditionalEffects);
          records.push({
            id,
            profile,
            npLevel: 2,
            selfBuffs,
            conditionalEffects,
            status: ranking.status,
            ...('reason' in ranking ? { reason: ranking.reason } : {}),
            ...(ranking.status === 'calculated'
              ? {
                  inputs: ranking.detail.scenario.canonicalInputValues,
                  input: ranking.detail.input,
                  rows: ranking.detail.result.rows,
                  plan: ranking.detail.scenario.preNoblePhantasmPlan,
                  candidateCount: ranking.detail.executionMetrics.worldCandidateCount,
                  evidence: ranking.detail.candidateEvidence,
                }
              : {}),
          });
          expect(
            ranking.status,
            JSON.stringify({
              id,
              selfBuffs,
              conditionalEffects,
              ...('reason' in ranking ? { reason: ranking.reason } : {}),
            }),
          ).toBe('calculated');
          if (ranking.status === 'calculated') {
            const replay = calculateScenario(ranking.detail.scenario, master, versions);
            expect(replay.result.rows).toEqual(ranking.detail.result.rows);
            const portable = executePortableCalculation(
              createCalculatorPortableRequest(
                ranking.detail.scenario,
                currentCalculationVersionContext(master),
              ),
              master,
            );
            expect(portable.status).toBe('executed');
            if (portable.status === 'executed')
              expect(portable.execution.result).toEqual(replay.result);
          }
        }
    }
  }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'population-count-acceptance.json'),
      JSON.stringify(records, null, 2) + '\n',
    );
}, 60000);

it('accepts NP and charge transfer profiles through all seven conditions and portable replay', async () => {
  const master = await loadMaster();
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records = [];
  const conditions = [
    ...([1, 2, 5] as const).map((npLevel) => ({
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      npLevelBasis: { kind: 'specified' as const, npLevel },
    })),
    ...(['included', 'excluded'] as const).flatMap((selfBuffs) =>
      (['baseline', 'satisfied'] as const).map((conditionalEffects) => ({
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevelBasis: { kind: 'specified' as const, npLevel: 2 as const },
        selfBuffs,
        conditionalEffects,
      })),
    ),
  ];
  for (const id of ['304000', '1102300', '2500400']) {
    const actor = master.servants.find((actor) => actor.id === id)!;
    for (const profile of createStaticAttackProfiles(actor))
      for (const condition of conditions) {
        const ranking = calculateRankingPolicyDetail(
          actor,
          master,
          { servantBuilds: {} },
          condition,
          versions,
          profile,
        );
        records.push({
          id,
          profile,
          condition,
          status: ranking.status,
          ...('reason' in ranking ? { reason: ranking.reason } : {}),
          ...(ranking.status === 'calculated'
            ? {
                input: ranking.detail.input,
                rows: ranking.detail.result.rows,
                scenario: ranking.detail.scenario,
                candidateCount: ranking.detail.executionMetrics.worldCandidateCount,
                evidence: ranking.detail.candidateEvidence,
              }
            : {}),
        });
        if (ranking.status === 'calculated') {
          const replay = calculateScenario(ranking.detail.scenario, master, versions);
          expect(replay.result.rows).toEqual(ranking.detail.result.rows);
          const portable = executePortableCalculation(
            createCalculatorPortableRequest(
              ranking.detail.scenario,
              currentCalculationVersionContext(master),
            ),
            master,
          );
          expect(portable.status).toBe('executed');
          if (portable.status === 'executed')
            expect(portable.execution.result).toEqual(replay.result);
        }
      }
  }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'np-transfer-acceptance.json'),
      JSON.stringify(records, null, 2) + '\n',
    );
  expect(records.filter((record) => record.status !== 'calculated')).toEqual([]);
}, 60000);

it('replays nonzero transfer inputs and repairs invalid portable donor quantities for each production source', async () => {
  const master = await loadMaster();
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records = [];
  for (const id of ['304000', '1102300', '2500400']) {
    const actor = master.servants.find((actor) => actor.id === id)!;
    const ranking = calculateRankingPolicyDetail(
      actor,
      master,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, npLevelBasis: { kind: 'specified', npLevel: 5 } },
      versions,
      createStaticAttackProfiles(actor)[0],
    );
    if (ranking.status !== 'calculated') throw new Error('transfer admission');
    const scenario = structuredClone(ranking.detail.scenario);
    scenario.initialOvercharge = 2;
    const inputs = actor.skills
      .flatMap((skill) => skill.effects.flatMap((effect) => effect.inputDefinitions))
      .filter((input) => input.kind === 'transferDonor');
    for (const input of inputs)
      scenario.canonicalInputValues[input.key] = {
        kind: 'integer',
        value: input.resource === 'playerNp' ? 3000 : 1,
      };
    const calculation = calculateScenario(scenario, master, versions);
    expect(calculation.result.status).toBe('calculated');
    const request = createCalculatorPortableRequest(
      scenario,
      currentCalculationVersionContext(master),
    );
    const replay = executePortableCalculation(request, master);
    expect(replay.status).toBe('executed');
    if (replay.status !== 'executed') throw new Error('portable transfer');
    expect(replay.execution.result).toEqual(calculation.result);
    const broken = structuredClone(scenario);
    broken.canonicalInputValues[inputs[0]!.key] = { kind: 'integer', value: -1 };
    const attempt = attemptPortableCalculationScenarioChange(
      request,
      calculation.result,
      broken,
      master,
    );
    expect(attempt.status).toBe('committed');
    if (attempt.status !== 'committed') throw new Error('repair scenario');
    const failed = executePortableCalculation(attempt.request, master);
    expect(failed.status).toBe('executed');
    if (failed.status !== 'executed') throw new Error('repair input');
    expect(failed.execution.result.status).toBe('inputRequired');
    expect(failed.execution.effectInputs.some((input) => input.key === inputs[0]!.key)).toBe(true);
    const repaired = attemptPortableCalculationScenarioChange(
      attempt.request,
      attempt.result,
      scenario,
      master,
    );
    expect(repaired.status).toBe('committed');
    if (repaired.status === 'committed') {
      const again = executePortableCalculation(repaired.request, master);
      expect(again.status).toBe('executed');
      if (again.status === 'executed') expect(again.execution.result).toEqual(calculation.result);
    }
    records.push({
      id,
      scenario,
      input: calculation.input,
      rows: calculation.result.rows,
      actions: calculation.appliedPreparationActions,
      repaired: repaired.status,
    });
  }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'np-transfer-positive-recovery.json'),
      JSON.stringify(records, null, 2) + '\n',
    );
});

it('accepts HP profiles through all seven conditions and portable replay', async () => {
  const master = await loadMaster();
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records = [];
  const conditions = [
    ...([1, 2, 5] as const).map((npLevel) => ({
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      npLevelBasis: { kind: 'specified' as const, npLevel },
    })),
    ...(['included', 'excluded'] as const).flatMap((selfBuffs) =>
      (['baseline', 'satisfied'] as const).map((conditionalEffects) => ({
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevelBasis: { kind: 'specified' as const, npLevel: 2 as const },
        selfBuffs,
        conditionalEffects,
      })),
    ),
  ];
  for (const id of ['204300', '403600', '702500']) {
    const actor = master.servants.find((actor) => actor.id === id)!;
    for (const profile of createStaticAttackProfiles(actor))
      for (const condition of conditions) {
        const ranking = calculateRankingPolicyDetail(
          actor,
          master,
          { servantBuilds: {} },
          condition,
          versions,
          profile,
        );
        records.push({
          id,
          profile,
          condition,
          status: ranking.status,
          ...('reason' in ranking ? { reason: ranking.reason } : {}),
          ...(ranking.status === 'calculated'
            ? {
                input: ranking.detail.input,
                rows: ranking.detail.result.rows,
                scenario: ranking.detail.scenario,
                candidateCount: ranking.detail.executionMetrics.worldCandidateCount,
                evidence: ranking.detail.candidateEvidence,
              }
            : {}),
        });
        if (ranking.status === 'calculated') {
          const replay = requireExecutableCalculation(
            calculateScenarioWithPolicy(
              ranking.detail.scenario,
              master,
              versions,
              ranking.detail.contributionPolicy,
              { initialNpGauge: ranking.detail.candidateEvidence.startNpGauge },
            ),
          );
          expect(
            replay.result.rows,
            JSON.stringify({ id, condition, scenario: ranking.detail.scenario }),
          ).toEqual(ranking.detail.result.rows);
          const portable = executePortableCalculation(
            createRankingPortableRequest(ranking.detail, currentCalculationVersionContext(master)),
            master,
          );
          expect(portable.status).toBe('executed');
          if (portable.status === 'executed')
            expect(portable.execution.result).toEqual(replay.result);
        }
      }
  }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'hp-acceptance.json'),
      JSON.stringify(records, null, 2) + '\n',
    );
  expect(records.filter((record) => record.status !== 'calculated')).toEqual([]);
}, 60000);
