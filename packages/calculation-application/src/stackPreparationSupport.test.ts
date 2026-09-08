import { describe, expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  type CanonicalEffectRequirement,
  type MasterEffect,
  type StackSource,
} from '@fgo-lab/master-data';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  servantStackInputs,
} from '@fgo-lab/battle-execution';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { master, servant, source, stackEffectTemplate } from './stackQuantityFixture';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  createCalculatorPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  attemptPortableCalculationScenarioChange,
} from './portableCalculation';

function fixture(scope: StackSource['scope'], mutation: 'addTrait' | 'removeTrait') {
  const input = {
    ...source,
    key: `stack:${scope}:fixture-stack`,
    owner: scope === 'field' ? 'field' : scope === 'targetState' ? 'target' : 'attacker',
    quantitySource: { scope, trait: 'fixture-stack' },
  };
  const effect = (id: string, execution: MasterEffect['execution']) => ({
    ...stackEffectTemplate,
    id,
    occurrenceId: `${id}:0`,
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    execution,
  });
  const change = effect('change', [
    {
      kind: 'contextMutation',
      mutation,
      scope: scope === 'field' ? 'field' : 'recipientState',
      trait: 'fixture-stack',
      damageRelevant: true,
      route: {
        target: scope === 'targetState' ? 'enemy' : 'sourceSelf',
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
      },
    },
  ]);
  const gain = {
    ...effect('gain', [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[5000], [], [], [], []] },
      },
    ]),
    inputDefinitions: [input],
    requirement: {
      recipient: 'sourceSelf',
      expression: { kind: 'inputQuantity', inputKey: input.key, comparison: 'atLeast', value: 1 },
    },
  };
  const skills = [change, gain].map((item, index) => ({
    id: `s${index}`,
    name: `s${index}`,
    slot: index + 1,
    detail: '',
    imageKey: '',
    effects: [item],
    resourceRequirement: null,
  }));
  const data = masterSnapshotSchema.parse({
    ...master,
    servants: [
      {
        ...servant,
        skills,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
          })),
        },
      },
    ],
  });
  const scenario = createDefaultResolvedScenario(data, undefined, data.servants[0]);
  scenario.preNoblePhantasmPlan = [
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    { kind: 'executeAttackNoblePhantasm' },
  ];
  return { data, scenario, input };
}
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('preparation stack support boundary', () => {
  it.each(['attackerState', 'targetState', 'field'] as const)(
    'rejects stale %s counts before committing a resource transaction',
    (scope) => {
      for (const mutation of ['addTrait', 'removeTrait'] as const) {
        const { data, scenario, input } = fixture(scope, mutation);
        for (const count of [0, 1, 4]) {
          scenario.canonicalInputValues[input.key] = { kind: 'integer', value: count };
          const before = structuredClone(scenario);
          const result = calculateScenario(scenario, data, versions, { initialNpGauge: 5000 });
          expect(result.result.status).toBe('unsupported');
          expect(result.result.issues).toContainEqual({
            code: 'preparation:unsupportedPreparationStackQuantity',
            detail: 'preparation:fixture-saber:useSkillSlot',
          });
          expect(scenario).toEqual(before);
        }
      }
    },
  );

  it('keeps nested/count comparison failures transactional and repeatable', () => {
    const { data, input } = fixture('attackerState', 'removeTrait');
    const actor = data.servants[0]!;
    const context = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 1 as const,
      overcharge: 1 as const,
      initialGauge: 5000,
      stackInputs: servantStackInputs(actor),
      canonicalInputValues: { [input.key]: 4 },
    };
    const created = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (created.status !== 'applied') throw new Error('fixture');
    const requirements: CanonicalEffectRequirement[] = ['atLeast', 'atMost', 'equal'].map(
      (comparison) => ({
        kind: 'inputQuantity',
        inputKey: input.key,
        comparison: comparison as 'atLeast' | 'atMost' | 'equal',
        value: 1,
      }),
    );
    requirements.push({
      kind: 'all',
      requirements: [
        requirements[0]!,
        {
          kind: 'any',
          requirements: [{ kind: 'not', requirement: requirements[1]! }, requirements[2]!],
        },
      ],
    });
    for (const requirement of requirements) {
      actor.skills[1]!.effects[0]!.requirement.expression = requirement;
      for (let retry = 0; retry < 2; retry++) {
        const result = reducePreNoblePhantasmAction(
          actor,
          created.state,
          { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
          context,
        );
        expect(result).toMatchObject({
          status: 'rejected',
          code: 'unsupportedPreparationStackQuantity',
        });
        expect(result.state).toBe(created.state);
        expect(created.state.npResource.gauge).toBe(5000);
        expect(created.state.usedSkillSlots.size).toBe(0);
      }
    }
  });

  it('does not hide unsupported preparation behind a ranking baseline or portable replay', () => {
    const { data, scenario } = fixture('targetState', 'removeTrait');
    const ranking = calculateRankingPolicyDetail(
      data.servants[0]!,
      data,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions,
    );
    expect(ranking.status).toBe('unsupported');
    const request = createCalculatorPortableRequest(
      scenario,
      currentCalculationVersionContext(data),
    );
    expect(executePortableCalculation(request, data).status).toBe('unsupported');
    const original = createCalculatorPortableRequest(
      createDefaultResolvedScenario(data, undefined, data.servants[0]),
      currentCalculationVersionContext(data),
    );
    const previous = executePortableCalculation(original, data);
    if (previous.status !== 'executed') throw new Error('baseline fixture');
    const attempted = attemptPortableCalculationScenarioChange(
      original,
      previous.execution.result,
      scenario,
      data,
    );
    // Valid edits retain their unsupported diagnostic; schema-invalid edits are rejected.
    expect(attempted.status).toBe('committed');
    if (attempted.status !== 'committed') throw new Error('expected diagnostic');
    expect(attempted.result.status).toBe('unsupported');
    const invalid = attemptPortableCalculationScenarioChange(
      original,
      previous.execution.result,
      { ...scenario, initialOvercharge: 9 as 1 },
      data,
    );
    expect(invalid.status).toBe('rejected');
    if (invalid.status !== 'rejected') throw new Error('expected rejection');
    expect(invalid.retainedRequest).toEqual(original);
    expect(invalid.retainedResult).toEqual(previous.execution.result);
  });

  it('rejects a stack-dependent transform NP before consuming its gauge', () => {
    const { data } = fixture('field', 'addTrait');
    const actor = data.servants[0]!;
    const transformed = masterSnapshotSchema.parse({
      ...data,
      servants: [
        {
          ...actor,
          noblePhantasmVariantGroups: actor.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((variant) => ({
              ...variant,
              kind: 'nonAttack',
              effects: [
                {
                  ...actor.skills[1]!.effects[0],
                  gameActivation: 'npBeforeDamage',
                  timing: 'beforeDamage',
                },
              ],
            })),
          })),
        },
      ],
    });
    const selected = transformed.servants[0]!;
    const context = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 1 as const,
      overcharge: 1 as const,
      initialGauge: 10_000,
      stackInputs: servantStackInputs(selected),
    };
    const created = createPreNoblePhantasmState(
      selected,
      selected.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (created.status !== 'applied') throw new Error('fixture');
    const result = reducePreNoblePhantasmAction(
      selected,
      created.state,
      { kind: 'useTransformNoblePhantasm' },
      context,
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'unsupportedPreparationStackQuantity',
    });
    expect(result.state).toBe(created.state);
    expect(result.state.npResource.gauge).toBe(10_000);
    expect(result.state.transformNoblePhantasmUsed).toBe(false);
  });
});
