import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import effectSourcesGolden from '../../test-fixtures/golden/ordered-effect-execution-v1.json';
import { executeOrderedScenario, prepareOrderedScenario } from '@fgo-lab/battle-execution';
import { masterSnapshotSchema, type CanonicalEffectRequirement } from '@fgo-lab/master-data';
import type { TargetPredicate } from '@fgo-lab/schema';
import {
  calculationScenarioSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  applyEffectConditionDecision,
  applyEffectPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
import { resolveCanonicalInputValues } from './canonicalInputs';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenario,
  rematerializePreparedCalculationInputs,
  requireExecutableCalculation,
  resolveScenarioPreparationOutcome,
} from './scenario';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { executeRankingScenarios } from './rankingExecution';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { rankingEffectContributes } from './rankingContribution';
import { createRankingRow } from './rankingRows';

const master = masterSnapshotSchema.parse(fixture);
type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

type MutableEffectContainer = {
  effects?: Record<string, unknown>[];
  resourceRequirement?: unknown;
};
type MutableServant = {
  skills?: MutableEffectContainer[];
  passives?: MutableEffectContainer[];
  noblePhantasms?: MutableEffectContainer[];
  noblePhantasmVariantGroups?: { variants: MutableEffectContainer[] }[];
  actorFormGraph?: { forms: { skillIds: string[]; passiveIds: string[] }[] };
};

function parseTestMaster(input: unknown) {
  const candidate = structuredClone(input) as {
    servants: MutableServant[];
    craftEssences: MutableEffectContainer[];
    mysticCodes: { skills: MutableEffectContainer[] }[];
  };
  const decorate = (
    containers: readonly MutableEffectContainer[],
    gameActivation: 'constant' | 'skillUse' | 'npBeforeDamage',
    defaultInclusion: 'include' | 'exclude',
  ) => {
    for (const container of containers)
      for (const effect of container.effects ?? []) {
        effect['inclusionPolicy'] ??= { default: defaultInclusion };
        effect['gameActivation'] ??= gameActivation;
        effect['proc'] ??= { kind: 'guaranteed' };
        effect['selection'] ??= null;
      }
  };
  for (const servant of candidate.servants) {
    if (servant.actorFormGraph)
      servant.actorFormGraph = {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) => ({ ...form })),
      };
    for (const skill of [...(servant.skills ?? []), ...(servant.passives ?? [])])
      skill['resourceRequirement'] ??= null;
    decorate(servant.skills ?? [], 'skillUse', 'include');
    decorate(servant.passives ?? [], 'constant', 'include');
    decorate(servant.noblePhantasms ?? [], 'npBeforeDamage', 'include');
    decorate(
      servant.noblePhantasmVariantGroups?.flatMap(({ variants }) => variants) ?? [],
      'npBeforeDamage',
      'include',
    );
    for (const form of servant.actorFormGraph?.forms ?? []) {
      form.skillIds =
        (servant.skills as { id?: string }[] | undefined)?.flatMap(({ id }) => (id ? [id] : [])) ??
        [];
      form.passiveIds =
        (servant.passives as { id?: string }[] | undefined)?.flatMap(({ id }) =>
          id ? [id] : [],
        ) ?? [];
    }
  }
  decorate(candidate.craftEssences, 'constant', 'include');
  for (const code of candidate.mysticCodes) {
    for (const skill of code.skills) skill['resourceRequirement'] ??= null;
    decorate(code.skills, 'skillUse', 'include');
  }
  return masterSnapshotSchema.parse(candidate);
}
const versions: VersionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};
const unconditionalConditions = {
  recipient: [{ operator: 'any' as const, traits: [] }],
  holder: { operator: 'any' as const, traits: [] },
  opponent: { operator: 'any' as const, traits: [] },
  field: { operator: 'any' as const, traits: [] },
};
type TestTraitCondition = {
  operator: 'any' | 'all';
  traits: (
    | { name: string; negative: boolean; layer: 'combined' | 'state' }
    | { predicate: TargetPredicate; negative: boolean }
  )[];
};
type TestEffectConditions = {
  recipient: TestTraitCondition[];
  holder: TestTraitCondition;
  opponent: TestTraitCondition;
  field: TestTraitCondition;
};
const mutationRoute = (target: 'sourceSelf' | 'enemy') => ({
  target,
  contributionScope: target === 'enemy' ? ('enemyApplied' as const) : ('personal' as const),
  eligibility: { kind: 'anyRecipient' as const, onMissing: 'ignore' as const },
});
const emptyParameterSemantics = {
  value: [],
  lifecycle: [],
  presentation: [],
  condition: [],
  contextMutation: [],
  choice: [],
  valueExpression: [],
  buffIdentity: [],
  unresolved: [],
};

function modifierEffect(
  id: string,
  buffType: string,
  value: number,
  cardTypes: ('buster' | 'arts' | 'quick')[] = [],
  target = 'self',
  conditions: TestEffectConditions = unconditionalConditions,
) {
  const targetPolicy = target.startsWith('enemy')
    ? ('enemy' as const)
    : target === 'ptOther' || target === 'ptOtherFull'
      ? ('partyOther' as const)
      : target === 'ptOne' || target === 'ptAll' || target === 'ptFull'
        ? ('partyMember' as const)
        : ('sourceSelf' as const);
  const modifier =
    buffType === 'upAtk'
      ? ('attackBuff' as const)
      : buffType === 'upDamage'
        ? ('powerMod' as const)
        : buffType === 'upNpdamage'
          ? ('npDamageBuff' as const)
          : buffType === 'upCommandall' && cardTypes.length > 0
            ? ('cardBuff' as const)
            : null;
  const values = [Array.from({ length: 10 }, () => value), [], [], [], []] as const;
  const provenance = {
    stateSources: 'activeOnly' as const,
    ignoredStateTraits: 'exclude' as const,
    unremovableStateTraits: 'include' as const,
  };
  const bindCondition = (
    condition: TestEffectConditions['holder'],
    scope: 'recipient' | 'opponent' | 'field',
  ): CanonicalEffectRequirement =>
    condition.traits.length === 0
      ? { kind: 'always' }
      : {
          kind: condition.operator,
          requirements: condition.traits.map((trait) =>
            'predicate' in trait
              ? {
                  kind: 'targetPredicate' as const,
                  scope: scope === 'field' ? 'recipient' : scope,
                  predicate: trait.predicate,
                  present: !trait.negative,
                }
              : {
                  kind: 'trait' as const,
                  scope:
                    trait.layer === 'state'
                      ? scope === 'recipient'
                        ? ('recipientState' as const)
                        : scope === 'opponent'
                          ? ('opponentState' as const)
                          : ('field' as const)
                      : scope,
                  trait: trait.name,
                  present: !trait.negative,
                  provenance,
                },
          ),
        };
  const requirements = [
    ...conditions.recipient.map((condition) => bindCondition(condition, 'recipient')),
    bindCondition(conditions.holder, 'recipient'),
    bindCondition(conditions.opponent, 'opponent'),
    bindCondition(conditions.field, 'field'),
  ].filter((requirement) => requirement.kind !== 'always');
  const contributionScope =
    targetPolicy === 'enemy'
      ? ('enemyApplied' as const)
      : targetPolicy === 'partyMember'
        ? ('partyWide' as const)
        : targetPolicy === 'partyOther'
          ? ('partyOther' as const)
          : ('personal' as const);
  const route = {
    target: targetPolicy,
    contributionScope,
    eligibility: {
      kind: 'requiredRecipient' as const,
      recipient: 'attacker' as const,
      onMissing: 'ignore' as const,
      onMismatch: 'unsupported' as const,
    },
  };
  return {
    id,
    occurrenceId: `${id}:0`,
    availability: 'allLimitBreakStates' as const,
    interaction: null,
    label: id,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    inputDefinitions: [],
    requirement: {
      recipient: targetPolicy,
      expression:
        requirements.length === 0
          ? ({ kind: 'always' as const } satisfies CanonicalEffectRequirement)
          : requirements.length === 1
            ? requirements[0]!
            : { kind: 'all' as const, requirements },
    },
    execution:
      buffType === 'pierceDefence' || buffType === 'pierceSubdamage'
        ? [
            {
              kind:
                buffType === 'pierceDefence'
                  ? ('ignoreDefense' as const)
                  : ('ignoreDamageCut' as const),
              route,
              semanticSupport: 'supported' as const,
            },
          ]
        : modifier
          ? [
              {
                kind: 'damageModifier' as const,
                modifier,
                sign: 1 as const,
                route,
                card: cardTypes[0] ?? null,
                values,
                limitBreakValues: values,
                valueExpressions: [[], [], [], [], []] as const,
                limitBreakValueExpressions: [[], [], [], [], []] as const,
                semanticSupport: 'supported' as const,
              },
            ]
          : [{ kind: 'boundedPhaseIrrelevant' as const, proof: 'noBattleStateChange' as const }],
    atlasEvidence: {
      functionType: 'addStateShort',
      target,
      parameterSets: [Array.from({ length: 10 }, () => ({ Value: value })), [], [], [], []],
      parameterSemantics: emptyParameterSemantics,
      unresolvedSemanticKeys: [],
      buffTypes: [buffType],
      buffRateTargets: [],
      buffConditionKeys: [],
    },
  };
}

function npResourceMutation(direction: 'gain' | 'loss', amount: number) {
  return {
    kind: 'resourceMutation' as const,
    resource: 'npGauge' as const,
    direction,
    unit: 'fixed' as const,
    recipient: 'sourceSelf' as const,
    amount: {
      kind: 'fixed' as const,
      values: [Array<number>(10).fill(amount), [], [], [], []] as [
        number[],
        number[],
        number[],
        number[],
        number[],
      ],
    },
    subjectId: null,
  };
}

const unsupportedNpResourceMutation = {
  kind: 'unsupported' as const,
  route: {
    target: 'sourceSelf' as const,
    contributionScope: 'personal' as const,
    eligibility: { kind: 'anyRecipient' as const, onMissing: 'ignore' as const },
  },
  reason: 'dependentResourceAmount' as const,
  damageRelevant: true,
};

