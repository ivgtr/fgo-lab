import { describe, expect, it } from 'vitest';
import { masterSnapshotSchema, masterEffectSchema, type MasterEffect } from '@fgo-lab/master-data';
import { createStackMaster, source as stack, stackEffectTemplate } from './stackQuantityFixture';
import { calculateScenarioWithPolicy } from './scenario';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { calculateRankingPolicyDetail } from './rankingProfileCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { compileRankingContributionPolicy } from './contributionPolicy';
import {
  currentCalculationVersionContext,
  createRankingPortableRequest,
  executePortableCalculation,
} from './portableCalculation';
import { SCHEMA_VERSION, APP_VERSION, portableCalculationRequestSchema } from '@fgo-lab/schema';

const route = {
  target: 'sourceSelf',
  contributionScope: 'personal',
  eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
} as const;
const template = {
  ...stackEffectTemplate,
  id: 'oracle',
  occurrenceId: 'oracle:0',
  gameActivation: 'skillUse',
  proc: { kind: 'guaranteed' },
  selection: null,
  inputDefinitions: [],
  requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
};
function fixture() {
  const master = createStackMaster();
  const actor = master.servants[0]!;
  const grant = masterEffectSchema.parse({
    ...template,
    execution: [
      {
        kind: 'grantOcBoost',
        route,
        lifetime: 'active',
        stacking: 'additive',
        stateTraits: ['positive'],
        cells: [
          Array.from({ length: 10 }, () => ({
            stages: 1,
            applicationRatePermille: 1000,
            turns: { kind: 'unlimited' },
            uses: { kind: 'finite', remaining: 1 },
          })),
          [],
          [],
          [],
          [],
        ],
      },
    ],
  });
  actor.skills = [
    {
      id: 'boost',
      name: 'OC boost',
      detail: '',
      imageKey: null,
      priority: 0,
      slot: 1,
      resourceRequirement: null,
      effects: [grant],
    },
  ];
  actor.actorFormGraph.forms.forEach((form) => {
    form.skillIds = ['boost'];
  });
  for (const group of actor.noblePhantasmVariantGroups)
    for (const variant of group.variants) {
      if (variant.kind !== 'attack') continue;
      for (const damage of variant.damage)
        damage.parametersByOvercharge.forEach((row, oc) =>
          row.forEach((cell) => {
            cell.valuePermille = oc === 0 ? 3000 : 6000;
          }),
        );
      const execution: MasterEffect['execution'] = [
        {
          kind: 'damageModifier',
          modifier: 'attackBuff',
          sign: -1,
          card: null,
          route,
          semanticSupport: 'supported',
          values: [[0], [0], [0], [0], [0]],
          valueExpressions: [null, 1, 1, 1, 1].map((value) => [
            value === null
              ? null
              : {
                  kind: 'stackLinear',
                  sources: [stack],
                  basePermille: 0,
                  perUnitPermille: 100,
                  maximumUnits: 4,
                  maximumValuePermille: null,
                },
          ]) as Extract<
            MasterEffect['execution'][number],
            { kind: 'damageModifier' }
          >['valueExpressions'],
        },
      ];
      variant.effects = [
        {
          ...masterEffectSchema.parse({
            ...template,
            id: 'tradeoff',
            occurrenceId: 'tradeoff:0',
            gameActivation: 'npBeforeDamage',
            inputDefinitions: [stack],
            execution,
          }),
          timing: 'beforeDamage',
        },
      ];
    }
  return masterSnapshotSchema.parse(master);
}

