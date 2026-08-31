import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  activationFactKey,
  activationSourceKey,
  calculationScenarioSchema,
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateRankingDetail, DEFAULT_RANKING_CONDITIONS } from './ranking';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  compileRankingExecutionPlan,
  executeRankingScenarios,
  selectRankingExecutionIndexes,
} from './rankingPolicyScenario';
import {
  calculateScenario as calculateScenarioOutcome,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

const root = resolve(import.meta.dirname, '../../..');
const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };

const preparationFacts = (
  execution: Pick<ReturnType<typeof calculateRankingDetail>, 'appliedPreparationActions'>,
) => execution.appliedPreparationActions.flatMap(({ activationFacts }) => activationFacts);

describe('ranking activation-local canonical facts', () => {
  let master: Awaited<ReturnType<typeof loadMaster>>;
  let versions: {
    schemaVersion: typeof SCHEMA_VERSION;
    masterDataVersion: string;
    engineVersion: typeof ENGINE_VERSION;
    appVersion: typeof APP_VERSION;
    gameRegion: 'JP';
    masterDataLocale: 'ja-JP';
  };

  beforeAll(async () => {
    master = await loadMaster();
    versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    };
  });

  it.each([
    ['603800', [23_557.645, 31_410.36, 35_336.71, 37_299.905, 39_263.075]],
    ['705300', [36_795.27, 49_060.53, 55_193.155, 58_259.47, 61_325.785]],
    ['2501100', [35_622.36, 47_496.64, 53_433.785, 56_402.36, 59_370.945]],
  ])('selects the maximum satisfiable choice candidate for %s', (servantId, averages) => {
    const servant = master.servants.find(({ id }) => id === servantId)!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(detail.result.status).toBe('calculated');
    expect(detail.result.rows.map(({ average }) => average)).toEqual(averages);
    const included = new Set(
      detail.scenario.effectDecisions
        .filter(({ operationEnabled }) => operationEnabled)
        .map(({ decisionKey }) => decisionKey),
    );
    expect(
      detail.effects.filter(
        (effect) => included.has(effect.projectionKey) && effect.explanation.code === 'unresolved',
      ),
    ).toEqual([]);
    const facts = preparationFacts(detail);
    expect(facts.length).toBeGreaterThan(0);
    const candidatesByGroup = new Map<string, Set<string>>();
    for (const fact of facts) {
      if (fact.kind !== 'choice') continue;
      const group = JSON.stringify([fact.source, fact.family]);
      const candidates = candidatesByGroup.get(group) ?? new Set<string>();
      candidates.add(fact.candidate);
      candidatesByGroup.set(group, candidates);
    }
    expect([...candidatesByGroup.values()].every((candidates) => candidates.size === 1)).toBe(true);
  });

  it('does not let a stronger choice override the attack-NP resource precondition', () => {
    const servant = master.servants.find(({ id }) => id === '101000')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(detail.result.status).toBe('calculated');
    expect(detail.result.rows.map(({ average }) => average)).toEqual([
      42_092.175, 52_615.345, 57_876.935, 60_507.73, 63_138.515,
    ]);
    expect(preparationFacts(detail)).toEqual([]);
    expect(detail.appliedPreparationActions.map(({ command }) => command)).not.toContainEqual(
      expect.objectContaining({ kind: 'useSkillSlot', slot: 3 }),
    );
  });

  it.each([
    ['204900', [45_307.295, 60_409.895, 67_961.14, 71_736.845, 75_512.49]],
    ['2800500', [28_656.495, 38_138.835, 42_879.995, 45_250.57, 47_621.16]],
  ])('materializes operation-trigger facts for %s', (servantId, averages) => {
    const servant = master.servants.find(({ id }) => id === servantId)!;
    const plan = compileRankingExecutionPlan(
      servant,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    const executions = executeRankingScenarios(
      plan.preparedRankingScenarios,
      master,
      versions,
      plan.contributionProjections,
    );
    const selected = selectRankingExecutionIndexes(executions, plan.attackProfiles, 1);
    const detail = [...selected.values()]
      .map((index) => executions[index]!)
      .find(
        (candidate) =>
          candidate.result.status === 'calculated' &&
          candidate.result.rows.map(({ average }) => average).join(',') === averages.join(','),
      );
    expect(detail).toBeDefined();
    if (!detail) throw new TypeError(`expected ranking detail:${servantId}`);
    expect(preparationFacts(detail).some((fact) => fact.kind === 'operationTrigger')).toBe(true);
    expect(detail.result.status).toBe('calculated');
    expect(detail.result.rows.map(({ average }) => average)).toEqual(averages);
    if (detail.scenario.mode !== 'resolved') throw new TypeError('expected resolved scenario');
    const included = new Set(
      detail.scenario.effectDecisions
        .filter(({ operationEnabled }) => operationEnabled)
        .map(({ decisionKey }) => decisionKey),
    );
    expect(
      detail.effects.filter(
        (effect) => included.has(effect.projectionKey) && effect.explanation.code === 'unresolved',
      ),
    ).toEqual([]);
  });

  it('does not execute a face-card attack trigger while preparing one attack NP', () => {
    const servant = master.servants.find(({ id }) => id === '2301200')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(preparationFacts(detail).some((fact) => fact.kind === 'operationTrigger')).toBe(false);
    expect(
      detail.scenario.preNoblePhantasmPlan.some(
        (command) => command.kind === 'useSkillSlot' && command.slot === 3,
      ),
    ).toBe(false);
  });

  it('uses one choice fact to apply every operation in the selected Beni-enma candidate', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const selectedChoiceFacts = preparationFacts(detail).filter((fact) => fact.kind === 'choice');
    expect(selectedChoiceFacts).toHaveLength(1);
    expect(
      detail.effects
        .filter(
          (effect) =>
            effect.outcome === 'applied' &&
            effect.skillName === 'くらくらの膳 A' &&
            (effect.modifier === 'attackBuff' || effect.modifier === 'npDamageBuff'),
        )
        .map(({ modifier }) => modifier)
        .sort(),
    ).toEqual(['attackBuff', 'npDamageBuff']);
    const selectedSource = activationSourceKey(selectedChoiceFacts[0]!.source);
    const sourceQuantityFacts = preparationFacts(detail).filter(
      (fact) =>
        fact.kind === 'sourceQuantity' && activationSourceKey(fact.source) === selectedSource,
    );
    expect(sourceQuantityFacts).toHaveLength(1);
  });

  it('rejects a Beni-enma command with an unavailable choice', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const crafted = {
      ...detail.scenario,
      preNoblePhantasmPlan: detail.scenario.preNoblePhantasmPlan.map((command) =>
        command.kind === 'useSkillSlot' && command.choice
          ? { ...command, choice: { ...command.choice, candidateKey: 'unavailable' } }
          : command,
      ),
    };
    expect(calculationScenarioSchema.safeParse(crafted).success).toBe(true);
    expect(calculateScenarioOutcome(crafted, master, versions).result).toMatchObject({
      status: 'unsupported',
      issues: [{ code: 'preparation:choiceUnavailable' }],
    });
  });

  it('rejects an orphan activation fact', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const source = preparationFacts(detail)[0]!.source;
    const crafted = {
      ...detail.scenario,
      activationFacts: [
        ...detail.scenario.activationFacts,
        { kind: 'operationTrigger' as const, source, position: 999 },
      ].sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right))),
    };
    const unknown = calculateScenario(crafted, master, versions);
    expect(unknown.result.status).toBe('unsupported');
    expect(unknown.result.issues.some((issue) => issue.code.includes('orphanFact'))).toBe(true);
  });

  it('round-trips canonical activation facts without changing Beni-enma damage', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const restored = calculationScenarioSchema.parse(JSON.parse(JSON.stringify(detail.scenario)));
    if (restored.mode !== 'resolved') throw new TypeError('expected resolved scenario');
    const result = calculateScenario(restored, master, versions);
    expect(restored.activationFacts).toEqual([]);
    expect(result.input).toEqual(detail.input);
    expect(result.result).toEqual(detail.result);
    expect(result.appliedPreparationActions).toEqual(detail.appliedPreparationActions);
  });
});

async function loadMaster() {
  return masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
}
