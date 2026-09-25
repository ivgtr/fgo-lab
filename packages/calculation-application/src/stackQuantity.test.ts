import {
  master,
  servant,
  source,
  createStackMaster,
  stackEffectTemplate,
} from './stackQuantityFixture';
import { describe, expect, it } from 'vitest';
import { masterSnapshotSchema, stackInputSchema, npDamageSpecSchema } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  damageResolutionInputSchema,
} from '@fgo-lab/schema';
import {
  calculateScenario,
  calculateScenarioWithPolicy,
  createDefaultResolvedScenario,
} from './scenario';
import { applyCanonicalInputCommand } from './canonicalInputs';
import {
  applyEffectControlPresentationDecision,
  applyEffectPresentationDecision,
} from './effectDecision';
import { createCanonicalInputValueDomains } from './rankingCanonicalInputs';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  createRankingPortableRequest,
  executePortableCalculation,
  currentCalculationVersionContext,
} from './portableCalculation';

const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('canonical stack quantity', () => {
  it('routes a stack-owned NP trait control through its physical count', () => {
    const data = createStackMaster(source, 250, ['fixture-stack']);
    const attacker = data.servants[0]!;
    const base = createDefaultResolvedScenario(data, undefined, attacker);
    const initial = calculateScenario(base, data, versions);
    const control = initial.effectControls.find(
      ({ projection }) =>
        projection.decision.state !== 'none' &&
        projection.decision.kind === 'worldFact' &&
        projection.decision.fact.kind === 'trait' &&
        projection.decision.fact.scope === 'attackerState' &&
        projection.decision.fact.trait === 'fixture-stack',
    );
    expect(control).toBeDefined();
    if (!control) throw new Error('stack control fixture');
    const enabled = applyEffectControlPresentationDecision(
      base,
      control,
      true,
      initial.activationRequirements,
      initial.effects,
      initial.effectInputs,
    );
    expect(enabled.canonicalInputValues[source.key]).toEqual({ kind: 'integer', value: 1 });
    expect(enabled.worldFactAssertions).toEqual([]);
    const active = calculateScenario(enabled, data, versions);
    expect(active.result.status).toBe('calculated');
    if (active.status !== 'executable') throw new Error('stack execution');
    expect(active.effectControls.find(({ key }) => key === control.key)?.active).toBe(true);
    expect(active.input.npSpecialMultipliers).toEqual(Array(5).fill(1.25));
    const excluded = applyEffectControlPresentationDecision(
      enabled,
      control,
      false,
      active.activationRequirements,
      active.effects,
      active.effectInputs,
    );
    expect(excluded.canonicalInputValues[source.key]).toEqual({ kind: 'integer', value: 0 });
    expect(excluded.worldFactAssertions).toEqual([]);
    const inactive = calculateScenario(excluded, data, versions);
    expect(inactive.result.status).toBe('calculated');
    if (inactive.status !== 'executable') throw new Error('stack execution');
    expect(inactive.effectControls.find(({ key }) => key === control.key)?.active).toBe(false);
    expect(inactive.input.npSpecialMultipliers).toEqual(Array(5).fill(1));

    const twoStacks = applyCanonicalInputCommand(base, {
      kind: 'setCanonicalIntegerInput',
      key: source.key,
      value: 2,
    });
    expect(
      applyEffectControlPresentationDecision(
        twoStacks,
        control,
        true,
        initial.activationRequirements,
        initial.effects,
        initial.effectInputs,
      ).canonicalInputValues[source.key],
    ).toEqual({ kind: 'integer', value: 2 });

    if (
      control.projection.decision.state === 'none' ||
      control.projection.decision.kind !== 'worldFact' ||
      control.projection.decision.fact.kind !== 'trait'
    )
      throw new Error('world fact fixture');
    const mismatched = {
      ...control.projection,
      decision: {
        ...control.projection.decision,
        fact: { ...control.projection.decision.fact, scope: 'targetState' as const },
      },
    };
    const otherScope = applyEffectPresentationDecision(base, mismatched, true, []);
    expect(otherScope.canonicalInputValues[source.key]).toBeUndefined();
    expect(otherScope.worldFactAssertions).toEqual([
      { decisionKey: mismatched.decision.decisionKey, fact: mismatched.decision.fact },
    ]);
    expect(() =>
      applyEffectPresentationDecision(
        base,
        { ...control.projection, requiredInputs: [source, source] },
        true,
        [],
      ),
    ).toThrow('ambiguous_stack_presence_input');

    const contradiction = {
      ...base,
      worldFactAssertions: [
        {
          decisionKey: 'external:contradiction',
          fact: {
            kind: 'trait' as const,
            scope: 'attackerState' as const,
            trait: 'fixture-stack',
            present: true,
          },
        },
      ],
    };
    expect(calculateScenario(contradiction, data, versions).result.status).toBe('unsupported');
  });
  it('preserves a non-minimum baseline and enumerates the complete finite integer domain', () => {
    const input = { ...source, defaultValue: 2 };
    expect(createCanonicalInputValueDomains([input], [], 'baseline')[0]?.values).toEqual([2]);
    expect(createCanonicalInputValueDomains([input], [], 'satisfied')[0]?.values).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(stackInputSchema.safeParse({ ...input, defaultValue: 5 }).success).toBe(false);
    const np = servant.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (np.kind !== 'attack') throw new Error('fixture');
    expect(
      npDamageSpecSchema.safeParse({ ...np.damage[0], quantity: { kind: 'finiteTraits' } }).success,
    ).toBe(false);
    expect(
      stackInputSchema.safeParse({
        ...input,
        quantitySource: { scope: 'targetState', trait: 'fixture-stack' },
      }).success,
    ).toBe(false);
  });
  it.each([0, 1, 4])('executes an exact initial stack count %i through the calculator', (count) => {
    const scenario = applyCanonicalInputCommand(
      createDefaultResolvedScenario(master, undefined, servant),
      { kind: 'setCanonicalIntegerInput', key: source.key, value: count },
    );
    const actual = calculateScenario(scenario, master, versions);
    expect(actual.result.status).toBe('calculated');
    if (actual.status !== 'executable') throw new Error('execution');
    expect(actual.input.npSpecialMultipliers).toEqual(Array(5).fill(1 + count * 0.25));
  });
  it('selects the maximum and replays the same count, policy and complete input', () => {
    const result = calculateRankingPolicyDetail(
      servant,
      master,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions,
    );
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') throw new Error(JSON.stringify(result));
    const detail = result.detail;
    const exhaustive = Array.from({ length: 5 }, (_, count) => {
      const scenario = applyCanonicalInputCommand(detail.scenario, {
        kind: 'setCanonicalIntegerInput',
        key: source.key,
        value: count,
      });
      const candidate = calculateScenarioWithPolicy(
        scenario,
        master,
        versions,
        detail.contributionPolicy,
        { initialNpGauge: detail.candidateEvidence.startNpGauge },
      );
      if (candidate.result.status !== 'calculated') throw new Error('oracle');
      return candidate.result.rows[0].average;
    });
    expect(detail.result.rows[0].average).toBe(Math.max(...exhaustive));
    expect(detail.scenario.canonicalInputValues[source.key]).toEqual({
      kind: 'integer',
      value: 4,
      origin: 'maximum',
    });
    const portable = createRankingPortableRequest(detail, currentCalculationVersionContext(master));
    const replay = executePortableCalculation(portable, master);
    expect(replay.status).toBe('executed');
    if (replay.status !== 'executed' || replay.execution.status !== 'executable')
      throw new Error('replay');
    expect(replay.execution.input).toEqual(detail.input);
    expect(replay.execution.result).toEqual(detail.result);
  });
  it.each([
    ['addTrait', 2, 5],
    ['removeTrait', 1, 0],
  ] as const)(
    'applies ordered %s after seeding without reseeding',
    (mutation, multiplier, finalCount) => {
      const changed = masterSnapshotSchema.parse({
        ...master,
        servants: [
          {
            ...servant,
            noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
              ...group,
              variants: group.variants.map((variant) => ({
                ...variant,
                effects: [
                  {
                    ...stackEffectTemplate,
                    id: 'remove-stack',
                    occurrenceId: 'remove-stack:0',
                    gameActivation: 'npBeforeDamage',
                    timing: 'beforeDamage',
                    proc: { kind: 'guaranteed' },
                    inputDefinitions: [],
                    selection: null,
                    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
                    execution: [
                      {
                        kind: 'contextMutation',
                        mutation,
                        scope: 'recipientState',
                        trait: 'fixture-stack',
                        damageRelevant: true,
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
                      },
                    ],
                  },
                ],
              })),
            })),
          },
        ],
      });
      const scenario = applyCanonicalInputCommand(
        createDefaultResolvedScenario(changed, undefined, changed.servants[0]),
        { kind: 'setCanonicalIntegerInput', key: source.key, value: 4 },
      );
      const result = calculateScenario(scenario, changed, versions);
      expect(result.result.status).toBe('calculated');
      if (result.status !== 'executable') throw new Error('execution');
      expect(result.input.npSpecialMultipliers).toEqual(Array(5).fill(multiplier));
      expect(result.input.stackStateCounts?.attackerState['fixture-stack']).toBe(finalCount);
      expect(result.scenario).toMatchObject({
        canonicalInputValues: { [source.key]: { value: 4 } },
      });
    },
  );

  it('keeps a count above the trait-array limit sparse and rejects contradictory presence', () => {
    const largeSource = { ...source, maximum: 101 };
    const data = createStackMaster(largeSource, 1);
    const scenario = applyCanonicalInputCommand(
      createDefaultResolvedScenario(data, undefined, data.servants[0]),
      { kind: 'setCanonicalIntegerInput', key: source.key, value: 101 },
    );
    const result = calculateScenario(scenario, data, versions);
    if (result.status !== 'executable') throw new Error('execution');
    expect(result.result.status).toBe('calculated');
    expect(result.input.npSpecialMultipliers).toEqual(Array(5).fill(1.101));
    expect(result.input.attackerStateTraits).toEqual(['fixture-stack']);
    expect(result.input.stackStateCounts?.attackerState['fixture-stack']).toBe(101);
    expect(damageResolutionInputSchema.safeParse(result.input).success).toBe(true);
    expect(
      damageResolutionInputSchema.safeParse({ ...result.input, attackerStateTraits: [] }).success,
    ).toBe(false);
  });

  it('rejects a stack count that contradicts an explicit absent world fact', () => {
    const scenario = applyCanonicalInputCommand(
      createDefaultResolvedScenario(master, undefined, servant),
      { kind: 'setCanonicalIntegerInput', key: source.key, value: 4 },
    );
    scenario.worldFactAssertions = [
      {
        decisionKey: 'world:absent-stack',
        fact: { kind: 'trait', scope: 'attackerState', trait: 'fixture-stack', present: false },
      },
    ];
    expect(calculateScenario(scenario, master, versions).result.status).toBe('unsupported');
  });

  it.each([-1, 5])('rejects invalid explicit quantity %i without a numeric fallback', (count) => {
    const scenario = applyCanonicalInputCommand(
      createDefaultResolvedScenario(master, undefined, servant),
      { kind: 'setCanonicalIntegerInput', key: source.key, value: count },
    );
    expect(calculateScenario(scenario, master, versions).result.status).not.toBe('calculated');
  });
});
