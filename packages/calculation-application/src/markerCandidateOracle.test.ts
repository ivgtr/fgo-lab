import { expect, it } from 'vitest';
import { masterEffectSchema, masterSnapshotSchema } from '@fgo-lab/master-data';
import { SCHEMA_VERSION, APP_VERSION } from '@fgo-lab/schema';
import { createStackMaster, stackEffectTemplate } from './stackQuantityFixture';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { calculateScenarioWithPolicy } from './scenario';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { compileRankingContributionPolicy } from './contributionPolicy';
import { currentCalculationVersionContext } from './portableCalculation';

it('preserves the legal marker maximum against independent enumeration of every skill subset and order', () => {
  const fixture = createStackMaster();
  const actor = fixture.servants[0]!;
  const make = (id: string, execution: unknown[], expression: unknown = { kind: 'always' }) =>
    masterEffectSchema.parse({
      ...stackEffectTemplate,
      id,
      occurrenceId: id,
      gameActivation: 'skillUse',
      proc: { kind: 'guaranteed' },
      selection: null,
      inputDefinitions: [],
      requirement: { recipient: 'sourceSelf', expression },
      execution,
    });
  const marker = {
    kind: 'buffInstanceMutation',
    mutation: 'grant',
    recipient: 'sourceSelf',
    traits: ['oracle-marker'],
    lifetime: 'active',
    marker: {
      actorTrait: 'oracle-actor',
      buffIdentity: 'oracle-marker',
      removable: true,
      onField: false,
      recipientSide: 'both',
    },
  };
  const modifier = {
    kind: 'damageModifier',
    modifier: 'attackBuff',
    sign: 1,
    card: null,
    route: {
      target: 'sourceSelf',
      contributionScope: 'personal',
      eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
    },
    semanticSupport: 'supported',
    values: [Array(10).fill(1000), [], [], [], []],
    valueExpressions: [Array(10).fill(null), [], [], [], []],
  };
  actor.skills = [
    {
      id: 'grant',
      name: 'grant',
      detail: '',
      imageKey: null,
      priority: 0,
      slot: 1,
      resourceRequirement: null,
      effects: [make('grant', [marker])],
    },
    {
      id: 'read',
      name: 'read',
      detail: '',
      imageKey: null,
      priority: 0,
      slot: 2,
      resourceRequirement: null,
      effects: [
        make('read', [modifier], {
          kind: 'trait',
          scope: 'recipientState',
          trait: 'oracle-marker',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        }),
      ],
    },
  ];
  actor.passives = [];
  for (const form of actor.actorFormGraph.forms) form.skillIds = ['grant', 'read'];
  for (const group of actor.noblePhantasmVariantGroups)
    for (const variant of group.variants) variant.effects = [];
  const master = masterSnapshotSchema.parse(fixture);
  const servant = master.servants[0]!;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
    const conditions = { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects };
    const detail = calculateRankingPolicyDetail(
      servant,
      master,
      { servantBuilds: {} },
      conditions,
      versions,
    );
    expect(detail.status).toBe('calculated');
    if (detail.status !== 'calculated') throw new Error(detail.status);
    const outcomes = [[], [1], [2], [1, 2], [2, 1]].map((order) => {
      const scenario = {
        ...detail.detail.scenario,
        preNoblePhantasmPlan: [
          ...order.map((slot) => ({
            kind: 'useSkillSlot' as const,
            slot: slot as 1 | 2,
            skillLevel: 10,
            choice: null,
          })),
          { kind: 'executeAttackNoblePhantasm' as const },
        ],
      };
      const result = calculateScenarioWithPolicy(
        scenario,
        master,
        versions,
        compileRankingContributionPolicy(conditions),
      ).result;
      expect(result.status).toBe('calculated');
      return { order, damage: result.status === 'calculated' ? result.rows[0].average : -Infinity };
    });
    const best = outcomes.reduce((best, next) => (next.damage > best.damage ? next : best));
    expect(
      best.order,
      JSON.stringify({
        outcomes,
        selected: detail.detail.scenario.preNoblePhantasmPlan,
        input: detail.detail.input,
      }),
    ).toEqual([1, 2]);
    expect(detail.detail.result.rows[0].average).toBe(best.damage);
    expect(
      detail.detail.scenario.preNoblePhantasmPlan
        .filter((command) => command.kind === 'useSkillSlot')
        .map((command) => command.slot),
    ).toEqual([1, 2]);
  }
});