describe('OC candidate complete-domain oracle', () => {
  it('retains an interior stack optimum visible only in an alternate OC cell', () => {
    const master = fixture();
    const actor = master.servants[0]!;
    const conditions = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied' as const,
    };
    const contributionPolicy = compileRankingContributionPolicy(conditions);
    const versions = {
      ...currentCalculationVersionContext(master),
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const detail = calculateRankingPolicyDetail(
      actor,
      master,
      { servantBuilds: {} },
      conditions,
      versions,
    );
    expect(detail.status).toBe('calculated');
    if (detail.status !== 'calculated') return;
    const outcomes = [false, true].flatMap((useBoost) =>
      [0, 1, 2, 3, 4].map((count) => {
        const scenario = applyCanonicalInputCommand(
          {
            ...detail.detail.scenario,
            preNoblePhantasmPlan: [
              ...(useBoost
                ? [
                    {
                      kind: 'useSkillSlot' as const,
                      slot: 1 as const,
                      skillLevel: 10,
                      choice: null,
                    },
                  ]
                : []),
              { kind: 'executeAttackNoblePhantasm' as const },
            ],
          },
          { kind: 'setCanonicalIntegerInput', key: stack.key, value: count },
        );
        const execution = calculateScenarioWithPolicy(
          scenario,
          master,
          versions,
          contributionPolicy,
        );
        expect(execution.result.status).toBe('calculated');
        return {
          useBoost,
          count,
          execution,
          average:
            execution.result.status === 'calculated' ? execution.result.rows[0].average : -Infinity,
        };
      }),
    );
    const best = outcomes.reduce((best, next) => (next.average > best.average ? next : best));
    expect(best).toMatchObject({ useBoost: true, count: 3 });
    expect(detail.detail.result.rows[0].average).toBe(best.average);
    expect(detail.detail.scenario.canonicalInputValues[stack.key]?.value).toBe(3);
    expect(detail.detail.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(2);
    if (best.execution.status === 'executable')
      expect(detail.detail.input).toEqual(best.execution.input);
  });
});

it('separates an NP1 selected scenario NP5 column from independently optimized NP5', () => {
  const master = fixture();
  const actor = master.servants[0]!;
  actor.skills[0]!.effects.push(
    masterEffectSchema.parse({
      ...template,
      id: 'cost',
      occurrenceId: 'cost:0',
      execution: [
        {
          kind: 'damageModifier',
          modifier: 'attackBuff',
          sign: -1,
          card: null,
          route,
          semanticSupport: 'supported',
          values: [Array(10).fill(250), [], [], [], []],
          valueExpressions: [Array(10).fill(null), [], [], [], []],
        },
      ],
    }),
  );
  for (const group of actor.noblePhantasmVariantGroups)
    for (const variant of group.variants) {
      variant.effects = [];
      if (variant.kind !== 'attack') continue;
      for (const damage of variant.damage)
        damage.parametersByOvercharge.forEach((row, oc) =>
          row.forEach((cell, np) => {
            cell.valuePermille = oc > 0 && np === 4 ? 6000 : 3000;
          }),
        );
    }
  const checked = masterSnapshotSchema.parse(master);
  const versions = {
    ...currentCalculationVersionContext(checked),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const results = ([1, 5] as const).map((npLevel) =>
    calculateRankingPolicyDetail(
      checked.servants[0]!,
      checked,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, npLevelBasis: { kind: 'specified', npLevel } },
      versions,
    ),
  );
  const [np1, np5] = results;
  expect(np1?.status).toBe('calculated');
  expect(np5?.status).toBe('calculated');
  if (np1?.status !== 'calculated' || np5?.status !== 'calculated') return;
  expect(np1.detail.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(1);
  expect(np5.detail.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(2);
  expect(np5.detail.result.rows[4].average).toBeGreaterThan(np1.detail.result.rows[4].average);
  for (const detail of [np1.detail, np5.detail]) {
    const replay = calculateScenarioWithPolicy(
      detail.scenario,
      checked,
      versions,
      detail.contributionPolicy,
    );
    expect(replay.result).toEqual(detail.result);
    if (replay.status === 'executable') expect(replay.input).toEqual(detail.input);
    expect(replay.appliedPreparationActions).toEqual(detail.appliedPreparationActions);
  }
});

// A scoped world quantity replays its witness; an unscoped battle point read fails closed.
it.each(['attackerHpPermille', 'battlePointPhase'] as const)(
  'handles an OC prerequisite quantity %s under its original policy',
  (quantity) => {
    const master = fixture();
    const actor = master.servants[0]!;
    const effect = actor.skills[0]!.effects[0]!;
    effect.requirement.expression = {
      kind: 'quantity',
      quantity,
      comparison: quantity === 'attackerHpPermille' ? 'atMost' : 'atLeast',
      value: quantity === 'attackerHpPermille' ? 500 : 1,
    };
    const context = currentCalculationVersionContext(master);
    const versions = {
      ...context,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const policy = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied' as const,
    };
    const outcome = calculateRankingPolicyDetail(
      actor,
      master,
      { servantBuilds: {} },
      policy,
      versions,
    );
    if (quantity === 'battlePointPhase') {
      expect(outcome.status).toBe('unsupported');
      if (outcome.status === 'unsupported')
        expect(outcome.reason).toBe('candidateExecutionUnsupported');
      return;
    }
    if (outcome.status !== 'calculated') throw new Error(JSON.stringify(outcome));
    const detail = outcome.detail;
    expect(detail.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(2);
    expect(detail.scenario.attackerHpPermille).toBeLessThanOrEqual(500);
    const request = createRankingPortableRequest(detail, context);
    const replay = executePortableCalculation(request, master);
    expect(replay.status).toBe('executed');
    if (request.executionIntent.kind !== 'ranking') throw new Error('ranking intent required');
    expect(
      executePortableCalculation(
        portableCalculationRequestSchema.parse({
          ...request,
          executionIntent: {
            ...request.executionIntent,
            policy: { ...request.executionIntent.policy, conditionalEffects: 'baseline' },
          },
        }),
        master,
      ),
    ).toMatchObject({
      status: 'invalid',
      detail: 'ranking_basis_invalid',
    });
    if (replay.status !== 'executed' || replay.execution.status !== 'executable')
      throw new Error(JSON.stringify(replay));
    expect(replay.execution.input).toEqual(detail.input);
    expect(replay.execution.result).toEqual(detail.result);
    expect(replay.execution.appliedPreparationActions).toEqual(detail.appliedPreparationActions);
  },
);