function traitConditions(opponent: string, field: string): TestEffectConditions {
  return {
    ...unconditionalConditions,
    opponent: {
      operator: 'all' as const,
      traits: [{ name: opponent, negative: false, layer: 'combined' }],
    },
    field: {
      operator: 'all' as const,
      traits: [{ name: field, negative: false, layer: 'combined' }],
    },
  };
}

describe('scenario calculation facade', () => {
  it('always derives base overcharge from the ordered NP resource transaction', () => {
    const baseline = createDefaultResolvedScenario(master, undefined);
    const scenario: ResolvedScenario = {
      ...baseline,
      attacker: { ...baseline.attacker, npLevel: 2 },
      overcharge: 1,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
    };
    const outcome = resolveScenarioPreparationOutcome(scenario, master, {
      initialNpGauge: 20_000,
    });

    expect(outcome.status).toBe('executable');
    if (outcome.status !== 'executable') throw new Error(outcome.rejection.code);
    expect(outcome.input.overcharge).toBe(2);
    expect(outcome.formExecution.state.baseOvercharge).toBe(2);
  });

  it('keeps repeated Function IDs as independent decisions and operations', () => {
    const first = modifierEffect('shared-function', 'upAtk', 100);
    const second = {
      ...modifierEffect('shared-function', 'upAtk', 200),
      occurrenceId: 'shared-function:1',
      availability: 'allLimitBreakStates' as const,
    };
    const baseServant = fixture.servants[0]!;
    const occurrenceMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'occurrence-skill',
              slot: 1,
              priority: 1,
              name: 'occurrence skill',
              detail: '',
              imageKey: null,
              effects: [first, second],
            },
          ],
        },
      ],
    });
    const scenario: Extract<CalculationScenario, { mode: 'resolved' }> = {
      ...createDefaultResolvedScenario(occurrenceMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const inactive = calculateScenario(scenario, occurrenceMaster, {
      ...versions,
      masterDataVersion: occurrenceMaster.version,
    });
    const effects = inactive.effects.filter(
      (effect) => effect.source.effectId === 'shared-function',
    );

    expect(effects.map((effect) => effect.source.effectOccurrenceId)).toEqual([
      'shared-function:0',
      'shared-function:1',
    ]);
    expect(new Set(effects.map((effect) => effect.projectionKey)).size).toBe(2);

    const selected = effects.reduce(
      (current, effect) => applyEffectProjectionDecision(current, effect, true),
      scenario,
    );
    const calculation = calculateScenario(selected, occurrenceMaster, {
      ...versions,
      masterDataVersion: occurrenceMaster.version,
    });
    expect(calculation.input.attackBuff).toBe(0.3);
    expect(
      calculation.effects.filter(
        (effect) => effect.source.effectId === 'shared-function' && effect.outcome === 'applied',
      ),
    ).toHaveLength(2);
  });

  it('executes hidden automatic field mutations before dependent modifiers', () => {
    const fieldEffect = {
      ...modifierEffect('field-sunshine', 'fieldIndividuality', 2_038),
      label: 'field mutation',
      timing: 'beforeDamage' as const,
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          route: mutationRoute('sourceSelf'),
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
      ],
    };
    const conditional = {
      ...modifierEffect('sunshine-power', 'upAtk', 300, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'all',
          traits: [{ name: 'fieldSunlight', negative: false, layer: 'combined' }],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const classRelation = {
      ...modifierEffect('class-relation', 'overwriteClassRelation', 0),
      label: 'class relation override',
    };
    const baseServant = fixture.servants[0]!;
    const fieldMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              effects: [fieldEffect, conditional],
            })),
          })),
          passives: [
            {
              id: 'class-passive',
              priority: 1,
              name: 'class passive',
              detail: '',
              imageKey: null,
              effects: [classRelation],
            },
          ],
        },
      ],
    });
    const scenario = createDefaultResolvedScenario(fieldMaster, undefined);
    const calculation = calculateScenario(scenario, fieldMaster, {
      ...versions,
      masterDataVersion: fieldMaster.version,
    });

    expect(
      calculation.effects.find((effect) => effect.label === 'field mutation')?.visibility,
    ).toBe('hidden');
    expect(
      calculation.effects.find((effect) => effect.label === 'class relation override'),
    ).toMatchObject({
      outcome: 'notRelevant',
      explanation: { code: 'stateMutationOnly' },
    });
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.input.attackBuff).toBe(0.3);
    expect(calculation.input.fieldTraits).toContain('fieldSunlight');
    expect(calculation.effects.find((effect) => effect.label === 'field mutation')?.outcome).toBe(
      'applied',
    );
  });

  it('applies skill mutations from the action while gating terminal modifiers by inclusion', () => {
    const fieldEffect = {
      ...modifierEffect('field-sunshine', 'fieldIndividuality', 2_038),
      label: 'field mutation',
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          route: mutationRoute('sourceSelf'),
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
      ],
    };
    const recipientEffect = {
      ...modifierEffect('recipient-blessing', 'addIndividuality', 2_038, [], 'self'),
      label: 'recipient mutation',
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          route: mutationRoute('sourceSelf'),
          trait: 'blessedByKur',
          damageRelevant: false,
        },
      ],
    };
    const conditional = {
      ...modifierEffect('sunshine-power', 'upAtk', 300, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'all',
          traits: [{ name: 'fieldSunlight', negative: false, layer: 'combined' }],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const alternativeField = {
      ...modifierEffect('alternative-field-power', 'upNpdamage', 250, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'any',
          traits: [
            { name: 'fieldSunlight', negative: false, layer: 'combined' },
            { name: 'fieldShore', negative: false, layer: 'combined' },
          ],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const sameSkillPower = {
      ...modifierEffect('skill-power', 'upDamage', 200),
      label: 'same-skill-power',
    };
    const siblingSkillPower = {
      ...modifierEffect('skill-np-power', 'upNpdamage', 100),
      label: 'sibling-skill-power',
    };
    const baseServant = fixture.servants[0]!;
    const linkedMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'mutation-skill',
              slot: 1,
              priority: 1,
              name: 'mutation skill',
              detail: '',
              imageKey: null,
              effects: [fieldEffect, recipientEffect, sameSkillPower, siblingSkillPower],
            },
          ],
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              effects: [conditional, alternativeField],
            })),
          })),
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(linkedMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const versionContext = { ...versions, masterDataVersion: linkedMaster.version };
    const initial = calculateScenario(scenario, linkedMaster, versionContext);
    expect(initial.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(initial.input.attackerStateTraits).toEqual(['blessedByKur']);
    expect(initial.effects.find((effect) => effect.label === 'field mutation')).toMatchObject({
      visibility: 'hidden',
      outcome: 'applied',
    });
    expect(initial.effects.find((effect) => effect.label === 'recipient mutation')).toMatchObject({
      visibility: 'hidden',
      outcome: 'applied',
    });

    const sameSkillPowerProjection = initial.effects.find(
      (effect) => effect.label === 'same-skill-power',
    )!;
    const siblingSkillPowerProjection = initial.effects.find(
      (effect) => effect.label === 'sibling-skill-power',
    )!;
    const usedScenario = applyEffectPresentationDecision(
      applyEffectPresentationDecision(
        scenario,
        sameSkillPowerProjection,
        true,
        initial.activationRequirements,
        initial.effects,
      ),
      siblingSkillPowerProjection,
      true,
      initial.activationRequirements,
      initial.effects,
    );
    const used = calculateScenario(usedScenario, linkedMaster, versionContext);
    expect(used.result.status).toBe('calculated');
    expect(used.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(used.input.attackerStateTraits).toEqual(['blessedByKur']);
    expect(used.input.attackBuff).toBe(0.3);
    expect(used.input.npDamageBuff).toBe(0.35);
    expect(used.input.powerMod).toBe(0.2);
    expect(used.effects.find((effect) => effect.label === 'recipient mutation')?.outcome).toBe(
      'applied',
    );

    const sunshine = used.effects.find((effect) => effect.label === 'same-skill-power')!;
    const siblingMaintainedScenario = applyEffectProjectionDecision(usedScenario, sunshine, false);
    const siblingMaintained = calculateScenario(
      siblingMaintainedScenario,
      linkedMaster,
      versionContext,
    );
    expect(siblingMaintained.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(siblingMaintained.input.attackerStateTraits).toEqual(['blessedByKur']);
    expect(siblingMaintained.input.attackBuff).toBe(0.3);
    expect(siblingMaintained.input.npDamageBuff).toBe(0.35);
    expect(siblingMaintained.input.powerMod).toBe(0);

    const sibling = siblingMaintained.effects.find(
      (effect) => effect.label === 'sibling-skill-power',
    )!;
    const excluded = calculateScenario(
      applyEffectProjectionDecision(siblingMaintainedScenario, sibling, false),
      linkedMaster,
      versionContext,
    );
    expect(excluded.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(excluded.input.attackBuff).toBe(0.3);
    expect(excluded.input.powerMod).toBe(0);
    expect(excluded.input.attackerStateTraits).toEqual(['blessedByKur']);
  });

  it('calculates a resolved scenario without a UI selection adapter', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const calculation = calculateScenario(scenario, master, versions);

    expect(calculation.scenario).toEqual(scenario);
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.result.rows).toHaveLength(5);
  });

  it('uses the natural level cap for an unsaved servant build', () => {
    const fourStarServant = {
      ...master.servants[0]!,
      rarity: 4,
      atkByLevel: { ...master.servants[0]!.atkByLevel, '80': 9_000 },
    };
    const scenario = createDefaultResolvedScenario(master, undefined, fourStarServant);

    expect(scenario.attacker).toMatchObject({ level: 80, source: 'master' });
  });

  it('applies a conditional NP from the same explicit effect decision contract', () => {
    const baseServant = fixture.servants[0]!;
    const conditionalMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              damage: np.damage.map((damage) => ({
                ...damage,
                kind: 'trait',
                rawFunctionType: 'damageNpIndividual',
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((parameter) => ({
                    ...parameter,
                    targetId: 1,
                    targetTrait: { kind: 'trait', name: 'dragon' },
                    correctionPermille: 1_500,
                  })),
                ),
              })),
            })),
          })),
        },
      ],
    });
    const scenario = createDefaultResolvedScenario(conditionalMaster, undefined);
    const inactive = calculateScenario(scenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    const condition = inactive.effects.find((effect) => effect.modifier === 'npSpecial');

    // E2E-A030-TRAIT-DECISION
    expect(condition).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'unresolved' },
      value: 1.5,
      controllability: 'user',
      decision: { state: 'enabled', plan: { activation: 'user' } },
    });
    expect(inactive.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);

    const active = calculateScenario(
      applyEffectConditionDecision(
        applyEffectProjectionDecision(scenario, condition!, true),
        condition!,
        true,
        inactive.activationRequirements,
      ),
      conditionalMaster,
      { ...versions, masterDataVersion: conditionalMaster.version },
    );

    expect(active.input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(
      active.effects.find((effect) => effect.projectionKey === condition!.projectionKey),
    ).toMatchObject({
      outcome: 'applied',
      explanation: { code: 'applied' },
    });
    expect(active.result.status).toBe('calculated');

    const excluded = calculateScenario(
      applyEffectProjectionDecision(
        applyEffectConditionDecision(scenario, condition!, true, inactive.activationRequirements),
        condition!,
        false,
      ),
      conditionalMaster,
      { ...versions, masterDataVersion: conditionalMaster.version },
    );
    expect(excluded.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(
      excluded.effects.find((effect) => effect.projectionKey === condition!.projectionKey),
    ).toMatchObject({ outcome: 'notApplied', explanation: { code: 'disabled' } });
    expect(excluded.result.status).toBe('calculated');
  });

  it('replays the selected scenario without area by removing only party-wide final damage', () => {
    const baseServant = fixture.servants[0]!;
    const scopedMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'scoped-buffs',
              slot: 1,
              priority: 1,
              name: 'scoped buffs',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect('personal-buff', 'upAtk', 100, [], 'self'),
                modifierEffect('party-wide-buff', 'upAtk', 200, [], 'ptAll'),
                modifierEffect('party-other-buff', 'upAtk', 400, [], 'ptOther'),
              ],
            },
          ],
        },
      ],
    });
    const outcome = calculateRankingPolicyDetail(
      scopedMaster.servants[0]!,
      scopedMaster,
      { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      { ...versions, masterDataVersion: scopedMaster.version },
    );
    if (outcome.status !== 'calculated') throw new Error('calculated area detail required');
    const { detail } = outcome;
    const withoutArea = detail.areaContribution;
    if (!withoutArea) throw new Error('area counterfactual required');
    if (withoutArea.withoutAreaResult.status !== 'calculated')
      throw new Error('calculated without-area damage required');

    expect(detail.input.attackBuff).toBe(0.3);
    expect(withoutArea.withoutAreaInput.attackBuff).toBe(0.1);
    expect(detail.result.rows[0].average).toBeGreaterThan(
      withoutArea.withoutAreaResult.rows[0].average,
    );
    const includedByScope = new Map(
      detail.effectiveContributions.contributions.map((contribution) => [
        contribution.source.effectId,
        contribution,
      ]),
    );
    const excludedByScope = new Map(
      withoutArea.effectiveContributions.contributions.map((contribution) => [
        contribution.source.effectId,
        contribution,
      ]),
    );
    expect(includedByScope.get('personal-buff')).toMatchObject({
      effective: true,
      areaViewDecision: { kind: 'included' },
    });
    expect(excludedByScope.get('personal-buff')).toMatchObject({
      effective: true,
      areaViewDecision: { kind: 'included' },
    });
    expect(includedByScope.get('party-wide-buff')).toMatchObject({
      effective: true,
      areaViewDecision: { kind: 'included' },
    });
    expect(excludedByScope.get('party-wide-buff')).toMatchObject({
      effective: false,
      areaViewDecision: { kind: 'excluded', reason: 'areaView' },
    });
    expect(
      scopedMaster.servants[0]!.skills[0]!.effects.find(
        (effect) => effect.id === 'party-other-buff',
      )!.execution.find((operation) => 'route' in operation),
    ).toMatchObject({ route: { contributionScope: 'partyOther' } });
    expect(includedByScope.has('party-other-buff')).toBe(false);
    expect(excludedByScope.has('party-other-buff')).toBe(false);
  });

  it('applies one exclusive conditional modifier and fails closed when both are selected', () => {
    const baseServant = fixture.servants[0]!;
    const exclusiveMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'realm-skill',
              slot: 1,
              priority: 1,
              name: 'realm skill',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect(
                  'sky-power',
                  'upDamage',
                  500,
                  [],
                  'self',
                  traitConditions('attributeSky', 'fieldHeaven'),
                ),
                modifierEffect(
                  'earth-power',
                  'upDamage',
                  500,
                  [],
                  'self',
                  traitConditions('attributeEarth', 'fieldHell'),
                ),
                modifierEffect(
                  'earth-power-b',
                  'upDamage',
                  500,
                  [],
                  'self',
                  traitConditions('attributeEarth', 'fieldHell'),
                ),
              ],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(exclusiveMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const inactive = calculateScenario(scenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    const sky = inactive.effects.find((effect) => effect.label === 'sky-power')!;
    const earth = inactive.effects.find((effect) => effect.label === 'earth-power')!;
    const earthB = inactive.effects.find((effect) => effect.label === 'earth-power-b')!;
    const skyScenario = applyEffectConditionDecision(
      applyEffectProjectionDecision(scenario, sky, true),
      sky,
      true,
      inactive.activationRequirements,
      inactive.effects,
    );

    const skyOnly = calculateScenario(skyScenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    // E2E-A038-TRANSACTION
    expect(skyOnly.result.status).toBe('calculated');
    expect(skyOnly.input).toMatchObject({
      powerMod: 0.5,
      fieldTraits: [],
      target: { traits: [] },
    });
    expect(skyOnly.effects.find((effect) => effect.label === 'sky-power')?.outcome).toBe('applied');
    expect(skyOnly.effects.find((effect) => effect.label === 'earth-power')?.outcome).toBe(
      'notApplied',
    );

    const earthIncluded = applyEffectProjectionDecision(skyScenario, earth, true);
    const earthScenario = applyEffectConditionDecision(
      earthIncluded,
      earth,
      true,
      inactive.activationRequirements,
      inactive.effects,
    );
    const earthOnly = calculateScenario(earthScenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    expect(earthOnly.result.status).toBe('calculated');
    expect(earthOnly.input.powerMod).toBe(0.5);
    expect(
      earthOnly.effects.find((effect) => effect.label === 'sky-power')?.conditionDecision,
    ).toBe('evaluate');

    const conflict = calculateScenario(
      {
        ...earthScenario,
        effectDecisions: earthScenario.effectDecisions.map((decision) =>
          decision.decisionKey === sky.projectionKey
            ? {
                ...decision,
                operationEnabled: true,
                conditionSatisfaction: 'assumeSatisfied' as const,
              }
            : decision,
        ),
      },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(
      conflict.effects
        .filter((effect) => ['sky-power', 'earth-power'].includes(effect.label))
        .map((effect) => effect.outcome),
    ).toEqual(['notApplied', 'notApplied']);

    const fixedFactConflict = calculateScenario(
      {
        ...applyEffectConditionDecision(
          applyEffectConditionDecision(
            applyEffectProjectionDecision(
              applyEffectProjectionDecision(scenario, earth, true),
              earthB,
              true,
            ),
            earth,
            true,
            inactive.activationRequirements,
          ),
          earthB,
          true,
          inactive.activationRequirements,
        ),
        worldFactAssertions: [
          {
            decisionKey: 'world:sky',
            fact: {
              kind: 'trait',
              scope: 'target',
              trait: 'attributeSky',
              present: true,
            },
          },
        ],
      },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(fixedFactConflict.result.status).toBe('unsupported');
    expect(fixedFactConflict.input.powerMod).toBe(0);
    expect(
      fixedFactConflict.effects
        .filter((effect) => ['earth-power', 'earth-power-b'].includes(effect.label))
        .map((effect) => effect.outcome),
    ).toEqual(['notApplied', 'notApplied']);
  });

  it('uses the same condition assertion path for a support effect', () => {
    const attacker = fixture.servants[0]!;
    const support = {
      ...attacker,
      id: 'conditional-support',
      name: 'conditional support',
      passives: [],
      noblePhantasms: [],
      skills: [
        {
          id: 'support-condition-skill',
          slot: 1,
          priority: 1,
          name: 'support condition',
          detail: '',
          imageKey: null,
          effects: [
            modifierEffect(
              'support-sky-power',
              'upDamage',
              300,
              [],
              'ptOne',
              traitConditions('attributeSky', 'fieldHeaven'),
            ),
          ],
        },
      ],
    };
    const supportMaster = parseTestMaster({
      ...fixture,
      servants: [attacker, support],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(supportMaster, undefined),
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support-source',
              servantId: support.id,
              skills: [{ skillId: 'support-condition-skill', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [],
        },
      },
    };
    const inactive = calculateScenario(scenario, supportMaster, {
      ...versions,
      masterDataVersion: supportMaster.version,
    });
    const projection = inactive.effects.find((effect) => effect.label === 'support-sky-power')!;
    const active = calculateScenario(
      applyEffectConditionDecision(
        applyEffectProjectionDecision(scenario, projection, true),
        projection,
        true,
        inactive.activationRequirements,
      ),
      supportMaster,
      { ...versions, masterDataVersion: supportMaster.version },
    );

    expect(projection).toMatchObject({
      controllability: 'user',
      decision: {
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
    });
    expect(active.result.status).toBe('calculated');
    expect(active.input).toMatchObject({
      powerMod: 0.3,
      fieldTraits: [],
      target: { traits: [] },
    });
    expect(active.effects.find((effect) => effect.label === 'support-sky-power')).toMatchObject({
      outcome: 'applied',
      decision: { state: 'enabled' },
    });
  });

  it('validates context mutations transactionally against selected conditions', () => {
    const baseServant = fixture.servants[0]!;
    const heavenContext = {
      ...modifierEffect('heaven-context', 'stateContext', 0),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          route: mutationRoute('sourceSelf'),
          trait: 'fieldHeaven',
          damageRelevant: false,
        },
      ],
    };
    const transactionalMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          passives: [
            {
              id: 'realm-passive',
              priority: 0,
              name: 'realm passive',
              detail: '',
              imageKey: null,
              effects: [heavenContext],
            },
          ],
          skills: [
            {
              id: 'hell-power-skill',
              slot: 1,
              priority: 1,
              name: 'hell power',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect('hell-power', 'upDamage', 500, [], 'self', {
                  ...unconditionalConditions,
                  field: {
                    operator: 'all',
                    traits: [{ name: 'fieldHell', negative: false, layer: 'combined' }],
                  },
                }),
              ],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(transactionalMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const initial = calculateScenario(scenario, transactionalMaster, {
      ...versions,
      masterDataVersion: transactionalMaster.version,
    });
    const hell = initial.effects.find((effect) => effect.label === 'hell-power')!;
    const conflict = calculateScenario(
      {
        ...scenario,
        effectDecisions: [
          {
            decisionKey: hell.projectionKey,
            operationEnabled: true,
            conditionSatisfaction: 'assumeSatisfied' as const,
          },
        ],
      },
      transactionalMaster,
      { ...versions, masterDataVersion: transactionalMaster.version },
    );
    const context = conflict.effects.find((effect) => effect.label === 'heaven-context')!;

    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(context).toMatchObject({ visibility: 'hidden', outcome: 'unsupported' });
    expect(conflict.effects.find((effect) => effect.label === 'hell-power')?.outcome).toBe(
      'notApplied',
    );
    expect(conflict.input.fieldTraits).toEqual([]);
    expect(conflict.input.powerMod).toBe(0);
  });

  it('rolls back sibling damage contributions when a resource mutation is unsupported', () => {
    const baseServant = fixture.servants[0]!;
    const modifier = modifierEffect('resource-transaction', 'upDamage', 500);
    const resourceMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((variant) =>
              variant.kind === 'attack'
                ? {
                    ...variant,
                    damage: variant.damage.map((damage) => ({
                      ...damage,
                      kind: 'hpRatioLow' as const,
                      rawFunctionType: 'damageNpHpratioLow',
                      parametersByOvercharge: damage.parametersByOvercharge.map((levels) =>
                        levels.map((parameter) => ({ ...parameter, targetId: 6_000 })),
                      ),
                    })),
                  }
                : variant,
            ),
          })),
          skills: [
            {
              id: 'resource-transaction-skill',
              slot: 1,
              priority: 1,
              name: 'resource transaction',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [
                {
                  ...modifier,
                  execution: [
                    ...modifier.execution,
                    {
                      kind: 'resourceMutation' as const,
                      resource: 'hp' as const,
                      direction: 'loss' as const,
                      unit: 'fixed' as const,
                      recipient: 'sourceSelf' as const,
                      amount: {
                        kind: 'fixed' as const,
                        values: [Array<number>(10).fill(100), [], [], [], []] as [
                          number[],
                          number[],
                          number[],
                          number[],
                          number[],
                        ],
                      },
                      subjectId: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(resourceMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };

    const execution = calculateScenario(scenario, resourceMaster, {
      ...versions,
      masterDataVersion: resourceMaster.version,
    });

    expect(execution.result.status).toBe('unsupported');
    if (execution.result.status !== 'unsupported') throw new Error(execution.result.status);
    expect(execution.result.rows).toEqual([]);
    expect(
      execution.result.missingEvidence.some((item) => item.includes('resourceStateUnavailable:hp')),
    ).toBe(true);
    expect(execution.input.powerMod).toBe(0);
    expect(
      execution.effectiveContributions.contributions.find(
        ({ source }) => source.effectOccurrenceId === 'resource-transaction:0',
      )?.effective,
    ).toBe(false);
  });

  it.each(['gain', 'loss'] as const)(
    'applies an ordered critical-star %s before a star reader',
    (direction) => {
      const baseServant = fixture.servants[0]!;
      const modifier = modifierEffect('star-resource-transaction', 'upAtk', 500);
      const starMutation = {
        ...modifier,
        occurrenceId: 'star-resource-mutation:0',
        id: 'star-resource-mutation',
        label: 'star resource mutation',
        inputDefinitions: [],
        requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
        execution: [
          {
            kind: 'resourceMutation' as const,
            resource: 'criticalStars' as const,
            direction,
            unit: 'fixed' as const,
            recipient: 'sourceSelf' as const,
            amount: {
              kind: 'fixed' as const,
              values: [Array<number>(10).fill(5), [], [], [], []] as [
                number[],
                number[],
                number[],
                number[],
                number[],
              ],
            },
            subjectId: null,
          },
        ],
      };
      const starReader = {
        ...modifier,
        inputDefinitions: [
          {
            key: 'battle:criticalStars',
            kind: 'criticalStars' as const,
            owner: 'field' as const,
            label: 'クリティカルスター',
            description: '星依存効果の現在値',
            minimum: 0,
            maximum: 99,
            step: 1,
            defaultValue: 8,
            defaultReason: 'fixture',
          },
        ],
        requirement: {
          recipient: 'sourceSelf' as const,
          expression: {
            kind: 'inputQuantity' as const,
            inputKey: 'battle:criticalStars',
            comparison: 'atLeast' as const,
            value: 10,
          },
        },
      };
      const resourceMaster = parseTestMaster({
        ...fixture,
        servants: [
          {
            ...baseServant,
            skills: [
              {
                id: 'star-resource-transaction-skill',
                slot: 1,
                priority: 1,
                name: 'star resource transaction',
                detail: '',
                imageKey: null,
                resourceRequirement: null,
                effects: [starMutation, starReader],
              },
            ],
          },
        ],
      });
      const scenario: ResolvedScenario = {
        ...createDefaultResolvedScenario(resourceMaster, undefined),
        preNoblePhantasmPlan: [
          { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
          { kind: 'executeAttackNoblePhantasm' },
        ],
      };

      const execution = calculateScenario(scenario, resourceMaster, {
        ...versions,
        masterDataVersion: resourceMaster.version,
      });

      expect(execution.result.status).toBe('calculated');
      expect(execution.input.attackBuff).toBe(direction === 'gain' ? 0.5 : 0);
    },
  );

  it('rolls back a sibling modifier when a star transition amount is unrepresentable', () => {
    const baseServant = fixture.servants[0]!;
    const modifier = modifierEffect('star-rollback', 'upAtk', 500);
    const unsupportedStar = {
      ...modifier,
      inputDefinitions: [
        {
          key: 'battle:criticalStars',
          kind: 'criticalStars' as const,
          owner: 'field' as const,
          label: 'クリティカルスター',
          description: '星依存効果の現在値',
          minimum: 0,
          maximum: 99,
          step: 1,
          defaultValue: 20,
          defaultReason: 'fixture',
        },
      ],
      requirement: {
        recipient: 'sourceSelf' as const,
        expression: {
          kind: 'inputQuantity' as const,
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast' as const,
          value: 10,
        },
      },
      execution: [
        {
          kind: 'resourceMutation' as const,
          resource: 'criticalStars' as const,
          direction: 'gain' as const,
          unit: 'fixed' as const,
          recipient: 'sourceSelf' as const,
          amount: {
            kind: 'fixed' as const,
            values: [Array<null>(10).fill(null), [], [], [], []] as [
              null[],
              null[],
              null[],
              null[],
              null[],
            ],
          },
          subjectId: null,
        },
        ...modifier.execution,
      ],
    };
    const resourceMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'star-rollback-skill',
              slot: 1,
              priority: 1,
              name: 'star rollback',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [unsupportedStar],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(resourceMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const execution = calculateScenario(scenario, resourceMaster, {
      ...versions,
      masterDataVersion: resourceMaster.version,
    });

    expect(execution.result.status).toBe('unsupported');
    expect(execution.input.attackBuff).toBe(0);
    expect(
      execution.effectiveContributions.contributions.find(
        ({ source }) => source.effectOccurrenceId === 'star-rollback:0',
      )?.effective,
    ).toBe(false);
  });

  it('rolls back every operation in an effect when a later runtime value is unresolved', () => {
    const baseServant = fixture.servants[0]!;
    const staticModifier = modifierEffect('compound', 'upAtk', 100).execution[0]!;
    const hpValues = [Array.from({ length: 10 }, () => 200), [], [], [], []] as const;
    const hpExpressions = [
      Array.from({ length: 10 }, () => ({
        kind: 'inverseHpLinear' as const,
        basePermille: 200,
        bonusAtZeroHpPermille: 300,
      })),
      [],
      [],
      [],
      [],
    ] as const;
    const compoundEffect = {
      ...modifierEffect('compound', 'upAtk', 100),
      execution: [
        staticModifier,
        {
          ...staticModifier,
          modifier: 'powerMod' as const,
          values: hpValues,
          limitBreakValues: hpValues,
          valueExpressions: hpExpressions,
          limitBreakValueExpressions: hpExpressions,
        },
      ],
    };
    const compoundMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'compound-skill',
              slot: 1,
              priority: 1,
              name: 'compound skill',
              detail: '',
              imageKey: null,
              effects: [compoundEffect],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(compoundMaster, undefined),
      attackerHpPermille: null,
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const initial = calculateScenario(scenario, compoundMaster, {
      ...versions,
      masterDataVersion: compoundMaster.version,
    });
    const projection = initial.effects.find((effect) => effect.label === 'compound')!;
    const selectedScenario = applyEffectProjectionDecision(scenario, projection, true);
    const prepared = prepareOrderedScenario(
      initial.scenarioInput,
      selectedScenario,
      compoundMaster,
    );
    const execution = executeOrderedScenario(
      prepared,
      resolveCanonicalInputValues(prepared.inputDefinitions, selectedScenario.canonicalInputValues),
    );
    const compoundOperations = execution.operations.filter(
      ({ operation }) => operation.source.effectOccurrenceId === 'compound:0',
    );

    expect(execution.precision).toBe('unsupported');
    expect(compoundOperations).toHaveLength(2);
    expect(compoundOperations.every((result) => result.outcome === 'unsupported')).toBe(true);
    expect(execution.state.modifiers).toEqual([]);
    expect(execution.input.attackBuff).toBe(0);
    expect(execution.input.powerMod).toBe(0);
  });

  it('routes conditional passives and craft essences through the same effect-local decision', () => {
    const baseServant = fixture.servants[0]!;
    const orCondition: TestEffectConditions = {
      ...unconditionalConditions,
      opponent: {
        operator: 'any' as const,
        traits: [
          { name: 'dragon', negative: false, layer: 'combined' },
          { name: 'lamia', negative: false, layer: 'combined' },
        ],
      },
    };
    const conditionalMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          passives: [
            {
              id: 'conditional-passive',
              priority: 1,
              name: 'conditional passive',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect('passive-or-power', 'upDamage', 200, [], 'self', orCondition),
              ],
            },
          ],
        },
      ],
      craftEssences: fixture.craftEssences.map((craftEssence) => ({
        ...craftEssence,
        effects: [modifierEffect('ce-or-power', 'upDamage', 300, [], 'self', orCondition)],
      })),
    });
    const baseScenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(conditionalMaster, undefined),
      craftEssence: {
        craftEssenceId: conditionalMaster.craftEssences[0]!.id,
        level: 1,
        limitBreak: 0,
      },
    };
    const initial = calculateScenario(baseScenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    const passive = initial.effects.find((effect) => effect.label === 'passive-or-power')!;
    const craftEssence = initial.effects.find((effect) => effect.label === 'ce-or-power')!;
    expect([passive, craftEssence]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ controllability: 'user', outcome: 'notApplied' }),
      ]),
    );
    const includedScenario = applyEffectProjectionDecision(
      applyEffectProjectionDecision(baseScenario, passive, true),
      craftEssence,
      true,
    );
    const selectedScenario = applyEffectConditionDecision(
      applyEffectConditionDecision(includedScenario, passive, true, initial.activationRequirements),
      craftEssence,
      true,
      initial.activationRequirements,
    );
    const selected = calculateScenario(selectedScenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    expect(selected.result.status).toBe('calculated');
    expect(selected.input.powerMod).toBe(0.5);
    expect(selected.input.target.traits).toEqual([]);
  });

  it('derives world-fact exclusivity canonically without scenario metadata', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const externallyParsed = calculationScenarioSchema.parse({
      ...scenario,
      worldFactAssertions: [
        {
          decisionKey: 'world:sky',
          fact: {
            kind: 'trait',
            scope: 'target',
            trait: 'attributeSky',
            present: true,
            exclusiveGroup: null,
          },
        },
        {
          decisionKey: 'world:earth',
          fact: {
            kind: 'trait',
            scope: 'target',
            trait: 'attributeEarth',
            present: true,
            exclusiveGroup: null,
          },
        },
      ],
    });
    if (externallyParsed.mode !== 'resolved') throw new Error('resolved scenario expected');
    expect('exclusiveGroup' in externallyParsed.worldFactAssertions[0]!.fact).toBe(false);
    const conflict = calculateScenario(externallyParsed, master, versions);
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(conflict.input.target.traits).toEqual([]);
  });

  it('preserves repeated state-trait stacks through ordered NP execution', () => {
    const baseServant = fixture.servants[0]!;
    const burn = { kind: 'trait' as const, name: 'buffBurn' };
    const poison = { kind: 'trait' as const, name: 'buffPoison' };
    const stackEffect = (id: string) => ({
      ...modifierEffect(id, 'addIndividuality', 0, [], 'enemyAll'),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          route: mutationRoute('enemy'),
          trait: burn.name,
          damageRelevant: false,
        },
      ],
      timing: 'beforeDamage' as const,
    });
    const stackedMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              effects: [stackEffect('burn-one'), stackEffect('burn-two')],
              damage: np.damage.map((damage) => ({
                ...damage,
                kind: 'traitCount',
                rawFunctionType: 'damageNpIndividualSum',
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((parameter) => ({
                    ...parameter,
                    targetId: 1,
                    targetIds: [99],
                    targetTraits: [burn, poison],
                    secondaryValuePermille: 1_000,
                    correctionPermille: 200,
                    maximumTargetCount: 3,
                  })),
                ),
              })),
            })),
          })),
        },
      ],
    });

    const calculation = calculateScenario(
      createDefaultResolvedScenario(stackedMaster, undefined),
      stackedMaster,
      { ...versions, masterDataVersion: stackedMaster.version },
    );

    expect(calculation.input.targetStateTraits).toEqual(['buffBurn', 'buffBurn']);
    expect(calculation.input.npSpecialMultipliers).toEqual([1.4, 1.4, 1.4, 1.4, 1.4]);
    const traitProjections = calculation.effects.filter(
      (effect) =>
        effect.modifier === 'npSpecial' && effect.contributionControl === 'worldAssumption',
    );
    expect(traitProjections).toHaveLength(2);
    const burnProjection = traitProjections.find((effect) =>
      effect.projectionKey.includes('trait:buffBurn'),
    )!;
    const poisonProjection = traitProjections.find((effect) =>
      effect.projectionKey.includes('trait:buffPoison'),
    )!;
    expect(burnProjection.outcome).toBe('applied');
    expect(burnProjection.contributionId).toMatch(/:npSpecial$/);
    expect(poisonProjection.outcome).toBe('notApplied');
    expect(poisonProjection.contributionId).toMatch(/:npSpecial$/);
    expect(calculation.effectiveContributions.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'npBase', effective: true }),
        expect.objectContaining({ component: 'npSpecial', effective: true }),
      ]),
    );
  });

  it('applies NP-before target state and explicit removal without leaking NP-after state', () => {
    const baseServant = fixture.servants[0]!;
    const burn = { kind: 'trait' as const, name: 'buffBurn' };
    const stateEffect = (
      id: string,
      mutation: 'addTrait' | 'removeTrait',
      timing: 'beforeDamage' | 'afterDamage',
    ) => ({
      ...modifierEffect(id, mutation === 'addTrait' ? 'addState' : 'subState', 0, [], 'enemyAll'),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation,
          scope: 'recipientState' as const,
          route: mutationRoute('enemy'),
          trait: burn.name,
          damageRelevant: true,
        },
      ],
      timing,
    });
    const stateMaster = (
      effects: ReturnType<typeof stateEffect>[],
    ): ReturnType<typeof parseTestMaster> =>
      parseTestMaster({
        ...fixture,
        servants: [
          {
            ...baseServant,
            noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
              ...group,
              variants: group.variants.map((np) => ({
                ...np,
                effects,
                damage: np.damage.map((damage) => ({
                  ...damage,
                  kind: 'stateTrait',
                  rawFunctionType: 'damageNpStateIndividualFix',
                  stateTraitNames: [burn.name],
                  parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                    row.map((parameter) => ({
                      ...parameter,
                      targetId: 1,
                      targetTrait: burn,
                      correctionPermille: 1_500,
                    })),
                  ),
                })),
              })),
            })),
          },
        ],
      });
    const multiplier = (candidate: ReturnType<typeof parseTestMaster>) =>
      calculateScenario(createDefaultResolvedScenario(candidate, undefined), candidate, {
        ...versions,
        masterDataVersion: candidate.version,
      }).input.npSpecialMultipliers;

    expect(multiplier(stateMaster([stateEffect('before', 'addTrait', 'beforeDamage')]))).toEqual([
      1.5, 1.5, 1.5, 1.5, 1.5,
    ]);
    expect(multiplier(stateMaster([stateEffect('after', 'addTrait', 'afterDamage')]))).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(
      multiplier(
        stateMaster([
          stateEffect('before', 'addTrait', 'beforeDamage'),
          stateEffect('remove', 'removeTrait', 'beforeDamage'),
        ]),
      ),
    ).toEqual([1, 1, 1, 1, 1]);
  });

  it('keeps a self-generated target-state NP special separate from NP base by ranking policy', () => {
    const baseServant = fixture.servants[0]!;
    const burn = { kind: 'trait' as const, name: 'buffBurn' };
    const mutation = {
      ...modifierEffect('self-generated-burn', 'addState', 0, [], 'enemyAll'),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          route: mutationRoute('enemy'),
          trait: burn.name,
          damageRelevant: true,
        },
      ],
      timing: 'beforeDamage' as const,
    };
    const specialMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              effects: [mutation],
              damage: np.damage.map((damage) => ({
                ...damage,
                kind: 'stateTrait',
                rawFunctionType: 'damageNpStateIndividualFix',
                stateTraitNames: [burn.name],
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((parameter) => ({
                    ...parameter,
                    targetId: 1,
                    targetTrait: burn,
                    correctionPermille: 1_500,
                  })),
                ),
              })),
            })),
          })),
        },
      ],
    });
    const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };
    const calculate = (conditionalEffects: 'baseline' | 'satisfied') =>
      calculateRankingPolicyDetail(
        specialMaster.servants[0]!,
        specialMaster,
        profile,
        { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects },
        { ...versions, masterDataVersion: specialMaster.version },
      );
    const baseline = calculate('baseline');
    const satisfied = calculate('satisfied');
    if (baseline.status !== 'calculated' || satisfied.status !== 'calculated')
      throw new Error('calculated ranking details required');
    const baselineSpecial = baseline.detail.effects.find(
      (effect) => effect.modifier === 'npSpecial',
    )!;
    const satisfiedSpecial = satisfied.detail.effects.find(
      (effect) => effect.modifier === 'npSpecial',
    )!;
    const contribution = (detail: typeof baseline.detail, component: 'npBase' | 'npSpecial') =>
      detail.effectiveContributions.contributions.find((item) => item.component === component)!;

    expect(baselineSpecial.outcome).toBe('applied');
    expect(baselineSpecial.contributionId).toMatch(/:npSpecial$/);
    expect(baseline.detail.input.targetStateTraits).toContain(burn.name);
    expect(baseline.detail.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(contribution(baseline.detail, 'npBase')).toMatchObject({ effective: true });
    expect(contribution(baseline.detail, 'npSpecial')).toMatchObject({
      effective: false,
      conditionDecision: { kind: 'excluded', reason: 'conditionalEffectPolicy' },
    });
    expect(rankingEffectContributes(baselineSpecial, baseline.detail.effectiveContributions)).toBe(
      false,
    );
    expect(
      createRankingRow(specialMaster.servants[0]!, baseline.detail, profile).specialDamageApplied,
    ).toBe(false);

    expect(satisfied.detail.input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(contribution(satisfied.detail, 'npSpecial')).toMatchObject({
      effective: true,
      conditionDecision: { kind: 'included' },
    });
    expect(
      rankingEffectContributes(satisfiedSpecial, satisfied.detail.effectiveContributions),
    ).toBe(true);
    expect(
      createRankingRow(specialMaster.servants[0]!, satisfied.detail, profile).specialDamageApplied,
    ).toBe(true);
    expect(satisfied.detail.result.rows[0].average).toBeGreaterThan(
      baseline.detail.result.rows[0].average,
    );
  });

  it('commits a target-state mutation only when its proc succeeds', () => {
    const baseServant = fixture.servants[0]!;
    const poison = { kind: 'trait' as const, name: 'buffPoison' };
    const visibleProcEffect = modifierEffect('poison-proc', 'upAtk', 0);
    const procEffect = {
      ...visibleProcEffect,
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [[500], [500], [500], [500], [500]],
      },
      selection: {
        kind: 'stochasticOutcome' as const,
        group: {
          kind: 'binary' as const,
          key: 'stochastic-outcome:poison-proc',
          defaultOutcome: 'success' as const,
        },
      },
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          route: mutationRoute('enemy'),
          trait: poison.name,
          damageRelevant: true,
        },
        ...visibleProcEffect.execution,
      ],
      timing: 'beforeDamage' as const,
    };
    const procMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((np) => ({
              ...np,
              effects: [procEffect],
              damage: np.damage.map((damage) => ({
                ...damage,
                kind: 'stateTrait',
                rawFunctionType: 'damageNpStateIndividualFix',
                stateTraitNames: [poison.name],
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((parameter) => ({
                    ...parameter,
                    targetId: 1,
                    targetTrait: poison,
                    correctionPermille: 1_500,
                  })),
                ),
              })),
            })),
          })),
        },
      ],
    });
    const initialScenario = createDefaultResolvedScenario(procMaster, undefined);
    const initial = calculateScenario(initialScenario, procMaster, {
      ...versions,
      masterDataVersion: procMaster.version,
    });
    const control = initial.effectControls.find(
      ({ projection }) => projection.proc.kind === 'singleRoll',
    )!;
    const calculateProc = (enabled: boolean) => {
      const scenario = applyEffectPresentationDecision(
        initialScenario,
        control.projection,
        enabled,
        initial.activationRequirements,
        initial.effects,
      );
      return calculateScenario(scenario, procMaster, {
        ...versions,
        masterDataVersion: procMaster.version,
      });
    };

    expect(calculateProc(false).input.targetStateTraits).toEqual([]);
    expect(calculateProc(false).input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(calculateProc(true).input.targetStateTraits).toEqual(['buffPoison']);
    expect(calculateProc(true).input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
  });

  it('returns empty inputRequired rows and calculates after repair', () => {
    const baseServant = fixture.servants[0]!;
    const resourceEffect = {
      ...modifierEffect('input-resource', 'stateContext', 0),
      inputDefinitions: [
        {
          key: 'preparation:value',
          kind: 'procSuccessCount' as const,
          owner: 'attacker' as const,
          label: '準備値',
          description: 'NP獲得を適用するための入力',
          minimum: 0,
          maximum: 1,
          step: 1,
          defaultValue: null,
          defaultReason: '明示入力が必要',
        },
      ],
      requirement: {
        recipient: 'sourceSelf' as const,
        expression: {
          kind: 'inputQuantity' as const,
          inputKey: 'preparation:value',
          comparison: 'atLeast' as const,
          value: 1,
        },
      },
      execution: [npResourceMutation('gain', 2_000)],
    };
    const preparationMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'input-resource-skill',
              slot: 1,
              priority: 1,
              name: 'input resource',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [resourceEffect],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(preparationMaster, undefined),
      attacker: {
        ...createDefaultResolvedScenario(preparationMaster, undefined).attacker,
        npLevel: 2,
      },
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const prepared = prepareCalculationScenario(scenario, preparationMaster);
    const initial = evaluatePreparedCalculationScenario(prepared, {
      ...versions,
      masterDataVersion: preparationMaster.version,
    });

    // E2E-A031-FAIL-CLOSED
    expect(initial.result).toMatchObject({
      status: 'inputRequired',
      rows: [],
      requiredInputs: [{ key: 'preparation:value', effectOccurrenceIds: ['input-resource:0'] }],
    });
    expect(initial.effectInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'preparation:value', invalid: true }),
      ]),
    );

    const repairedScenario: ResolvedScenario = {
      ...scenario,
      canonicalInputValues: {
        'preparation:value': { kind: 'integer', value: 1 },
      },
    };
    const repaired = rematerializePreparedCalculationInputs(
      prepared,
      repairedScenario,
      preparationMaster,
    );
    expect(repaired.orderedScenario?.inputDefinitions.map(({ key }) => key)).toContain(
      'preparation:value',
    );
    const execution = evaluatePreparedCalculationScenario(repaired, {
      ...versions,
      masterDataVersion: preparationMaster.version,
    });

    expect(execution.effectWarnings).toEqual([]);
    expect(execution.result.status).toBe('calculated');
    expect(execution.appliedPreparationActions).toHaveLength(2);
    expect(execution.appliedPreparationActions[0]).toMatchObject({
      sourceId: 'input-resource-skill',
      resourceBefore: { gauge: 10_000 },
      resourceAfter: { gauge: 12_000 },
    });

    const rankingMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'input-resource-skill',
              slot: 1,
              priority: 1,
              name: 'input resource',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [
                {
                  ...resourceEffect,
                  inputDefinitions: resourceEffect.inputDefinitions.map((definition) => ({
                    ...definition,
                    defaultValue: 0,
                  })),
                },
              ],
            },
          ],
        },
      ],
    });
    const rankingPlan = compileRankingExecutionPlan(
      rankingMaster.servants[0]!,
      rankingMaster,
      { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevel: 2,
        conditionalEffects: 'satisfied',
      },
      { ...versions, masterDataVersion: rankingMaster.version },
    );
    const rankingSkillIndex = rankingPlan.rankingScenarios.findIndex(
      (candidate) =>
        candidate.canonicalInputValues['preparation:value']?.value === 1 &&
        candidate.preNoblePhantasmPlan.some(({ kind }) => kind === 'useSkillSlot'),
    );
    const rankingSkillCandidate = rankingPlan.rankingScenarios[rankingSkillIndex];
    const rankingSkillPrepared = rankingPlan.preparedRankingScenarios[rankingSkillIndex];

    expect(rankingSkillCandidate?.canonicalInputValues['preparation:value']).toEqual({
      kind: 'integer',
      value: 1,
    });
    expect(rankingSkillPrepared?.resolved.precision).toBe('exact');
    expect(rankingSkillPrepared?.resolved.appliedPreparationActions[0]).toMatchObject({
      resourceBefore: { gauge: 10_000 },
      resourceAfter: { gauge: 12_000 },
    });

    const policyPlan = compileRankingExecutionPlan(
      preparationMaster.servants[0]!,
      preparationMaster,
      { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevel: 2,
        conditionalEffects: 'satisfied',
      },
      { ...versions, masterDataVersion: preparationMaster.version },
    );
    const repairedPolicyIndex = policyPlan.rankingScenarios.findIndex(
      (candidate, index) =>
        candidate.canonicalInputValues['preparation:value']?.value === 1 &&
        candidate.preNoblePhantasmPlan.some(({ kind }) => kind === 'useSkillSlot') &&
        policyPlan.preparedRankingScenarios[index]?.status === 'executable',
    );
    expect(
      policyPlan.preparedRankingScenarios[repairedPolicyIndex]?.resolved
        .appliedPreparationActions[0],
    ).toMatchObject({ resourceBefore: { gauge: 10_000 }, resourceAfter: { gauge: 12_000 } });

    const conflictingMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'conflicting-input-skill',
              slot: 1,
              priority: 1,
              name: 'conflicting input',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [
                resourceEffect,
                {
                  ...resourceEffect,
                  id: 'conflicting-input',
                  occurrenceId: 'conflicting-input:0',
                  inputDefinitions: resourceEffect.inputDefinitions.map((definition) => ({
                    ...definition,
                    maximum: 2,
                  })),
                },
              ],
            },
          ],
        },
      ],
    });
    expect(
      calculateRankingPolicyDetail(
        conflictingMaster.servants[0]!,
        conflictingMaster,
        { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
        { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
        { ...versions, masterDataVersion: conflictingMaster.version },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'semanticDomainInvalid',
      candidateSpaceIssue: {
        kind: 'semanticDomainInvalid',
        detail: 'ranking_canonical_input_definition_conflict:preparation:value',
      },
    });
  });

  it('repairs an input-dependent non-attack form transition before creating an executable damage input', () => {
    const baseServant = fixture.servants[0]!;
    const initialForm = baseServant.actorFormGraph.forms[0]!.id;
    const attackForm = { actorId: initialForm.actorId, limitCount: 1 };
    const initialNpRef = { actorFormId: initialForm, noblePhantasmId: 'fixture-preparation-np' };
    const attackNpRef = { actorFormId: attackForm, noblePhantasmId: 'fixture-transition-attack' };
    const originalAttack = baseServant.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (originalAttack.kind !== 'attack') throw new TypeError('fixture_attack_required');
    const transitionEffect = {
      ...modifierEffect('input-transition', 'stateContext', 0),
      inputDefinitions: [
        {
          key: 'preparation:transition',
          kind: 'procSuccessCount' as const,
          owner: 'attacker' as const,
          label: '変身条件',
          description: '攻撃宝具形態へ遷移する条件',
          minimum: 0,
          maximum: 4,
          step: 2,
          defaultValue: null,
          defaultReason: '明示入力が必要',
        },
      ],
      requirement: {
        recipient: 'sourceSelf' as const,
        expression: {
          kind: 'inputQuantity' as const,
          inputKey: 'preparation:transition',
          comparison: 'atLeast' as const,
          value: 2,
        },
      },
      execution: [
        {
          kind: 'transformActorForm' as const,
          route: mutationRoute('sourceSelf'),
          targetFormId: attackForm,
        },
        {
          kind: 'selectNoblePhantasmVariant' as const,
          route: mutationRoute('sourceSelf'),
          variant: attackNpRef,
        },
      ],
    };
    const structuralMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          actorFormGraph: {
            ...baseServant.actorFormGraph,
            forms: [
              {
                ...baseServant.actorFormGraph.forms[0]!,
                baseNoblePhantasmVariant: initialNpRef,
              },
              {
                ...baseServant.actorFormGraph.forms[0]!,
                id: attackForm,
                name: '攻撃宝具形態',
                baseNoblePhantasmVariant: attackNpRef,
              },
            ],
            transitions: [
              {
                id: 'input-transition',
                from: initialForm,
                to: attackForm,
                direction: 'forward' as const,
                activation: {
                  sourceKind: 'skill' as const,
                  sourceId: 'transition-skill',
                  effectOccurrenceIds: ['input-transition:0'],
                },
                operations: transitionEffect.execution,
              },
            ],
          },
          baseNoblePhantasmGroupId: 'fixture-preparation-group',
          noblePhantasmVariantGroups: [
            {
              id: 'fixture-preparation-group',
              baseVariant: initialNpRef,
              variants: [
                {
                  kind: 'nonAttack' as const,
                  canonicalId: '1'.repeat(64),
                  ref: initialNpRef,
                  name: '変身宝具',
                  priority: 1,
                  effects: [],
                },
                {
                  ...originalAttack,
                  canonicalId: '2'.repeat(64),
                  ref: attackNpRef,
                  name: '遷移後攻撃宝具',
                },
              ],
            },
          ],
          skills: [
            {
              id: 'transition-skill',
              slot: 1,
              priority: 1,
              name: '変身スキル',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [transitionEffect],
            },
          ],
        },
      ],
    });
    const baseScenario = createDefaultResolvedScenario(master, undefined);
    const scenario: ResolvedScenario = {
      ...baseScenario,
      attacker: { ...baseScenario.attacker, initialActorFormId: initialForm },
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const prepared = prepareCalculationScenario(scenario, structuralMaster);
    const preparationOutcome = resolveScenarioPreparationOutcome(scenario, structuralMaster);
    expect(preparationOutcome).toMatchObject({
      status: 'rejected',
      rejection: { code: 'preparationInputRequired' },
    });
    expect('input' in preparationOutcome).toBe(false);
    const initial = evaluatePreparedCalculationScenario(prepared, {
      ...versions,
      masterDataVersion: structuralMaster.version,
    });

    expect(initial.result).toMatchObject({
      status: 'inputRequired',
      requiredInputs: [
        { key: 'preparation:transition', effectOccurrenceIds: ['input-transition:0'] },
      ],
    });
    expect(initial.appliedPreparationActions).toEqual([]);
    expect(initial.status).toBe('rejected');
    expect('input' in initial).toBe(false);
    expect('scenarioInput' in initial).toBe(false);
    expect(
      executeRankingScenarios([prepared], structuralMaster, {
        ...versions,
        masterDataVersion: structuralMaster.version,
      })[0]?.result.status,
    ).toBe('inputRequired');

    const nonAttackOnlyServant = structuralMaster.servants[0]!;
    const nonAttackOnlyMaster = parseTestMaster({
      ...structuralMaster,
      servants: [
        {
          ...nonAttackOnlyServant,
          actorFormGraph: {
            ...nonAttackOnlyServant.actorFormGraph,
            forms: [nonAttackOnlyServant.actorFormGraph.forms[0]!],
            initialFormIds: [initialForm],
            defaultInitialFormId: initialForm,
            transitions: [],
          },
          noblePhantasmVariantGroups: nonAttackOnlyServant.noblePhantasmVariantGroups.map(
            (group) => ({
              ...group,
              variants: group.variants.filter(({ kind }) => kind === 'nonAttack'),
            }),
          ),
          skills: [],
        },
      ],
    });
    const noAttack = calculateScenarioOutcome(
      {
        ...scenario,
        preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
      },
      nonAttackOnlyMaster,
      { ...versions, masterDataVersion: nonAttackOnlyMaster.version },
    );
    expect(noAttack).toMatchObject({
      status: 'rejected',
      result: {
        status: 'unsupported',
        issues: [{ code: 'preparation:attackNoblePhantasmUnavailable' }],
      },
    });
    expect('input' in noAttack).toBe(false);
    expect('scenarioInput' in noAttack).toBe(false);

    for (const value of [-2, 6, 1]) {
      const invalid = calculateScenarioOutcome(
        {
          ...scenario,
          canonicalInputValues: {
            'preparation:transition': { kind: 'integer', value },
          },
        },
        structuralMaster,
        { ...versions, masterDataVersion: structuralMaster.version },
      );
      expect(invalid.result.status, String(value)).toBe('inputRequired');
      expect(invalid.appliedPreparationActions, String(value)).toEqual([]);
    }

    const repairedScenario: ResolvedScenario = {
      ...scenario,
      canonicalInputValues: {
        'preparation:transition': { kind: 'integer', value: 2 },
      },
    };
    const repaired = rematerializePreparedCalculationInputs(
      prepared,
      repairedScenario,
      structuralMaster,
    );
    const execution = evaluatePreparedCalculationScenario(repaired, {
      ...versions,
      masterDataVersion: structuralMaster.version,
    });

    expect(execution.effectWarnings).toEqual([]);
    expect(execution.result.status).toBe('calculated');
    expect(execution.noblePhantasmVariant?.ref).toEqual(attackNpRef);
    expect(execution.appliedPreparationActions[0]).toMatchObject({
      transition: { id: 'input-transition' },
    });
    expect(
      executeRankingScenarios([repaired], structuralMaster, {
        ...versions,
        masterDataVersion: structuralMaster.version,
      })[0]?.result.status,
    ).toBe('calculated');

    const policyPlan = compileRankingExecutionPlan(
      structuralMaster.servants[0]!,
      structuralMaster,
      { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        conditionalEffects: 'satisfied',
      },
      { ...versions, masterDataVersion: structuralMaster.version },
    );
    expect(
      policyPlan.rankingScenarios.some(
        (candidate, index) =>
          candidate.canonicalInputValues['preparation:transition']?.value === 2 &&
          policyPlan.attackProfiles[index]?.noblePhantasmVariant.noblePhantasmId ===
            attackNpRef.noblePhantasmId &&
          policyPlan.preparedRankingScenarios[index]?.status === 'executable',
      ),
    ).toBe(true);
    const transitionedProfile = policyPlan.attackProfiles.find(
      ({ noblePhantasmVariant }) =>
        noblePhantasmVariant.noblePhantasmId === attackNpRef.noblePhantasmId,
    )!;
    expect(
      calculateRankingPolicyDetail(
        structuralMaster.servants[0]!,
        structuralMaster,
        { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
        DEFAULT_RANKING_POLICY_CONDITIONS,
        { ...versions, masterDataVersion: structuralMaster.version },
        transitionedProfile,
      ),
    ).toMatchObject({
      status: 'unsupported',
      reason: 'candidateExecutionUnsupported',
    });
  });

  it('keeps ordinary stochastic ownership in the executor for a mixed preparation skill', () => {
    const baseServant = fixture.servants[0]!;
    const preparationEffect = {
      ...modifierEffect('mixed-preparation', 'stateContext', 0),
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [Array<number>(10).fill(800), [], [], [], []],
      },
      selection: {
        kind: 'stochasticOutcome' as const,
        group: {
          kind: 'binary' as const,
          key: 'mixed:preparation',
          defaultOutcome: 'success' as const,
        },
      },
      execution: [npResourceMutation('gain', 2_000)],
    };
    const ordinaryEffect = {
      ...modifierEffect('mixed-ordinary', 'upAtk', 500),
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [Array<number>(10).fill(500), [], [], [], []],
      },
      selection: {
        kind: 'stochasticOutcome' as const,
        group: {
          kind: 'binary' as const,
          key: 'mixed:ordinary',
          defaultOutcome: 'failure' as const,
        },
      },
    };
    const conditionFalseEffect = {
      ...modifierEffect('mixed-condition-false', 'upAtk', 900),
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [Array<number>(10).fill(700), [], [], [], []],
      },
      selection: {
        kind: 'stochasticOutcome' as const,
        group: {
          kind: 'binary' as const,
          key: 'mixed:condition-false',
          defaultOutcome: 'success' as const,
        },
      },
      requirement: {
        recipient: 'sourceSelf' as const,
        expression: {
          kind: 'quantity' as const,
          quantity: 'attackerHpPermille' as const,
          comparison: 'atLeast' as const,
          value: 500,
        },
      },
      execution: [npResourceMutation('gain', 3_000)],
    };
    const mixedMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'mixed-skill',
              slot: 1,
              priority: 1,
              name: 'mixed skill',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [preparationEffect, ordinaryEffect, conditionFalseEffect],
            },
          ],
        },
      ],
    });
    const baseScenario = createDefaultResolvedScenario(mixedMaster, undefined);
    const execution = calculateScenario(
      {
        ...baseScenario,
        attacker: { ...baseScenario.attacker, npLevel: 2 },
        attackerHpPermille: 100,
        preNoblePhantasmPlan: [
          { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
          { kind: 'executeAttackNoblePhantasm' },
        ],
      },
      mixedMaster,
      { ...versions, masterDataVersion: mixedMaster.version },
    );

    expect(execution.result.status).toBe('calculated');
    expect(execution.appliedPreparationActions[0]?.selectedEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurrenceId: 'mixed-preparation:0',
          stochasticOutcome: 'success',
        }),
        expect.objectContaining({ occurrenceId: 'mixed-ordinary:0', stochasticOutcome: null }),
      ]),
    );
    expect(execution.effects.find(({ label }) => label === 'mixed-ordinary')).toMatchObject({
      outcome: 'notApplied',
    });
    expect(execution.appliedPreparationActions[0]?.selectedEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurrenceId: 'mixed-condition-false:0',
          stochasticOutcome: 'success',
        }),
      ]),
    );
    expect(execution.effects.find(({ label }) => label === 'mixed-condition-false')).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'conditionNotMet' },
    });
    expect(execution.input.attackBuff).toBe(0);
  });

  it.each([
    [
      'insufficient',
      'insufficientNpGauge',
      {
        ...modifierEffect('loss-before-attack', 'stateContext', 0),
        execution: [npResourceMutation('loss', 2_000)],
      },
    ],
    [
      'unsupported',
      'unsupportedResourceMutation',
      {
        ...modifierEffect('unsupported-resource', 'stateContext', 0),
        execution: [unsupportedNpResourceMutation],
      },
    ],
    [
      'ambiguous',
      'ambiguousPreparationCondition',
      {
        ...modifierEffect('ambiguous-state', 'stateContext', 0),
        requirement: {
          recipient: 'sourceSelf' as const,
          expression: {
            kind: 'sourceQuantity' as const,
            quantity: 'battlePointRate' as const,
            subjectId: 'fixture-saber',
            comparison: 'atLeast' as const,
            value: 1,
          },
        },
        execution: [
          {
            kind: 'contextMutation' as const,
            mutation: 'addTrait' as const,
            scope: 'recipientState' as const,
            route: mutationRoute('sourceSelf'),
            trait: 'ambiguous-state',
            damageRelevant: true,
          },
        ],
      },
    ],
    [
      'invalid',
      'resourceRequirementExceedsCapacity',
      {
        ...modifierEffect('invalid-requirement', 'stateContext', 0),
      },
    ],
  ] as const)(
    'preserves %s preparation rejection at the public calculator result',
    (_name, code, rejectedEffect) => {
      const baseServant = fixture.servants[0]!;
      const rejectedMaster = parseTestMaster({
        ...fixture,
        servants: [
          {
            ...baseServant,
            skills: [
              {
                id: 'rejected-skill',
                slot: 1,
                priority: 1,
                name: 'rejected skill',
                detail: '',
                imageKey: null,
                resourceRequirement:
                  code === 'resourceRequirementExceedsCapacity'
                    ? { kind: 'atLeast' as const, amountsBySkillLevel: Array(10).fill(20_000) }
                    : null,
                effects: [rejectedEffect],
              },
            ],
          },
        ],
      });
      const scenario: ResolvedScenario = {
        ...createDefaultResolvedScenario(rejectedMaster, undefined),
        preNoblePhantasmPlan: [
          { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
          { kind: 'executeAttackNoblePhantasm' },
        ],
      };
      const execution = calculateScenarioOutcome(scenario, rejectedMaster, {
        ...versions,
        masterDataVersion: rejectedMaster.version,
      });

      expect(execution.result).toMatchObject({
        status: 'unsupported',
        issues: [{ code: `preparation:${code}` }],
      });
      expect(execution.appliedPreparationActions).toHaveLength(
        code === 'insufficientNpGauge' ? 1 : 0,
      );
    },
  );

  it('returns identical NP rows for equivalent resolved and manual inputs', () => {
    const resolvedScenario = createDefaultResolvedScenario(master, undefined);
    const resolved = calculateScenario(resolvedScenario, master, versions);
    const manualScenario: CalculationScenario = {
      mode: 'manual',
      manual: resolved.input,
    };
    const manual = calculateScenario(manualScenario, master, versions);

    expect(manual.result.rows).toEqual(resolved.result.rows);
    expect(() =>
      calculationScenarioSchema.parse({
        ...manualScenario,
        attacker: resolvedScenario.attacker,
      }),
    ).toThrow();
  });

  it('keeps resolved effects out of manual final-input calculations', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const resolved = calculateScenario(scenario, master, versions);
    const manual = calculateScenario({ mode: 'manual', manual: resolved.input }, master, versions);

    // E2E-A030-MODE-SEPARATION
    expect(resolved.effects.length).toBeGreaterThan(0);
    expect(manual.effects).toEqual([]);
    expect(manual.effectControls).toEqual([]);
    expect(manual.effectInputs).toEqual([]);
    expect(manual.input).toEqual(resolved.input);
  });

  it('fails closed when a resolved scenario references a missing craft essence', () => {
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(master, undefined),
      craftEssence: { craftEssenceId: 'missing', level: 1, limitBreak: 0 },
    };
    const calculation = calculateScenario(scenario, master, versions);

    expect(calculation.result.status).toBe('unsupported');
    expect(calculation.effectWarnings).toContain(
      'unsupportedOperation:craftEssence:missing:source_missing',
    );
  });

  it('marks user-supplied manual final modifiers as provisional evidence', () => {
    const resolved = calculateScenario(
      createDefaultResolvedScenario(master, undefined),
      master,
      versions,
    );
    const manual = calculateScenario({ mode: 'manual', manual: resolved.input }, master, versions);

    expect(manual.result).toMatchObject({ status: 'calculated', precision: 'approximate' });
    expect(manual.result.evidence.map((entry) => entry.key)).toContain(
      'input:manual-final-modifiers',
    );
  });

  it('matches the all-source single-aggregation golden through the scenario facade', () => {
    const baseServant = fixture.servants[0]!;
    const attacker = {
      ...baseServant,
      passives: [
        {
          id: 'passive-skill',
          priority: 0,
          name: 'passive',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('passive-card', 'upCommandall', 100, ['buster'])],
        },
      ],
      skills: [
        {
          id: 'attacker-skill',
          slot: 1,
          priority: 1,
          name: 'attacker',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('attacker-attack', 'upAtk', 200)],
        },
      ],
      noblePhantasmVariantGroups: baseServant.noblePhantasmVariantGroups.map((group) => ({
        ...group,
        variants: group.variants.map((np) => ({
          ...np,
          effects: [
            { ...modifierEffect('np-attack', 'upAtk', 600), timing: 'beforeDamage' as const },
            {
              ...modifierEffect('np-ignore-defense', 'pierceDefence', 0),
              timing: 'beforeDamage' as const,
            },
            {
              ...modifierEffect('np-ignore-damage-cut', 'pierceSubdamage', 0),
              timing: 'beforeDamage' as const,
            },
          ],
        })),
      })),
    };
    const support = {
      ...baseServant,
      id: 'combo-support',
      name: 'support',
      passives: [],
      noblePhantasms: [],
      skills: [
        {
          id: 'support-skill',
          slot: 1,
          priority: 1,
          name: 'support',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('support-power', 'upDamage', 500, [], 'ptOne')],
        },
      ],
    };
    const combinationMaster = parseTestMaster({
      ...fixture,
      servants: [attacker, support],
      craftEssences: [
        {
          ...fixture.craftEssences[0]!,
          effects: [modifierEffect('ce-np', 'upNpdamage', 300)],
        },
      ],
      mysticCodes: [
        {
          id: 'combo-mc',
          name: 'mystic',
          maxLevel: 10,
          imageKey: null,
          skills: [
            {
              id: 'mc-skill',
              slot: 1,
              priority: 1,
              name: 'mystic',
              detail: '',
              imageKey: null,
              effects: [modifierEffect('mc-card', 'upCommandall', 400, ['buster'], 'ptOne')],
            },
          ],
        },
      ],
    });
    const scenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(combinationMaster, undefined),
      targetContext: {
        class: { kind: 'relative' as const, relation: 'neutral' as const },
        attribute: { kind: 'relative' as const, relation: 'neutral' as const },
        families: [],
      },
      craftEssence: { craftEssenceId: 'fixture-ce', level: 1, limitBreak: 0 },
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
      mysticCode: {
        mysticCodeId: 'combo-mc',
        skills: [{ skillId: 'mc-skill', skillLevel: 10, enabled: true }],
      },
      effectDecisions: [
        {
          decisionKey: 'attacker:attacker:fixture-saber:attacker-skill:attacker-attack:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
        {
          decisionKey: 'mysticCode:mysticCode:combo-mc:mc-skill:mc-card:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
        {
          decisionKey: 'support:support-1:support-skill:support-power:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support-1',
              servantId: 'combo-support',
              skills: [{ skillId: 'support-skill', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [
            {
              sourceInstanceId: 'support-1',
              skillId: 'support-skill',
              effectId: 'support-power',
              effectOccurrenceId: 'support-power:0',
              included: false as const,
            },
          ],
        },
      },
    };
    const calculation = calculateScenario(scenario, combinationMaster, {
      ...versions,
      masterDataVersion: combinationMaster.version,
    });

    expect(calculation.scenarioInput).toMatchObject({
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
      powerMod: 0,
      flatDamage: 0,
    });
    expect(calculation.input).toMatchObject({
      ...effectSourcesGolden.expectedModifiers,
      damageFunction: { ignoreDefense: effectSourcesGolden.expectedIgnoreDefense },
      ignoreDamageCut: effectSourcesGolden.expectedIgnoreDamageCut,
    });
    expect(calculation.effects.map((effect) => effect.source.origin)).toEqual([
      'passive',
      'attacker',
      'craftEssence',
      'support',
      'mysticCode',
      'np',
      'np',
      'np',
      'np',
    ]);
    expect(calculation.result).toMatchObject({
      status: 'calculated',
      precision: 'approximate',
      rows: effectSourcesGolden.expectedRows,
    });
  });
});
