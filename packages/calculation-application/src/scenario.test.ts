import {
  attemptPortableCalculationScenarioChange,
  createCalculatorPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import effectSourcesGolden from '../../test-fixtures/golden/ordered-effect-execution-v1.json';
import {
  executeOrderedScenario,
  prepareOrderedScenario,
  type OrderedExecutionAuditObservation,
  type OrderedExecutionGroupAuditEvent,
  type OrderedInputQuantityReadAuditEvent,
} from '@fgo-lab/battle-execution';
import { masterSnapshotSchema, type CanonicalEffectRequirement } from '@fgo-lab/master-data';
import type { TargetPredicate } from '@fgo-lab/schema';
import {
  calculationResultSchema,
  calculationShareSnapshotSchema,
  calculationScenarioSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  applyEffectConditionDecision,
  applyEffectControlPresentationDecision,
  applyEffectPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
import { resolveCanonicalInputValues } from './canonicalInputs';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  rematerializePreparedCalculationInputs,
  requireExecutableCalculation,
  calculateScenarioWithPolicy,
  resolveScenarioPreparationOutcome,
} from './scenario';
import {
  criticalStarsForwardProgram,
  criticalStarsReadRequirements,
  criticalStarsForwardSource,
} from './productionCriticalStarsAudit';
import {
  criticalStarsRecoveryProgram,
  criticalStarsRecoverySource,
  auditCriticalStarsRecoveryObservations,
  type CriticalStarsRecoverySource,
  type CriticalStarsRecoveryGate,
  type CriticalStarsRecoveryFailureReason,
} from './productionCriticalStarsRecoveryAudit';
import { materializeRankingQuantity } from './rankingQuantityWorld';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';
import {
  rankingWithoutAreaControlObservation,
  rankingUserControlChecks,
  selectedProfileControlIdentity,
  userControlSideObservation,
} from './productionUserControlObservation';
import {
  auditProductionUserControlObservations,
  type ProductionUserControlObservation,
} from './productionParityDiagnostics';
import {
  calculateRankingCandidateSet,
  type RankingExecutionObservation,
} from './rankingPolicyCandidates';
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
async function recordTsk08AuditArtifact(
  taskMetadata: unknown,
  name: string,
  value: unknown,
): Promise<void> {
  await writeProductionAuditArtifact(taskMetadata, name, value);
}
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
      initialOvercharge: 1,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
    };
    const outcome = resolveScenarioPreparationOutcome(scenario, master, {
      initialNpGauge: 20_000,
    });

    expect(outcome.status).toBe('executable');
    if (outcome.status !== 'executable')
      throw new Error(outcome.status === 'rejected' ? outcome.rejection.code : outcome.issue.kind);
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

  it('resolves an exact attacker level stat once and fails closed on absence', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId)!;
    const levelKey = String(scenario.attacker.level);
    const masterWithAtk = (attackerAtk: number | undefined) => {
      const atkByLevel: Record<string, number> = {};
      for (const [key, value] of Object.entries(servant.atkByLevel))
        if (key !== levelKey) atkByLevel[key] = value;
      if (attackerAtk !== undefined) atkByLevel[levelKey] = attackerAtk;
      return masterSnapshotSchema.parse({
        ...master,
        servants: master.servants.map((candidate) =>
          candidate.id === servant.id
            ? {
                ...candidate,
                atkByLevel,
              }
            : candidate,
        ),
      });
    };

    const positive = calculateScenarioOutcome(scenario, masterWithAtk(7_654), versions);
    expect(positive.status).toBe('executable');
    if (positive.status !== 'executable') throw new Error('positive level stat must execute');
    expect(positive.input.attackerAtk).toBe(7_654);

    const zero = calculateScenarioOutcome(scenario, masterWithAtk(0), versions);
    expect(zero.status).toBe('executable');
    if (zero.status !== 'executable') throw new Error('present zero level stat must execute');
    expect(zero.input.attackerAtk).toBe(0);

    const missingMaster = masterWithAtk(undefined);
    for (const candidate of [
      scenario,
      { ...scenario, explicitOverrides: { ...scenario.explicitOverrides, attackerAtk: 99_999 } },
    ]) {
      const invalid = calculateScenarioOutcome(candidate, missingMaster, versions);
      expect(invalid).toMatchObject({
        status: 'invalid',
        result: {
          status: 'invalid',
          issue: {
            kind: 'attackerLevelStatUnavailable',
            servantId: servant.id,
            level: scenario.attacker.level,
          },
        },
        effects: [],
        appliedPreparationActions: [],
      });
    }

    const ranking = calculateRankingPolicy(
      missingMaster,
      { servantBuilds: {} },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    const servantResults = Object.values(ranking.profileResults).filter((result) =>
      result.status === 'calculated'
        ? result.detail.servantId === servant.id
        : result.attackProfile?.id.servantLineageId === servant.id,
    );
    expect(servantResults.length).toBeGreaterThan(0);
    expect(servantResults.every((result) => result.status === 'invalid')).toBe(true);
    expect(
      servantResults.every(
        (result) => result.status !== 'invalid' || result.reason === 'attackerLevelStatUnavailable',
      ),
    ).toBe(true);
    expect(ranking.damageCache.requestCount).toBe(0);
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

  it('keeps a rarity OR decision local while checking explicit target rarity facts', () => {
    const baseServant = fixture.servants[0]!;
    const rarityMaster = parseTestMaster({
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
                kind: 'targetRarity',
                rawFunctionType: 'damageNpRare',
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((parameter) => ({
                    ...parameter,
                    targetId: 0,
                    targetRarities: [1, 2],
                    correctionPermille: 1_500,
                  })),
                ),
              })),
            })),
          })),
        },
      ],
    });
    const version = { ...versions, masterDataVersion: rarityMaster.version };
    const baseScenario = createDefaultResolvedScenario(rarityMaster, undefined);
    const baseline = calculateScenario(baseScenario, rarityMaster, version);
    const control = baseline.effectControls.find(
      ({ projection }) => projection.modifier === 'npSpecial',
    )!;
    expect(control).toMatchObject({ active: false, presentationState: 'conditionUnselected' });
    const decide = (scenario: ResolvedScenario, enabled: boolean) =>
      applyEffectControlPresentationDecision(
        scenario,
        control,
        enabled,
        baseline.activationRequirements,
        baseline.effects,
        baseline.effectInputs,
      );
    const onScenario = decide(baseScenario, true);
    expect(onScenario.effectDecisions).toContainEqual({
      decisionKey:
        control.projection.decision.state === 'none' ? '' : control.projection.decision.decisionKey,
      operationEnabled: true,
      conditionSatisfaction: 'assumeSatisfied',
    });
    expect(onScenario.worldFactAssertions).toEqual([]);
    const restored = calculationScenarioSchema.parse(JSON.parse(JSON.stringify(onScenario)));
    expect(calculateScenario(restored, rarityMaster, version).input.npSpecialMultipliers).toEqual([
      1.5, 1.5, 1.5, 1.5, 1.5,
    ]);
    const on = calculateScenario(onScenario, rarityMaster, version);
    expect(on.result.status).toBe('calculated');
    expect(on.input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(on.effects.find(({ modifier }) => modifier === 'npSpecial')).toMatchObject({
      outcome: 'applied',
    });
    expect(on.effectControls.find(({ key }) => key === control.key)).toMatchObject({
      active: true,
      presentationState: 'applied',
    });
    const offScenario = decide(onScenario, false);
    const off = calculateScenario(offScenario, rarityMaster, version);
    expect(off.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(off.effects.find(({ modifier }) => modifier === 'npSpecial')).toMatchObject({
      outcome: 'notApplied',
    });
    expect(off.effectControls.find(({ key }) => key === control.key)).toMatchObject({
      active: false,
      presentationState: 'manuallyExcluded',
    });
    expect(
      calculateScenario(decide(offScenario, true), rarityMaster, version).input
        .npSpecialMultipliers,
    ).toEqual(on.input.npSpecialMultipliers);
    for (const rarity of [1, 2, 3, 6]) {
      const withFact = {
        ...onScenario,
        worldFactAssertions: [
          {
            decisionKey: 'explicit:targetRarity',
            fact: { kind: 'quantity' as const, quantity: 'targetRarity' as const, value: rarity },
          },
        ],
      };
      const result = calculateScenario(withFact, rarityMaster, version);
      expect(result.result.status, String(rarity)).toBe(rarity >= 3 ? 'unsupported' : 'calculated');
      if (rarity < 3)
        expect(result.input.npSpecialMultipliers).toEqual(on.input.npSpecialMultipliers);
    }
    const rankingScenario = materializeRankingQuantity(onScenario, {
      key: 'quantity:targetRarity:1',
      values: { targetRarity: 1 },
    });
    expect(rankingScenario.worldFactAssertions).toContainEqual({
      decisionKey: 'ranking:quantity:targetRarity',
      fact: { kind: 'quantity', quantity: 'targetRarity', value: 1 },
    });
    const ranked = requireExecutableCalculation(
      calculateScenarioWithPolicy(rankingScenario, rarityMaster, version, {
        kind: 'ranking',
        selfBuffs: 'included',
        conditionalEffects: 'satisfied',
        areaView: 'included',
      }),
    );
    expect(ranked.input.npSpecialMultipliers).toEqual(on.input.npSpecialMultipliers);
  });

  it(
    'replays the selected scenario without area by removing only party-wide final damage',
    productionAuditTestOptions(['production-without-area-fixture.json']),
    async ({ task }) => {
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
      const candidateSet = calculateRankingCandidateSet(
        scopedMaster.servants[0]!,
        scopedMaster,
        { servantBuilds: {} },
        DEFAULT_RANKING_POLICY_CONDITIONS,
        { ...versions, masterDataVersion: scopedMaster.version },
        true,
        undefined,
        true,
      );
      const detail = candidateSet.details.values().next().value;
      if (!detail) throw new Error('calculated area detail required');
      const withoutArea = detail.areaContribution;
      if (!withoutArea) throw new Error('area counterfactual required');
      if (withoutArea.withoutAreaResult.status !== 'calculated')
        throw new Error('calculated without-area damage required');
      const profileObservation = candidateSet.executionObservations?.get(detail.entryId);
      if (!profileObservation) throw new Error('selected and without-area observations required');
      if (profileObservation.candidateKey !== detail.candidateEvidence.candidateKey)
        throw new Error('selected and without-area observations must share the selected candidate');
      if (
        profileObservation.selected.targetExecution?.selection !== 'selected' ||
        profileObservation.withoutAreaAlternate?.targetExecution?.selection !== 'selected'
      )
        throw new Error('selected target execution required on both area paths');
      const selectedTargetExecution = profileObservation.selected.targetExecution;
      const withoutAreaTargetExecution = profileObservation.withoutAreaAlternate.targetExecution;
      if (profileObservation.selectedInput !== detail.input)
        throw new Error('selected observation must belong to the detail input');
      if (profileObservation.withoutAreaInput !== withoutArea.withoutAreaInput)
        throw new Error('without-area observation must belong to the alternate input');
      if (
        profileObservation.selectedEffectiveContributions !== detail.effectiveContributions ||
        profileObservation.withoutAreaEffectiveContributions !== withoutArea.effectiveContributions
      )
        throw new Error('effective contributions must belong to the observed executions');
      const selectedPartyWide = detail.effects.find(
        (effect) => effect.source.effectId === 'party-wide-buff',
      );
      const withoutAreaPartyWide = withoutArea.withoutAreaEffects.find(
        (effect) => effect.source.effectId === 'party-wide-buff',
      );
      if (!selectedPartyWide || !withoutAreaPartyWide)
        throw new Error('party-wide projection required on both area paths');
      const observation = rankingWithoutAreaControlObservation(
        candidateSet,
        detail,
        selectedPartyWide,
      );
      // Expected fixture population comes from canonical projections/profile, not observations.
      const expectedIdentities = detail.effects
        .filter(
          (projection) =>
            projection.controllability === 'user' &&
            projection.sourceActive &&
            projection.contributionScope === 'partyWide',
        )
        .map((projection) => ({
          ownerId: scopedMaster.servants[0]!.id,
          profileKey: detail.entryId,
          path: 'withoutAreaAlternate' as const,
          projectionKey: projection.projectionKey,
          operationId: projection.operationId,
          contributionId: projection.contributionId,
          modifier: projection.modifier,
          contributionControl: projection.contributionControl,
        }));
      const audit = (observations: readonly ProductionUserControlObservation[]) =>
        auditProductionUserControlObservations({
          expectedProjectionCount: expectedIdentities.length,
          expectedIdentities,
          observations,
        });
      const withTrace = (trace: RankingExecutionObservation | null) =>
        rankingWithoutAreaControlObservation(
          {
            ...candidateSet,
            executionObservations: trace ? new Map([[detail.entryId, trace]]) : new Map(),
          },
          detail,
          selectedPartyWide,
        );
      const wrongSource = (
        alternate: NonNullable<RankingExecutionObservation['withoutAreaExecution']>,
      ) => {
        const alteredDetail = {
          ...detail,
          areaContribution: {
            ...withoutArea,
            effectiveContributions: alternate.effectiveContributions,
          },
        };
        return rankingWithoutAreaControlObservation(
          {
            ...candidateSet,
            executionObservations: new Map([
              [
                detail.entryId,
                {
                  ...profileObservation,
                  withoutAreaExecution: alternate,
                  withoutAreaEffectiveContributions: alternate.effectiveContributions,
                },
              ],
            ]),
          },
          alteredDetail,
          selectedPartyWide,
        );
      };
      const alternate = profileObservation.withoutAreaExecution;
      if (!alternate) throw new Error('actual alternate execution required');
      const alteredContribution = (
        change: (
          contribution: NonNullable<
            RankingExecutionObservation['withoutAreaExecution']
          >['effectiveContributions']['contributions'][number],
        ) => NonNullable<
          RankingExecutionObservation['withoutAreaExecution']
        >['effectiveContributions']['contributions'][number],
      ) =>
        wrongSource({
          ...alternate,
          effectiveContributions: {
            ...alternate.effectiveContributions,
            contributions: alternate.effectiveContributions.contributions.map(change),
          },
        });
      const withoutSource = { ...observation };
      delete withoutSource.rankingSource;
      const failureCases: Record<string, ProductionUserControlObservation> = {
        traceMissing: withTrace(null),
        selectedTraceMissing: withTrace({
          ...profileObservation,
          selected: { battlePointWitness: null, targetExecution: null },
        }),
        alternateTraceMissing: withTrace({ ...profileObservation, withoutAreaAlternate: null }),
        wrongCandidate: withTrace({ ...profileObservation, candidateKey: 'wrong-candidate' }),
        swappedTraces: withTrace({
          ...profileObservation,
          selected: profileObservation.withoutAreaAlternate,
          withoutAreaAlternate: profileObservation.selected,
        }),
        swappedExecutions: withTrace({
          ...profileObservation,
          selectedExecution: alternate,
          withoutAreaExecution: profileObservation.selectedExecution,
        }),
        alternateUsesSelected: withTrace({
          ...profileObservation,
          withoutAreaAlternate: profileObservation.selected,
          withoutAreaExecution: profileObservation.selectedExecution,
          withoutAreaInput: profileObservation.selectedInput,
          withoutAreaEffectiveContributions: profileObservation.selectedEffectiveContributions,
        }),
        selectedInputCopy: withTrace({
          ...profileObservation,
          selectedInput: { ...profileObservation.selectedInput },
        }),
        alternateInputCopy: withTrace({
          ...profileObservation,
          withoutAreaInput: { ...withoutArea.withoutAreaInput },
        }),
        selectedContributionsCopy: withTrace({
          ...profileObservation,
          selectedEffectiveContributions: { ...profileObservation.selectedEffectiveContributions },
        }),
        alternateContributionsCopy: withTrace({
          ...profileObservation,
          withoutAreaEffectiveContributions: { ...withoutArea.effectiveContributions },
        }),
        wrongProfile: {
          ...observation,
          identity: { ...observation.identity, profileKey: 'wrong-profile' },
        },
        wrongOwner: {
          ...observation,
          identity: { ...observation.identity, ownerId: 'wrong-owner' },
        },
        wrongPath: {
          ...observation,
          identity: { ...observation.identity, path: 'selectedProfile' },
        },
        bindingChanged: {
          ...observation,
          excluded: {
            ...observation.excluded,
            inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.3 },
          },
        },
        resultCopy: {
          ...observation,
          excluded: {
            ...observation.excluded,
            damageResult: {
              ...observation.excluded.damageResult,
              rows: structuredClone(observation.excluded.damageResult.rows),
            },
          },
        },
        resultSwapped: {
          ...observation,
          excluded: { ...observation.excluded, damageResult: observation.enabled.damageResult },
        },
        partyWideStillEffective: alteredContribution((contribution) =>
          contribution.operationId === selectedPartyWide.operationId
            ? { ...contribution, effective: true }
            : contribution,
        ),
        areaReasonMissing: alteredContribution((contribution) =>
          contribution.operationId === selectedPartyWide.operationId
            ? { ...contribution, areaViewDecision: { kind: 'included' } }
            : contribution,
        ),
        areaReasonWrong: alteredContribution((contribution) =>
          contribution.operationId === selectedPartyWide.operationId
            ? { ...contribution, areaViewDecision: { kind: 'excluded', reason: 'selfBuffPolicy' } }
            : contribution,
        ),
        personalExcluded: alteredContribution((contribution) =>
          contribution.modifier === 'attackBuff' &&
          contribution.operationId !== selectedPartyWide.operationId
            ? {
                ...contribution,
                effective: false,
                areaViewDecision: { kind: 'excluded', reason: 'areaView' },
              }
            : contribution,
        ),
        sourceMissing: withoutSource,
      };
      for (const sideName of ['enabled', 'excluded'] as const) {
        const side = observation[sideName];
        failureCases[`${sideName}EventMissing`] = {
          ...observation,
          [sideName]: { ...side, operationEvents: [] },
        };
        failureCases[`${sideName}EventIdentity`] = {
          ...observation,
          [sideName]: {
            ...side,
            operationEvents: side.operationEvents.map((event) => ({
              ...event,
              operationId: 'wrong-operation',
            })),
          },
        };
        failureCases[`${sideName}ProjectionIdentity`] = {
          ...observation,
          [sideName]: {
            ...side,
            projections: side.projections.map((projection) => ({
              ...projection,
              projectionKey: 'wrong-projection',
            })),
          },
        };
        failureCases[`${sideName}ContributionIdentity`] = {
          ...observation,
          [sideName]: {
            ...side,
            effectiveContributions: side.effectiveContributions.map((contribution) => ({
              ...contribution,
              contributionId: 'wrong-contribution',
            })),
          },
        };
        failureCases[`${sideName}DuplicateProjection`] = {
          ...observation,
          [sideName]: { ...side, projections: [...side.projections, ...side.projections] },
        };
      }
      const target = profileObservation.withoutAreaAlternate.targetExecution;
      failureCases.wrongTarget = withTrace({
        ...profileObservation,
        withoutAreaAlternate: {
          ...profileObservation.withoutAreaAlternate,
          targetExecution: {
            ...target,
            targetCandidate: {
              ...target.targetCandidate,
              classId: target.targetCandidate.classId === 'saber' ? 'archer' : 'saber',
            },
          },
        },
      });
      failureCases.nonSelected = withTrace({
        ...profileObservation,
        withoutAreaAlternate: { ...profileObservation.withoutAreaAlternate, targetExecution: null },
      });
      failureCases.planCandidateMismatch = rankingWithoutAreaControlObservation(
        {
          ...candidateSet,
          plan: {
            ...candidateSet.plan,
            candidateKeys: candidateSet.plan.candidateKeys.map(() => 'wrong-planned-candidate'),
          },
        },
        detail,
        selectedPartyWide,
      );
      failureCases.detailInputCopy = rankingWithoutAreaControlObservation(
        candidateSet,
        { ...detail, input: { ...detail.input } },
        selectedPartyWide,
      );
      failureCases.alternateResultCopy = rankingWithoutAreaControlObservation(
        candidateSet,
        {
          ...detail,
          areaContribution: {
            ...withoutArea,
            withoutAreaResult: { ...withoutArea.withoutAreaResult },
          },
        },
        selectedPartyWide,
      );
      failureCases.alternateEffectsCopy = rankingWithoutAreaControlObservation(
        candidateSet,
        {
          ...detail,
          areaContribution: {
            ...withoutArea,
            withoutAreaEffects: [...withoutArea.withoutAreaEffects],
          },
        },
        selectedPartyWide,
      );
      failureCases.policyMismatch = rankingWithoutAreaControlObservation(
        candidateSet,
        {
          ...detail,
          areaContribution: {
            ...withoutArea,
            contributionPolicy: detail.contributionPolicy,
          },
        },
        selectedPartyWide,
      );
      for (const status of ['invalid', 'unsupported', 'inputRequired', 'unavailable'] as const) {
        failureCases[`alternateOutcome:${status}`] = {
          ...observation,
          excluded: {
            ...observation.excluded,
            damageResult: { status, rows: [] },
          },
        };
      }
      const passing = audit([observation]);
      const rejected = Object.fromEntries(
        Object.entries(failureCases).map(([name, candidate]) => [name, audit([candidate])]),
      );
      rejected.inventoryMissing = audit([]);
      rejected.inventoryDuplicate = audit([observation, observation]);
      await writeProductionAuditArtifact(task.meta, 'production-without-area-fixture.json', {
        schemaVersion: 1,
        boundary: 'calculation-application-ranking-without-area-fixture',
        population: 'schemaLegalFixture',
        canonicalIdentity: passing.canonicalIdentity,
        expectedIdentities,
        observations: [observation],
        sourceChecks: rankingUserControlChecks(observation),
        gate: passing,
        failureCases: Object.fromEntries(
          Object.entries(failureCases).map(([name, candidate]) => [
            name,
            { observation: candidate, gate: rejected[name] },
          ]),
        ),
        inventoryFailures: {
          missing: rejected.inventoryMissing,
          duplicate: rejected.inventoryDuplicate,
        },
      });
      expect(passing).toMatchObject({
        status: 'passed',
        summary: { selectedProfileCount: 0, withoutAreaAlternateCount: expectedIdentities.length },
        failures: [],
      });
      for (const [name, gate] of Object.entries(rejected)) {
        expect(gate.status, name).toBe('failed');
        if (gate.status === 'failed') {
          expect(gate.failures.length, name).toBeGreaterThan(0);
          const expectedReason = name.startsWith('inventory')
            ? 'userControlInventoryCoverageMismatch'
            : 'userControlRankingSourceMismatch';
          expect(
            gate.failures.some((failure) => failure.reason === expectedReason),
            name,
          ).toBe(true);
          expect(gate.firstDifference, name).not.toBeNull();
          expect(
            gate.failures.every(
              (failure) =>
                failure.reason.length > 0 &&
                failure.canonicalIdentity.length > 0 &&
                Object.keys(failure.firstDifference).length > 0,
            ),
            name,
          ).toBe(true);
        }
      }
      expect(
        candidateSet.plan.preparedRankingScenarios.some(
          (candidate) => 'executionObservation' in candidate,
        ),
      ).toBe(false);
      expect(candidateSet.executions.some((execution) => 'executionObservation' in execution)).toBe(
        false,
      );
      const exactEvent = (
        events: typeof selectedTargetExecution.operationEvents,
        projection: NonNullable<typeof selectedPartyWide>,
      ) => {
        const matches = events.filter(
          (event) =>
            event.operationId === projection.operationId &&
            event.projectionKey === projection.projectionKey &&
            event.contributionId === projection.contributionId,
        );
        if (matches.length !== 1) throw new Error('exact party-wide operation event required');
        return matches[0]!;
      };
      const selectedPartyWideEvent = exactEvent(
        selectedTargetExecution.operationEvents,
        selectedPartyWide,
      );
      const withoutAreaPartyWideEvent = exactEvent(
        withoutAreaTargetExecution.operationEvents,
        withoutAreaPartyWide,
      );

      expect(detail.input.attackBuff).toBe(0.3);
      expect(withoutArea.withoutAreaInput.attackBuff).toBe(0.1);
      expect(profileObservation.selectedInput).toBe(detail.input);
      expect(profileObservation.withoutAreaInput).toBe(withoutArea.withoutAreaInput);
      expect(withoutAreaPartyWide).toMatchObject({
        projectionKey: selectedPartyWide.projectionKey,
        operationId: selectedPartyWide.operationId,
        contributionId: selectedPartyWide.contributionId,
      });
      expect(selectedPartyWide.outcome).toBe('applied');
      expect(withoutAreaPartyWide.outcome).toBe('applied');
      expect(selectedPartyWideEvent).toMatchObject({
        operationOutcome: 'applied',
        projectionOutcome: 'applied',
        projectionKey: selectedPartyWide.projectionKey,
        operationId: selectedPartyWide.operationId,
        contributionId: selectedPartyWide.contributionId,
      });
      expect(withoutAreaPartyWideEvent).toMatchObject({
        operationOutcome: 'applied',
        projectionOutcome: 'applied',
        projectionKey: withoutAreaPartyWide.projectionKey,
        operationId: withoutAreaPartyWide.operationId,
        contributionId: withoutAreaPartyWide.contributionId,
      });
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
    },
  );

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
                      lossFloor: 'oneIfAlive' as const,
                      unit: 'fixed' as const,
                      recipient: 'unresolved' as const,
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

    const execution = calculateScenarioOutcome(scenario, resourceMaster, {
      ...versions,
      masterDataVersion: resourceMaster.version,
    });

    expect(execution.result.status).toBe('unsupported');
    if (execution.result.status !== 'unsupported') throw new Error(execution.result.status);
    expect(execution.result.rows).toEqual([]);
    expect(execution.result.missingEvidence).toContain('preparation:unsupportedHpExecution');
    expect(execution.status).toBe('rejected');
    expect(execution.appliedPreparationActions).toEqual([]);
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

  it(
    'observes the selected candidate star mutation and the later read of its capped value',
    productionAuditTestOptions(['tsk-08-star-mutation-read.json']),
    async ({ task }) => {
      const positives: {
        name: string;
        gate: ReturnType<typeof auditProductionUserControlObservations>;
        observation: ProductionUserControlObservation;
        expected: unknown;
      }[] = [];
      const negatives: {
        name: string;
        gate: ReturnType<typeof auditProductionUserControlObservations>;
        observation?: unknown;
      }[] = [];
      for (const spec of [
        { name: 'capped', sameGroup: false, intervening: false, finalValue: 99, nested: false },
        { name: 'same-group-write', sameGroup: true, intervening: true, finalValue: 84 },
        { name: 'next-group-write', sameGroup: false, intervening: true, finalValue: 84 },
        { name: 'nested-read', sameGroup: false, intervening: true, finalValue: 84, nested: true },
      ]) {
        const baseServant = fixture.servants[0]!;
        const modifier = modifierEffect('star-audit-transaction', 'upAtk', 500);
        const starMutation = {
          ...modifier,
          occurrenceId: 'star-audit-mutation:0',
          id: 'star-audit-mutation',
          label: 'star audit mutation',
          inputDefinitions: [],
          requirement: {
            recipient: 'sourceSelf' as const,
            expression: { kind: 'always' as const },
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
                values: [Array<number>(10).fill(40), [], [], [], []] as [
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
          ...modifierEffect('star-audit-reader', 'upAtk', 500),
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
              defaultValue: 69,
              defaultReason: 'fixture',
            },
          ],
          requirement: {
            recipient: 'sourceSelf' as const,
            expression: {
              kind: 'inputQuantity' as const,
              inputKey: 'battle:criticalStars',
              comparison: 'atLeast' as const,
              value: spec.finalValue,
            },
          },
        };
        const readerEffect = spec.nested
          ? {
              ...starReader,
              requirement: {
                ...starReader.requirement,
                expression: {
                  kind: 'all' as const,
                  requirements: [
                    starReader.requirement.expression,
                    {
                      kind: 'not' as const,
                      requirement: {
                        ...starReader.requirement.expression,
                        comparison: 'lessThan' as const,
                      },
                    },
                  ],
                },
              },
            }
          : starReader;
        const intervening = {
          ...starMutation,
          id: 'star-audit-loss',
          occurrenceId: 'star-audit-loss:0',
          execution: [
            {
              ...starMutation.execution[0]!,
              direction: 'loss' as const,
              amount: {
                kind: 'fixed' as const,
                values: [Array<number>(10).fill(15), [], [], [], []] as [
                  number[],
                  number[],
                  number[],
                  number[],
                  number[],
                ],
              },
            },
          ],
        };
        const mutation = spec.sameGroup
          ? { ...starMutation, execution: [...starMutation.execution, ...intervening.execution] }
          : starMutation;
        const resourceMaster = parseTestMaster({
          ...fixture,
          servants: [
            {
              ...baseServant,
              skills: [
                {
                  id: 'star-audit-skill',
                  slot: 1,
                  priority: 1,
                  name: 'star audit',
                  detail: '',
                  imageKey: null,
                  resourceRequirement: null,
                  effects: [
                    mutation,
                    ...(spec.intervening && !spec.sameGroup ? [intervening] : []),
                    readerEffect,
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
        const prepared = prepareCalculationScenarioWithPolicy(
          scenario,
          resourceMaster,
          { kind: 'calculator' },
          {},
          true,
        );
        const execution = evaluatePreparedCalculationScenario(prepared, {
          ...versions,
          masterDataVersion: resourceMaster.version,
        });
        const active = requireExecutableCalculation(execution);
        const program = criticalStarsForwardProgram(prepared, active);
        if (!program || !active.executionObservation)
          throw new Error('canonical star program required');
        // Reader identity comes from the canonical condition, independently of observed values.
        const reader = program.operations.find(
          (operation) => criticalStarsReadRequirements(operation.condition).length > 0,
        );
        if (!reader) throw new Error('canonical reader required');
        const projection = active.effects.find(
          ({ operationId }) => operationId === reader.operationId,
        );
        if (!projection || active.profileContinuity?.kind !== 'matched')
          throw new Error('reader projection/profile required');
        const excludedScenario = applyEffectControlPresentationDecision(
          scenario,
          active.effectControls.find(({ key }) => key === projection.projectionKey)!,
          false,
          active.activationRequirements,
          active.effects,
          active.effectInputs,
        );
        const excludedPrepared = prepareCalculationScenarioWithPolicy(
          excludedScenario,
          resourceMaster,
          { kind: 'calculator' },
          {},
          true,
        );
        const excluded = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(excludedPrepared, {
            ...versions,
            masterDataVersion: resourceMaster.version,
          }),
        );
        const excludedProgram = criticalStarsForwardProgram(excludedPrepared, excluded);
        if (!excludedProgram || !excluded.executionObservation)
          throw new Error('excluded canonical program required');
        const identity = selectedProfileControlIdentity(
          baseServant.id,
          projection,
          active.profileContinuity.intendedProfileKey,
        );
        const observation: ProductionUserControlObservation = {
          identity,
          enabled: userControlSideObservation(projection, active, active.executionObservation),
          excluded: userControlSideObservation(projection, excluded, excluded.executionObservation),
          criticalStarsSource: {
            enabled: criticalStarsForwardSource(program, prepared, active),
            excluded: criticalStarsForwardSource(excludedProgram, excludedPrepared, excluded),
          },
        };
        const gateInput = {
          expectedProjectionCount: 1,
          expectedIdentities: [identity],
          expectedCriticalStarsForward: [{ identity, enabled: program, excluded: excludedProgram }],
          observations: [observation],
        };
        const gate = auditProductionUserControlObservations(gateInput);
        positives.push({
          name: spec.name,
          gate,
          observation,
          expected: { initial: 69, capped: 99, read: spec.finalValue },
        });
        const target = active.executionObservation.targetExecution;
        if (!target || target.selection !== 'selected' || !target.candidateState)
          throw new Error('real selected trace required');
        const corrupt = (
          name: string,
          change: (
            candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
          ) => void,
        ) => {
          const altered = structuredClone(target);
          change(altered);
          const changed = {
            ...observation,
            enabled: {
              ...observation.enabled,
              executionObservation: { ...active.executionObservation!, targetExecution: altered },
            },
          };
          negatives.push({
            name: `${spec.name}:${name}`,
            observation: changed,
            gate: auditProductionUserControlObservations({ ...gateInput, observations: [changed] }),
          });
        };
        const groups = (
          candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
        ) => candidate.candidateState!.executionGroups as OrderedExecutionGroupAuditEvent[];
        const mutationGroup = (
          candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
        ) =>
          groups(candidate).find(({ mutations }) =>
            mutations.some(({ stateAddress }) => stateAddress === 'battle:criticalStars'),
          )!;
        const reads = (
          candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
        ) => candidate.candidateState!.inputQuantityReads as OrderedInputQuantityReadAuditEvent[];
        const firstMutation = (
          candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
        ) => mutationGroup(candidate).mutations[0]!;
        const starRead = (
          candidate: Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>,
        ) => reads(candidate).find(({ operationId }) => operationId === reader.operationId)!;
        corrupt('missing-state', (candidate) => {
          delete candidate.candidateState;
        });
        corrupt('wrong-candidate', (candidate) => {
          candidate.candidateIndex += 1;
        });
        corrupt('wrong-target', (candidate) => {
          candidate.targetCandidate = {
            ...candidate.targetCandidate,
            families: candidate.targetCandidate.families.length ? [] : ['beast'],
          };
        });
        corrupt('missing-event', (candidate) => {
          (candidate.operationEvents as unknown[]).pop();
        });
        corrupt('reverse-events', (candidate) => {
          (candidate.operationEvents as unknown[]).reverse();
        });
        corrupt('duplicate-event', (candidate) => {
          (candidate.operationEvents as unknown[]).push(candidate.operationEvents[0]);
        });
        corrupt('missing-group', (candidate) => {
          groups(candidate).splice(groups(candidate).indexOf(mutationGroup(candidate)), 1);
        });
        corrupt('wrong-group', (candidate) => {
          mutationGroup(candidate).groupIndex += 1;
        });
        corrupt('wrong-source', (candidate) => {
          mutationGroup(candidate).transactionIdentity.sourceInstanceId += ':wrong';
        });
        corrupt('wrong-transaction', (candidate) => {
          mutationGroup(candidate).transactionIdentity.transactionGroupId = 'wrong';
        });
        corrupt('duplicate-group', (candidate) => {
          groups(candidate).push(mutationGroup(candidate));
        });
        corrupt('reverse-groups', (candidate) => {
          groups(candidate).reverse();
        });
        corrupt('missing-mutation', (candidate) => {
          (mutationGroup(candidate).mutations as unknown[]).shift();
        });
        corrupt('wrong-mutation-operation', (candidate) => {
          firstMutation(candidate).operationId = reader.operationId;
        });
        corrupt('wrong-mutation-kind', (candidate) => {
          firstMutation(candidate).operationKind = 'addQuantity';
        });
        corrupt('wrong-mutation-address', (candidate) => {
          firstMutation(candidate).stateAddress = 'quantity:wrong';
        });
        corrupt('wrong-mutation-sequence', (candidate) => {
          firstMutation(candidate).operationSequence += 1;
        });
        corrupt('duplicate-mutation', (candidate) => {
          const group = mutationGroup(candidate);
          (group.mutations as unknown[]).push(group.mutations[0]);
        });
        corrupt('wrong-before', (candidate) => {
          firstMutation(candidate).before = 0;
        });
        corrupt('attempted-only', (candidate) => {
          firstMutation(candidate).afterTransaction = 98;
        });
        corrupt('rolled-back', (candidate) => {
          mutationGroup(candidate).outcome = 'rolledBack';
        });
        corrupt('rollback-proof', (candidate) => {
          mutationGroup(candidate).rollbackProof = {
            battleStateRestored: true,
            damageInputRestored: true,
          };
        });
        corrupt('missing-applied', (candidate) => {
          mutationGroup(candidate).appliedOperationIds = [];
        });
        corrupt('missing-reader', (candidate) => {
          reads(candidate).splice(reads(candidate).indexOf(starRead(candidate)), 1);
        });
        corrupt('wrong-reader-operation', (candidate) => {
          starRead(candidate).operationId = 'wrong';
        });
        corrupt('wrong-reader-address', (candidate) => {
          starRead(candidate).inputKey = 'wrong';
        });
        corrupt('wrong-reader-sequence', (candidate) => {
          starRead(candidate).operationSequence = 0;
        });
        corrupt('wrong-reader-group', (candidate) => {
          starRead(candidate).operationGroupIndex += 1;
        });
        corrupt('duplicate-reader', (candidate) => {
          reads(candidate).push(starRead(candidate));
        });
        corrupt('initial-value-read', (candidate) => {
          starRead(candidate).value = 69;
        });
        corrupt('stale-value-read', (candidate) => {
          starRead(candidate).value = spec.intervening ? 99 : 98;
        });
        corrupt('missing-read-value', (candidate) => {
          starRead(candidate).value = null;
        });
        if (spec.intervening)
          corrupt('missing-intervening-write', (candidate) => {
            for (const group of groups(candidate))
              group.mutations = group.mutations.filter(
                ({ operationSequence }) =>
                  operationSequence === firstMutation(candidate).operationSequence,
              );
          });
        corrupt('coherent-stale-receipt-and-read', (candidate) => {
          const record = firstMutation(candidate);
          record.attemptedAfter = 98;
          record.afterTransaction = 98;
          for (const read of reads(candidate)) read.value = 98;
        });
        corrupt('hidden-mutation-and-initial-read', (candidate) => {
          for (const group of groups(candidate)) group.mutations = [];
          candidate.operationEvents = candidate.operationEvents.map((event) =>
            event.operationKind === 'resourceMutation'
              ? { ...event, operationOutcome: 'notApplied', projectionOutcome: 'notApplied' }
              : event,
          );
          for (const read of reads(candidate)) read.value = 69;
        });
        const rejectSide = (name: string, side: typeof observation.enabled) =>
          negatives.push({
            name: `${spec.name}:${name}`,
            observation: { ...observation, enabled: side },
            gate: auditProductionUserControlObservations({
              ...gateInput,
              observations: [{ ...observation, enabled: side }],
            }),
          });
        rejectSide('missing-trace', {
          ...observation.enabled,
          executionObservation: { battlePointWitness: null, targetExecution: null },
        });
        rejectSide('wrong-input', {
          ...observation.enabled,
          inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.123 },
        });
        rejectSide('missing-projection', { ...observation.enabled, projections: [] });
        rejectSide('missing-effective', { ...observation.enabled, effectiveContributions: [] });
        rejectSide('wrong-effective', {
          ...observation.enabled,
          effectiveContributions: observation.enabled.effectiveContributions.map((item) => ({
            ...item,
            resolvedValue: 0.123,
          })),
        });
        rejectSide('wrong-result', {
          ...observation.enabled,
          damageResult: { ...observation.enabled.damageResult, rows: [] },
        });
        const source = observation.criticalStarsSource!.enabled!;
        const rejectSource = (name: string, alteredSource: typeof source) => {
          const altered = {
            ...observation,
            criticalStarsSource: { ...observation.criticalStarsSource, enabled: alteredSource },
          };
          negatives.push({
            name: `${spec.name}:${name}`,
            observation: altered,
            gate: auditProductionUserControlObservations({ ...gateInput, observations: [altered] }),
          });
        };
        rejectSource('copied-input-reference', { ...source, input: { ...source.input } });
        rejectSource('copied-result-reference', { ...source, result: { ...source.result } });
        rejectSource('copied-effects-reference', { ...source, effects: [...source.effects] });
        rejectSource('copied-effective-reference', {
          ...source,
          effectiveContributions: { ...source.effectiveContributions },
        });
        rejectSource('copied-calculation-reference', {
          ...source,
          calculation: { ...source.calculation },
        });
        rejectSource('copied-program-reference', { ...source, program: { ...source.program } });
        rejectSource('swapped-execution', {
          ...source,
          calculation: excluded,
          observation: excluded.executionObservation,
        });
        negatives.push({
          name: `${spec.name}:missing-contract`,
          gate: auditProductionUserControlObservations({
            ...gateInput,
            expectedCriticalStarsForward: [],
          }),
        });
        negatives.push({
          name: `${spec.name}:null-contract`,
          gate: auditProductionUserControlObservations({
            ...gateInput,
            expectedCriticalStarsForward: [
              { ...gateInput.expectedCriticalStarsForward[0]!, enabled: null },
            ],
          }),
        });
        negatives.push({
          name: `${spec.name}:missing-source`,
          gate: auditProductionUserControlObservations({
            ...gateInput,
            observations: [
              {
                identity: observation.identity,
                enabled: observation.enabled,
                excluded: observation.excluded,
              },
            ],
          }),
        });
        negatives.push({
          name: `${spec.name}:duplicate-contract`,
          gate: auditProductionUserControlObservations({
            ...gateInput,
            expectedCriticalStarsForward: [
              ...gateInput.expectedCriticalStarsForward,
              ...gateInput.expectedCriticalStarsForward,
            ],
          }),
        });
      }
      const mechanismPaths: Record<string, string> = {
        'missing-state': ':candidateState.present',
        'wrong-candidate': ':candidateIndex',
        'wrong-target': ':candidate',
        'missing-event': ':events',
        'reverse-events': ':events',
        'duplicate-event': ':events',
        'missing-group': ':groups',
        'wrong-group': ':groups',
        'wrong-source': ':groups',
        'wrong-transaction': ':groups',
        'duplicate-group': ':groups',
        'reverse-groups': ':groups',
        'missing-mutation': ':mutations.identity',
        'wrong-mutation-operation': ':mutations.identity',
        'wrong-mutation-kind': ':mutations.identity',
        'wrong-mutation-address': ':mutations.identity',
        'wrong-mutation-sequence': ':mutations.identity',
        'duplicate-mutation': ':mutations.identity',
        'wrong-before': ':before',
        'attempted-only': ':receipt',
        'rolled-back': ':committed',
        'rollback-proof': ':rollbackProof',
        'missing-applied': ':applied',
        'missing-reader': ':reads.identity',
        'wrong-reader-operation': ':reads.identity',
        'wrong-reader-address': ':reads.identity',
        'wrong-reader-sequence': ':reads.identity',
        'wrong-reader-group': ':reads.identity',
        'duplicate-reader': ':reads.identity',
        'initial-value-read': ':value',
        'stale-value-read': ':value',
        'missing-read-value': ':value',
        'missing-intervening-write': ':mutations.identity',
        'coherent-stale-receipt-and-read': ':mutations.ownerReceipts',
        'hidden-mutation-and-initial-read': ':mutations.identity',
        'missing-trace': ':selection',
        'wrong-input': ':use.inputBinding',
        'missing-projection': ':use.projections',
        'missing-effective': ':use.effectiveContributions',
        'wrong-effective': ':use.effectiveContributions',
        'wrong-result': ':use.damageResult',
        'missing-source': ':source.present',
        'duplicate-contract': ':contract',
        'missing-contract': ':contract',
        'null-contract': ':unexpected-source',
        'copied-input-reference': ':source.references',
        'copied-result-reference': ':source.references',
        'copied-effects-reference': ':source.references',
        'copied-effective-reference': ':source.references',
        'copied-calculation-reference': ':source.references',
        'copied-program-reference': ':source.references',
        'swapped-execution': ':source.references',
      };
      await recordTsk08AuditArtifact(task.meta, 'tsk-08-star-mutation-read.json', {
        schemaVersion: 2,
        population: 'schemaLegalFixture',
        canonicalIdentity: 'tsk-08:committed-critical-stars-forward',
        positives,
        negatives,
        mechanismPaths,
        firstDifference:
          positives.find(({ gate }) => gate.status !== 'passed')?.gate.firstDifference ?? null,
      });
      for (const { name, gate, observation, expected } of positives) {
        expect(gate.status, `${name}:${JSON.stringify(gate.failures)}`).toBe('passed');
        const selected = observation.enabled.executionObservation.targetExecution;
        if (!selected || selected.selection !== 'selected')
          throw new Error('selected fixture required');
        const mutation = selected.candidateState!.executionGroups.flatMap(
          ({ mutations }) => mutations,
        )[0]!;
        expect(mutation).toMatchObject({ before: 69, attemptedAfter: 99, afterTransaction: 99 });
        const reader = selected.candidateState!.inputQuantityReads.find(
          ({ operationId }) => operationId === observation.identity.operationId,
        )!;
        expect(reader.value).toBe((expected as { read: number }).read);
        expect(observation.enabled.inputBinding).toEqual({
          kind: 'bound',
          address: 'attackBuff',
          value: 0.5,
        });
        expect(observation.excluded.inputBinding).toEqual({
          kind: 'bound',
          address: 'attackBuff',
          value: 0,
        });
      }
      for (const { name, gate } of negatives) {
        expect(gate.status, name).toBe('failed');
        expect(
          gate.failures.some(({ reason }) => reason === 'userControlCriticalStarsForwardMismatch'),
          name,
        ).toBe(true);
        expect(gate.firstDifference, name).not.toBeNull();
        const expectedPath = mechanismPaths[name.split(':').at(-1)!];
        expect(expectedPath, name).toBeDefined();
        expect(
          gate.failures.some(
            ({ reason, canonicalIdentity }) =>
              reason === 'userControlCriticalStarsForwardMismatch' &&
              canonicalIdentity.includes(expectedPath!),
          ),
          `${name}:${JSON.stringify(gate.failures)}`,
        ).toBe(true);
      }
    },
  );

  it(
    'audits changed criticalStars rollback and ordered recovery use without changing unsupported outcome',
    productionAuditTestOptions(['tsk-08-execution-group-rollback.json']),
    async ({ task }) => {
      type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
      type Selected = Mutable<Extract<OrderedExecutionAuditObservation, { selection: 'selected' }>>;
      const positives: unknown[] = [];
      const negatives: {
        name: string;
        reason: CriticalStarsRecoveryFailureReason;
        path: string;
        gate: CriticalStarsRecoveryGate;
        transport?: unknown;
      }[] = [];
      const gates: CriticalStarsRecoveryGate[] = [];
      const witnesses: {
        name: string;
        mutations: readonly OrderedExecutionGroupAuditEvent[];
        restored: number;
        finalRead: number;
        actualFinalRead: number | null | undefined;
        failedContributionEffective: boolean | undefined;
        attackBuff: number;
        powerMod: number;
        expectedPowerMod: number;
        condition: 'satisfied' | 'unsatisfied' | 'unresolved' | undefined;
        expectedCondition: 'satisfied' | 'unsatisfied';
        expectedMutations: readonly {
          before: number;
          attemptedAfter: number;
          afterTransaction: number;
        }[];
        readerEffective: boolean | undefined;
        immediateRead: number | null | undefined;
        expectedImmediateRead: number | undefined;
        ordinaryParity: boolean;
      }[] = [];
      for (const spec of [
        {
          name: 'changed-restoration',
          prior: false,
          multiple: false,
          intervening: false,
          nested: false,
          satisfied: true,
        },
        {
          name: 'group-start-after-commit',
          prior: true,
          multiple: false,
          intervening: false,
          nested: false,
          satisfied: true,
        },
        {
          name: 'multiple-attempts',
          prior: true,
          multiple: true,
          intervening: false,
          nested: false,
          satisfied: true,
        },
        {
          name: 'intervening-commit-nested-read',
          prior: true,
          multiple: true,
          intervening: true,
          nested: true,
          satisfied: true,
        },
        {
          name: 'unsatisfied-recovery-reader',
          prior: false,
          multiple: false,
          intervening: false,
          nested: false,
          satisfied: false,
        },
      ]) {
        const baseServant = fixture.servants[0]!;
        const modifier = modifierEffect(`recovery-${spec.name}`, 'upAtk', 500);
        const starFunction = (amount: number | null, direction: 'gain' | 'loss' = 'gain') => ({
          kind: 'resourceMutation' as const,
          resource: 'criticalStars' as const,
          direction,
          unit: 'fixed' as const,
          recipient: 'sourceSelf' as const,
          amount: {
            kind: 'fixed' as const,
            values: [Array<number | null>(10).fill(amount), [], [], [], []] as [
              (number | null)[],
              (number | null)[],
              (number | null)[],
              (number | null)[],
              (number | null)[],
            ],
          },
          subjectId: null,
        });
        const mutationEffect = (name: string, amount: number) => ({
          ...modifierEffect(name, 'upAtk', 0),
          execution: [starFunction(amount)],
        });
        const restored = spec.prior ? 30 : 20;
        const finalRead = spec.intervening ? 35 : restored;
        const requirement = {
          kind: 'inputQuantity' as const,
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast' as const,
          value: spec.satisfied ? finalRead : 80,
        };
        const reader = (
          name: string,
          nested: boolean,
          value: number,
          threshold = requirement.value,
        ) => ({
          ...modifierEffect(name, 'upDamage', value),
          inputDefinitions: [
            {
              key: 'battle:criticalStars',
              kind: 'criticalStars' as const,
              owner: 'field' as const,
              label: 'クリティカルスター',
              description: '現在値',
              minimum: 0,
              maximum: 99,
              step: 1,
              defaultValue: 20,
              defaultReason: 'fixture',
            },
          ],
          requirement: {
            recipient: 'sourceSelf' as const,
            expression: nested
              ? {
                  kind: 'all' as const,
                  requirements: [
                    { ...requirement, value: threshold },
                    {
                      kind: 'not' as const,
                      requirement: {
                        ...requirement,
                        value: threshold,
                        comparison: 'lessThan' as const,
                      },
                    },
                  ],
                }
              : { ...requirement, value: threshold },
          },
        });
        const failed = {
          ...modifier,
          inputDefinitions: reader('input-definition', false, 0).inputDefinitions,
          requirement: {
            recipient: 'sourceSelf' as const,
            expression: { ...requirement, value: 10 },
          },
          execution: [
            ...modifier.execution,
            starFunction(40),
            ...(spec.multiple ? [starFunction(15, 'loss')] : []),
            starFunction(null),
          ],
        };
        const skill = (slot: number, effects: unknown[]) => ({
          id: `recovery-${spec.name}-${slot}`,
          slot,
          priority: slot,
          name: 'recovery fixture',
          detail: '',
          imageKey: null,
          resourceRequirement: null,
          effects,
        });
        const resourceMaster = parseTestMaster({
          ...fixture,
          servants: [
            {
              ...baseServant,
              skills: [
                ...(spec.prior ? [skill(1, [mutationEffect('prior-commit', 10)])] : []),
                skill(2, [failed]),
                skill(3, [
                  ...(spec.intervening
                    ? [
                        reader('immediate-reader', false, 100, restored),
                        mutationEffect('intervening-commit', 5),
                      ]
                    : []),
                  reader('final-reader', spec.nested, 700),
                ]),
              ],
            },
          ],
        });
        const scenario: ResolvedScenario = {
          ...createDefaultResolvedScenario(resourceMaster, undefined),
          preNoblePhantasmPlan: [
            ...(spec.prior
              ? [{ kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 10, choice: null }]
              : []),
            { kind: 'useSkillSlot', slot: 2, skillLevel: 10, choice: null },
            { kind: 'useSkillSlot', slot: 3, skillLevel: 10, choice: null },
            { kind: 'executeAttackNoblePhantasm' },
          ],
        };
        const prepared = prepareCalculationScenarioWithPolicy(
          scenario,
          resourceMaster,
          { kind: 'calculator' },
          {},
          true,
        );
        if (prepared.status !== 'executable' || !prepared.orderedScenario)
          throw new Error('canonical prepared fixture required');
        const execution = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(prepared, {
            ...versions,
            masterDataVersion: resourceMaster.version,
          }),
        );
        const failedOperation = prepared.orderedScenario.operations.find(
          (operation) => operation.kind === 'resourceMutation' && operation.amount === null,
        );
        if (!failedOperation) throw new Error('canonical failed operation required');
        const program = criticalStarsRecoveryProgram(prepared, execution, failedOperation);
        const source = criticalStarsRecoverySource(program);
        const input = { expected: [program], observations: [source] };
        const gate = auditCriticalStarsRecoveryObservations(input);
        gates.push(gate);
        const target = execution.executionObservation?.targetExecution;
        if (!target || target.selection !== 'selected' || !target.candidateState)
          throw new Error('selected actual state required');
        const groupIndex = program.rollbackGroupIndex;
        const rollbackGroup = target.candidateState.executionGroups[groupIndex]!;
        const recoveryIdentities = program.reads.filter(
          ({ inputKey, operationGroupIndex }) =>
            inputKey === 'battle:criticalStars' && operationGroupIndex > groupIndex,
        );
        const finalIdentity = recoveryIdentities.at(-1)!;
        const finalSequence = finalIdentity.operationSequence;
        const failedModifier = program.operations.find(
          (operation, sequence) =>
            program.groupIndexes[sequence] === groupIndex && operation.kind === 'addModifier',
        );
        const failedContribution = execution.effectiveContributions.contributions.find(
          ({ operationId }) => operationId === failedModifier?.operationId,
        );
        const ordinary = requireExecutableCalculation(
          calculateScenarioOutcome(scenario, resourceMaster, {
            ...versions,
            masterDataVersion: resourceMaster.version,
          }),
        );
        witnesses.push({
          name: spec.name,
          mutations: target.candidateState.executionGroups,
          restored,
          finalRead,
          actualFinalRead: target.candidateState.inputQuantityReads.find(
            (read) =>
              read.operationId === finalIdentity.operationId &&
              read.operationSequence === finalSequence,
          )?.value,
          failedContributionEffective: failedContribution?.effective,
          attackBuff: execution.input.attackBuff,
          powerMod: execution.input.powerMod,
          expectedPowerMod: spec.satisfied ? (spec.intervening ? 0.8 : 0.7) : 0,
          condition: target.operationEvents[finalSequence]?.condition,
          expectedCondition: spec.satisfied ? 'satisfied' : 'unsatisfied',
          expectedMutations: [
            { before: restored, attemptedAfter: restored + 40, afterTransaction: restored },
            ...(spec.multiple
              ? [
                  {
                    before: restored + 40,
                    attemptedAfter: restored + 25,
                    afterTransaction: restored,
                  },
                ]
              : []),
            {
              before: spec.multiple ? restored + 25 : restored + 40,
              attemptedAfter: spec.multiple ? restored + 25 : restored + 40,
              afterTransaction: restored,
            },
          ],
          readerEffective: execution.effectiveContributions.contributions.find(
            ({ operationId }) => operationId === finalIdentity.operationId,
          )?.effective,
          immediateRead: spec.intervening
            ? target.candidateState.inputQuantityReads.find(
                (read) => read.operationId === recoveryIdentities[0]!.operationId,
              )?.value
            : undefined,
          expectedImmediateRead: spec.intervening ? restored : undefined,
          ordinaryParity:
            JSON.stringify({
              input: ordinary.input,
              effects: ordinary.effects,
              contributions: ordinary.effectiveContributions,
              result: ordinary.result,
            }) ===
            JSON.stringify({
              input: execution.input,
              effects: execution.effects,
              contributions: execution.effectiveContributions,
              result: execution.result,
            }),
        });
        positives.push({
          name: spec.name,
          canonicalProgram: {
            operations: program.operations,
            groups: program.groups,
            reads: program.reads,
            initialValue: program.initialValue,
            rollbackGroupIndex: groupIndex,
          },
          owner: program.owner,
          transport: {
            observation: source.observation,
            input: source.input,
            effects: source.effects,
            effectiveContributions: source.effectiveContributions,
            result: source.result,
            readerUses: source.readerUses,
          },
          gate,
        });
        const corruptSource = (
          name: string,
          reason: CriticalStarsRecoveryFailureReason,
          path: string,
          change: (source: CriticalStarsRecoverySource) => CriticalStarsRecoverySource,
        ) => {
          const altered = change(source);
          negatives.push({
            name: `${spec.name}:${name}`,
            reason,
            path,
            gate: auditCriticalStarsRecoveryObservations({ ...input, observations: [altered] }),
            transport: {
              observation: altered.observation,
              input: altered.input,
              effects: altered.effects,
              effectiveContributions: altered.effectiveContributions,
              result: altered.result,
              readerUses: altered.readerUses,
            },
          });
        };
        const corruptLive = (
          name: string,
          path: string,
          change: (candidate: Selected) => () => void,
        ) => {
          const restore = change(target as Selected);
          try {
            negatives.push({
              name: `${spec.name}:${name}`,
              reason: 'recoverySourceMismatch',
              path,
              gate: auditCriticalStarsRecoveryObservations(input),
              transport: structuredClone({
                observation: source.observation,
                input: source.input,
                effects: source.effects,
                effectiveContributions: source.effectiveContributions,
                result: source.result,
                readerUses: source.readerUses,
              }),
            });
          } finally {
            restore();
          }
        };
        const corruptTrace = (
          name: string,
          reason: CriticalStarsRecoveryFailureReason,
          path: string,
          change: (target: Selected) => void,
        ) => {
          corruptSource(name, reason, path, (source) => {
            const altered = structuredClone(target) as Selected;
            change(altered);
            return { ...source, observation: { ...source.observation!, targetExecution: altered } };
          });
        };
        const groups = (candidate: Selected) => candidate.candidateState!.executionGroups;
        const mutations = (candidate: Selected) => groups(candidate)[groupIndex]!.mutations;
        const lastMutation = rollbackGroup.mutations.at(-1)!;
        const firstMutation = rollbackGroup.mutations[0]!;
        const readPath = `read:${finalSequence}:0:value`;
        const mutationPath = `mutation:${firstMutation.operationSequence}:afterTransaction`;
        corruptLive('changed-canonical-condition', 'canonical.ownerProgram', () => {
          const before = failedOperation.condition;
          const operation = failedOperation as { condition: typeof failedOperation.condition };
          operation.condition = { kind: 'always' };
          return () => {
            operation.condition = before;
          };
        });
        const precision = prepared.resolved.precision;
        try {
          prepared.resolved.precision = 'exact';
          negatives.push({
            name: `${spec.name}:fake-resolved-precision`,
            reason: 'recoveryOutcomeMismatch',
            path: 'resolved.precision',
            gate: auditCriticalStarsRecoveryObservations(input),
          });
        } finally {
          prepared.resolved.precision = precision;
        }
        corruptLive('copied-live-candidate', 'candidate.reference', (c) => {
          const before = c.targetCandidate;
          c.targetCandidate = structuredClone(before);
          return () => {
            c.targetCandidate = before;
          };
        });
        corruptLive('copied-live-projection', 'use.references', () => {
          const before = execution.effects[0]!;
          execution.effects[0] = { ...before };
          return () => {
            execution.effects[0] = before;
          };
        });
        corruptLive('copied-live-contribution', 'use.references', () => {
          const before = execution.effectiveContributions.contributions;
          execution.effectiveContributions.contributions = [...before];
          return () => {
            execution.effectiveContributions.contributions = before;
          };
        });
        corruptLive('copied-live-state', 'trace.references', (c) => {
          const before = c.candidateState;
          c.candidateState = structuredClone(before!);
          return () => {
            c.candidateState = before!;
          };
        });
        corruptLive('copied-live-events', 'trace.references', (c) => {
          const before = c.operationEvents;
          c.operationEvents = [...before];
          return () => {
            c.operationEvents = before;
          };
        });
        corruptLive('copied-live-group', 'trace.references', (c) => {
          const before = groups(c)[groupIndex]!;
          groups(c)[groupIndex] = structuredClone(before);
          return () => {
            groups(c)[groupIndex] = before;
          };
        });
        corruptLive('copied-live-mutation', 'trace.references', (c) => {
          const before = mutations(c)[0]!;
          mutations(c)[0] = { ...before };
          return () => {
            mutations(c)[0] = before;
          };
        });
        corruptLive('copied-live-read', 'trace.references', (c) => {
          const before = c.candidateState!.inputQuantityReads[0]!;
          c.candidateState!.inputQuantityReads[0] = { ...before };
          return () => {
            c.candidateState!.inputQuantityReads[0] = before;
          };
        });
        corruptLive('copied-live-event', 'trace.references', (c) => {
          const before = c.operationEvents[0]!;
          c.operationEvents[0] = { ...before };
          return () => {
            c.operationEvents[0] = before;
          };
        });
        corruptTrace('missing-state', 'recoveryTraceMissing', 'candidateState.present', (c) => {
          delete c.candidateState;
        });
        corruptTrace('missing-events', 'recoveryTraceMissing', 'trace.shape', (c) => {
          Reflect.deleteProperty(c, 'operationEvents');
        });
        corruptTrace('missing-groups', 'recoveryTraceMissing', 'trace.shape', (c) => {
          Reflect.deleteProperty(c.candidateState!, 'executionGroups');
        });
        corruptTrace('missing-reads', 'recoveryTraceMissing', 'trace.shape', (c) => {
          Reflect.deleteProperty(c.candidateState!, 'inputQuantityReads');
        });
        corruptTrace('wrong-candidate', 'recoveryIdentityMismatch', 'candidate.index', (c) => {
          c.candidateIndex += 1;
        });
        corruptTrace('wrong-target', 'recoveryIdentityMismatch', 'candidate.target', (c) => {
          c.targetCandidate.attribute = c.targetCandidate.attribute === 'sky' ? 'earth' : 'sky';
        });
        corruptTrace('missing-group', 'recoveryOrderMismatch', 'groups.identity', (c) => {
          groups(c).splice(groupIndex, 1);
        });
        corruptTrace('duplicate-group', 'recoveryOrderMismatch', 'groups.identity', (c) => {
          groups(c).push(structuredClone(groups(c)[groupIndex]!));
        });
        corruptTrace('reverse-groups', 'recoveryOrderMismatch', 'groups.identity', (c) => {
          groups(c).reverse();
        });
        corruptTrace('wrong-transaction', 'recoveryOrderMismatch', 'groups.identity', (c) => {
          groups(c)[groupIndex]!.transactionIdentity.sourceInstanceId = 'wrong-source';
        });
        corruptTrace('wrong-group-index', 'recoveryOrderMismatch', 'groups.identity', (c) => {
          groups(c)[groupIndex]!.groupIndex += 1;
        });
        corruptTrace(
          'missing-mutation',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c).shift();
          },
        );
        corruptTrace(
          'duplicate-mutation',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c).push(structuredClone(mutations(c)[0]!));
          },
        );
        corruptTrace(
          'reverse-mutations',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c).reverse();
          },
        );
        corruptTrace(
          'wrong-mutation-operation',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c)[0]!.operationId = 'wrong-operation';
          },
        );
        corruptTrace(
          'wrong-mutation-sequence',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c)[0]!.operationSequence += 1;
          },
        );
        corruptTrace(
          'wrong-address',
          'recoveryIdentityMismatch',
          `group:${groupIndex}:mutations.identity`,
          (c) => {
            mutations(c)[0]!.stateAddress = 'wrong-address';
          },
        );
        corruptTrace(
          'missing-proof',
          'recoveryRollbackMismatch',
          `group:${groupIndex}:proof`,
          (c) => {
            groups(c)[groupIndex]!.rollbackProof = null;
          },
        );
        for (const proof of ['battleStateRestored', 'damageInputRestored'] as const)
          corruptTrace(
            `false-${proof}`,
            'recoveryRollbackMismatch',
            `group:${groupIndex}:proof`,
            (c) => {
              groups(c)[groupIndex]!.rollbackProof![proof] = false;
            },
          );
        corruptTrace(
          'fake-commit',
          'recoveryRollbackMismatch',
          `group:${groupIndex}:outcome`,
          (c) => {
            groups(c)[groupIndex]!.outcome = 'committed';
          },
        );
        corruptTrace(
          'missing-issues',
          'recoveryRollbackMismatch',
          `group:${groupIndex}:issues`,
          (c) => {
            groups(c)[groupIndex]!.issues = [];
          },
        );
        corruptTrace('fake-attempt-ids', 'recoveryReceiptMismatch', 'groups.ownerReceipt', (c) => {
          groups(c)[groupIndex]!.appliedOperationIds = [];
        });
        corruptTrace('attempted-as-restored', 'recoveryRollbackMismatch', mutationPath, (c) => {
          mutations(c)[0]!.afterTransaction = mutations(c)[0]!.attemptedAfter;
        });
        corruptTrace('last-before-as-restored', 'recoveryRollbackMismatch', mutationPath, (c) => {
          mutations(c)[0]!.afterTransaction = mutations(c).at(-1)!.before;
        });
        if (spec.prior)
          corruptTrace('initial-as-restored', 'recoveryRollbackMismatch', mutationPath, (c) => {
            mutations(c)[0]!.afterTransaction = 20;
          });
        corruptTrace(
          'wrong-before',
          'recoveryReceiptMismatch',
          `mutation:${firstMutation.operationSequence}:before`,
          (c) => {
            mutations(c)[0]!.before = 1;
          },
        );
        corruptTrace('wrong-attempt', 'recoveryReceiptMismatch', 'groups.ownerReceipt', (c) => {
          mutations(c)[0]!.attemptedAfter = 1;
        });
        const finalReads = (c: Selected) =>
          c.candidateState!.inputQuantityReads.filter(
            (read) => read.operationSequence === finalSequence,
          );
        corruptTrace('missing-reader', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          c.candidateState!.inputQuantityReads = c.candidateState!.inputQuantityReads.filter(
            (read) => read.operationSequence !== finalSequence,
          );
        });
        corruptTrace('duplicate-reader', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          c.candidateState!.inputQuantityReads.push(structuredClone(finalReads(c)[0]!));
        });
        corruptTrace('reverse-reads', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          c.candidateState!.inputQuantityReads.reverse();
        });
        corruptTrace('wrong-reader-operation', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          finalReads(c)[0]!.operationId = 'wrong-reader';
        });
        corruptTrace('wrong-reader-group', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          finalReads(c)[0]!.operationGroupIndex = groupIndex;
        });
        corruptTrace('wrong-reader-sequence', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          finalReads(c)[0]!.operationSequence = 0;
        });
        corruptTrace('wrong-read-address', 'recoveryOrderMismatch', 'reads.identity', (c) => {
          finalReads(c)[0]!.inputKey = 'wrong-address';
        });
        corruptTrace('attempted-read', 'recoveryReadMismatch', readPath, (c) => {
          finalReads(c)[0]!.value = lastMutation.attemptedAfter;
        });
        corruptTrace('unknown-read', 'recoveryReadMismatch', readPath, (c) => {
          finalReads(c)[0]!.value = null;
        });
        if (spec.intervening)
          corruptTrace('stale-restored-read', 'recoveryReadMismatch', readPath, (c) => {
            finalReads(c)[0]!.value = restored;
          });
        corruptTrace(
          'coherent-wrong-receipt-and-read',
          'recoveryReceiptMismatch',
          'groups.ownerReceipt',
          (c) => {
            mutations(c).forEach((mutation) => {
              mutation.afterTransaction = 1;
            });
            finalReads(c)[0]!.value = 1;
          },
        );
        corruptTrace('missing-event', 'recoveryOrderMismatch', 'events.identity', (c) => {
          c.operationEvents.splice(finalSequence, 1);
        });
        corruptTrace('duplicate-event', 'recoveryOrderMismatch', 'events.identity', (c) => {
          c.operationEvents.push(structuredClone(c.operationEvents[finalSequence]!));
        });
        corruptTrace('reverse-events', 'recoveryOrderMismatch', 'events.identity', (c) => {
          c.operationEvents.reverse();
        });
        corruptTrace('wrong-event-sequence', 'recoveryOrderMismatch', 'events.identity', (c) => {
          c.operationEvents[finalSequence]!.sequence = 0;
        });
        corruptTrace(
          'revive-failed-event',
          'recoveryRollbackMismatch',
          `operation:${firstMutation.operationSequence}:outcome`,
          (c) => {
            c.operationEvents[firstMutation.operationSequence]!.operationOutcome = 'applied';
          },
        );
        corruptTrace(
          'reader-condition-fake',
          'recoveryReceiptMismatch',
          'events.ownerReceipt',
          (c) => {
            c.operationEvents[finalSequence]!.condition = spec.satisfied
              ? 'unsatisfied'
              : 'satisfied';
          },
        );
        corruptTrace(
          'reader-projection-fake',
          'recoveryUseMismatch',
          `operation:${finalSequence}:eventUse`,
          (c) => {
            c.operationEvents[finalSequence]!.projectionValuePermille = 123;
          },
        );
        corruptSource(
          'missing-source-observation',
          'recoveryTraceMissing',
          'target.selection',
          (s) => ({ ...s, observation: undefined }),
        );
        corruptSource(
          'same-value-copied-observation',
          'recoverySourceMismatch',
          'source.references',
          (s) => ({ ...s, observation: structuredClone(s.observation) }),
        );
        corruptSource(
          'same-value-copied-calculation',
          'recoverySourceMismatch',
          'source.references',
          (s) => ({ ...s, calculation: { ...s.calculation } }),
        );
        corruptSource(
          'wrong-program-reference',
          'recoverySourceMismatch',
          'source.references',
          (s) => ({ ...s, program: { ...program } }),
        );
        corruptSource(
          'wrong-real-execution',
          'recoverySourceMismatch',
          'source.references',
          (s) => ({ ...s, calculation: ordinary }),
        );
        corruptSource(
          'wrong-calculation-outcome',
          'recoveryOutcomeMismatch',
          'calculation.status',
          (s) => ({
            ...s,
            calculation: {
              ...s.calculation,
              status: 'rejected',
            } as unknown as typeof s.calculation,
          }),
        );
        corruptSource('missing-reader-uses', 'recoveryTraceMissing', 'source.shape', (s) => {
          const altered = { ...s };
          Reflect.deleteProperty(altered, 'readerUses');
          return altered;
        });
        corruptSource(
          'wrong-reader-effective-contribution',
          'recoveryUseMismatch',
          'contributions.ownerReceipt',
          (s) => ({
            ...s,
            effectiveContributions: {
              ...s.effectiveContributions,
              contributions: s.effectiveContributions.contributions.map((c) =>
                c.operationId === finalIdentity.operationId
                  ? { ...c, effective: !spec.satisfied }
                  : c,
              ),
            },
          }),
        );
        corruptSource(
          'wrong-reader-projection-identity',
          'recoveryUseMismatch',
          `operation:${finalSequence}:eventUse`,
          (s) => ({
            ...s,
            effects: s.effects.map((p) =>
              p.operationId === finalIdentity.operationId
                ? { ...p, contributionId: 'wrong:modifier' }
                : p,
            ),
          }),
        );
        for (const key of ['input', 'effects', 'effectiveContributions', 'result'] as const) {
          corruptSource(
            `same-value-copied-${key}`,
            'recoverySourceMismatch',
            'source.references',
            (s) => ({ ...s, [key]: structuredClone(s[key]) }),
          );
          corruptSource(`missing-${key}`, 'recoveryTraceMissing', 'source.shape', (s) => {
            const altered = { ...s };
            Reflect.deleteProperty(altered, key);
            return altered;
          });
        }
        corruptSource(
          'input-retains-failed-buff',
          'recoveryUseMismatch',
          'input.ownerReceipt',
          (s) => ({ ...s, input: { ...s.input, attackBuff: 0.5 } }),
        );
        corruptSource(
          'missing-projection',
          'recoveryUseMismatch',
          `operation:${finalSequence}:projectionCount`,
          (s) => ({
            ...s,
            effects: s.effects.filter(
              ({ operationId }) => operationId !== finalIdentity.operationId,
            ),
          }),
        );
        corruptSource(
          'duplicate-projection',
          'recoveryUseMismatch',
          `operation:${finalSequence}:projectionCount`,
          (s) => ({
            ...s,
            effects: [
              ...s.effects,
              s.effects.find(({ operationId }) => operationId === finalIdentity.operationId)!,
            ],
          }),
        );
        if (failedModifier) {
          const failedSequence = program.operations.indexOf(failedModifier);
          corruptSource(
            'revive-failed-projection',
            'recoveryRollbackMismatch',
            `operation:${failedSequence}:projection`,
            (s) => ({
              ...s,
              effects: s.effects.map((p) =>
                p.operationId === failedModifier.operationId ? { ...p, outcome: 'applied' } : p,
              ),
            }),
          );
          corruptSource(
            'revive-failed-contribution',
            'recoveryRollbackMismatch',
            `operation:${failedSequence}:effective`,
            (s) => ({
              ...s,
              effectiveContributions: {
                ...s.effectiveContributions,
                contributions: s.effectiveContributions.contributions.map((c) =>
                  c.operationId === failedModifier.operationId ? { ...c, effective: true } : c,
                ),
              },
            }),
          );
        }
        corruptSource('missing-reader-use', 'recoveryUseMismatch', 'readerUses.identity', (s) => ({
          ...s,
          readerUses: [],
        }));
        corruptSource(
          'duplicate-reader-use',
          'recoveryUseMismatch',
          'readerUses.identity',
          (s) => ({ ...s, readerUses: [...s.readerUses, s.readerUses[0]!] }),
        );
        corruptSource('wrong-reader-use', 'recoveryUseMismatch', 'readerUses.identity', (s) => ({
          ...s,
          readerUses: s.readerUses.map((use) => ({ ...use, operationId: 'wrong-use' })),
        }));
        corruptSource(
          'copied-reader-reference',
          'recoverySourceMismatch',
          `reader:${finalSequence}:observationReference`,
          (s) => ({
            ...s,
            readerUses: s.readerUses.map((use) => ({
              ...use,
              side: {
                ...use.side,
                executionObservation: structuredClone(use.side.executionObservation),
              },
            })),
          }),
        );
        corruptSource(
          'contradictory-reader-input',
          'recoveryUseMismatch',
          `reader:${finalSequence}:use`,
          (s) => ({
            ...s,
            readerUses: s.readerUses.map((use) => ({
              ...use,
              side: {
                ...use.side,
                inputBinding: { kind: 'bound', address: 'powerMod', value: 99 },
              },
            })),
          }),
        );
        corruptSource(
          'contradictory-reader-result',
          'recoveryUseMismatch',
          `reader:${finalSequence}:use`,
          (s) => ({
            ...s,
            readerUses: s.readerUses.map((use) => ({
              ...use,
              side: { ...use.side, damageResult: { status: 'calculated', rows: [] } },
            })),
          }),
        );
        for (const status of ['invalid', 'inputRequired', 'unavailable'] as const)
          corruptSource(
            `fake-${status}-result`,
            'recoveryOutcomeMismatch',
            'result.status',
            (s) => ({ ...s, result: { ...s.result, status } as unknown as typeof s.result }),
          );
        corruptSource(
          'fake-calculated-result',
          'recoveryOutcomeMismatch',
          'result.status',
          (s) => ({ ...s, result: { ...s.result, status: 'calculated' } as typeof s.result }),
        );
        corruptSource('fake-numeric-rows', 'recoveryOutcomeMismatch', 'result.rows', (s) => ({
          ...s,
          result: { ...s.result, rows: [{ maximum: 100 }] } as unknown as typeof s.result,
        }));
        for (const [name, alteredInput] of [
          ['missing-observation', { ...input, observations: [] }],
          ['missing-source', { ...input, observations: [undefined] }],
          ['duplicate-observation', { ...input, observations: [source, source] }],
          ['missing-contract', { ...input, expected: [] }],
          ['duplicate-contract', { ...input, expected: [program, program] }],
        ] as const)
          negatives.push({
            name: `${spec.name}:${name}`,
            reason: 'recoveryCoverageMismatch',
            path: 'coverage',
            gate: auditCriticalStarsRecoveryObservations(alteredInput),
          });
      }
      await recordTsk08AuditArtifact(task.meta, 'tsk-08-execution-group-rollback.json', {
        schemaVersion: 2,
        canonicalIdentity: 'tsk-08:critical-stars-recovery:schema-legal',
        population: 'schemaLegalFixture',
        positives,
        negatives,
        witnesses,
      });
      for (const gate of gates) expect(gate.status, JSON.stringify(gate.failures)).toBe('passed');
      for (const witness of witnesses) {
        const rollback = witness.mutations.find(({ outcome }) => outcome === 'rolledBack')!;
        expect(
          rollback.mutations.map(({ before, attemptedAfter, afterTransaction }) => ({
            before,
            attemptedAfter,
            afterTransaction,
          })),
        ).toEqual(witness.expectedMutations);
        expect(
          rollback.mutations.every(({ afterTransaction }) => afterTransaction === witness.restored),
        ).toBe(true);
        expect(rollback.appliedOperationIds.length).toBeGreaterThan(0);
        expect(witness.actualFinalRead).toBe(witness.finalRead);
        expect(witness.failedContributionEffective).toBe(false);
        expect(witness.attackBuff).toBe(0);
        expect(witness.powerMod).toBeCloseTo(witness.expectedPowerMod);
        expect(witness.condition).toBe(witness.expectedCondition);
        expect(witness.readerEffective).toBe(witness.expectedCondition === 'satisfied');
        expect(witness.immediateRead).toBe(witness.expectedImmediateRead);
        expect(witness.ordinaryParity).toBe(true);
      }
      for (const { name, reason, path, gate } of negatives) {
        expect(gate.status, name).toBe('failed');
        expect(
          gate.failures.some((failure) => failure.reason === reason && failure.checkPath === path),
          `${name}:${JSON.stringify(gate.failures)}`,
        ).toBe(true);
      }
    },
  );

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

  it('rejects obsolete world-fact metadata and derives exclusivity from legal facts', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const obsoleteMetadataInput = {
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
    };
    expect(() => calculationScenarioSchema.parse(obsoleteMetadataInput)).toThrow();
    const externallyParsed = calculationScenarioSchema.parse({
      ...scenario,
      worldFactAssertions: [
        {
          decisionKey: 'world:sky',
          fact: { kind: 'trait', scope: 'target', trait: 'attributeSky', present: true },
        },
        {
          decisionKey: 'world:earth',
          fact: { kind: 'trait', scope: 'target', trait: 'attributeEarth', present: true },
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
                quantity: {
                  kind: 'stacks',
                  inputs: [burn, poison].map(({ name }) => ({
                    kind: 'effectStackCount',
                    key: `stack:targetState:${encodeURIComponent(name)}`,
                    owner: 'target',
                    label: name,
                    description: 'initial count',
                    minimum: 0,
                    maximum: 3,
                    step: 1,
                    defaultValue: 0,
                    defaultReason: 'baseline',
                    quantitySource: { scope: 'targetState', trait: name },
                  })),
                },
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

    expect(calculation.input.targetStateTraits).toEqual(['buffBurn']);
    expect(calculation.input.stackStateCounts?.targetState['buffBurn']).toBe(2);
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

    const withoutStacksMaster = parseTestMaster({
      ...stackedMaster,
      servants: stackedMaster.servants.map((servant) => ({
        ...servant,
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((np) => ({ ...np, effects: [] })),
        })),
      })),
    });
    const withoutStacks = calculateScenario(
      createDefaultResolvedScenario(withoutStacksMaster, undefined),
      withoutStacksMaster,
      { ...versions, masterDataVersion: withoutStacksMaster.version },
    );
    expect(withoutStacks.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(
      withoutStacks.effects
        .filter((effect) => effect.contributionControl === 'worldAssumption')
        .map((effect) => effect.outcome),
    ).toEqual(['notApplied', 'notApplied']);
    expect(withoutStacks.effectiveContributions.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'npBase', effective: true }),
        expect.objectContaining({
          component: 'npSpecial',
          executionOutcome: 'notApplied',
          effective: false,
        }),
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

  it('includes a guaranteed self-generated NP special while keeping NP base separate', () => {
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
    const profile = { servantBuilds: {} };
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
    // The pre-§20 exclusions are retained in the TSK-14 flow and checkpoint 3b307e9.
    expect(baseline.detail.input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(contribution(baseline.detail, 'npBase')).toMatchObject({ effective: true });
    expect(contribution(baseline.detail, 'npSpecial')).toMatchObject({
      effective: true,
      conditionDecision: { kind: 'included' },
    });
    expect(rankingEffectContributes(baselineSpecial, baseline.detail.effectiveContributions)).toBe(
      true,
    );
    expect(
      createRankingRow(specialMaster.servants[0]!, baseline.detail, profile).specialDamageApplied,
    ).toBe(true);
    expect(
      baseline.detail.appliedPreparationActions.at(-1)?.selectedEffects[0]?.sourceActivation,
    ).toMatchObject({
      kind: 'read',
      read: { truth: true, certainty: 'guaranteed', clock: { phase: 'sourceUse' } },
      proc: { kind: 'resolved', outcome: 'success', certainty: 'guaranteed' },
    });

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
    expect(satisfied.detail.result.rows[0].average).toBe(baseline.detail.result.rows[0].average);
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

    const activeScenario = applyEffectPresentationDecision(
      initialScenario,
      control.projection,
      true,
      initial.activationRequirements,
      initial.effects,
    );
    const active = calculateScenario(activeScenario, procMaster, {
      ...versions,
      masterDataVersion: procMaster.version,
    });
    const special = active.effects.find((effect) => effect.modifier === 'npSpecial')!;
    expect(special.contributionControl).toBe('operation');
    const excluded = calculateScenario(
      applyEffectProjectionDecision(activeScenario, special, false),
      procMaster,
      { ...versions, masterDataVersion: procMaster.version },
    );
    expect(excluded.result.status).toBe('calculated');
    expect(excluded.input.targetStateTraits).toEqual(['buffPoison']);
    expect(excluded.input.npMultipliers).toEqual(active.input.npMultipliers);
    expect(excluded.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(
      excluded.effects.find((effect) => effect.projectionKey === special.projectionKey),
    ).toMatchObject({ outcome: 'notApplied' });
    expect(excluded.effectiveContributions.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'npBase', effective: true }),
        expect.objectContaining({ component: 'npSpecial', effective: false }),
      ]),
    );
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
      { servantBuilds: {} },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevelBasis: { kind: 'specified', npLevel: 2 },
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
      { servantBuilds: {} },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevelBasis: { kind: 'specified', npLevel: 2 },
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
        { servantBuilds: {} },
        { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
        { ...versions, masterDataVersion: conflictingMaster.version },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'semanticDomainInvalid',
      candidateSpaceIssue: {
        kind: 'semanticDomainInvalid',
        detail: 'canonical_input_definition_conflict:preparation:value',
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
      { servantBuilds: {} },
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
        { servantBuilds: {} },
        DEFAULT_RANKING_POLICY_CONDITIONS,
        { ...versions, masterDataVersion: structuralMaster.version },
        transitionedProfile,
      ),
    ).toMatchObject({
      status: 'unavailableUnderPolicy',
      reason: 'attackProfileNotReachable',
    });
  });

  it('keeps a selected attack profile through structural control changes and recovery', () => {
    const source = fixture.servants[0]!;
    const baseForm = source.actorFormGraph.forms[0]!.id;
    const firstForm = { actorId: source.id, limitCount: 1 };
    const secondForm = { actorId: source.id, limitCount: 2 };
    const baseRef = { actorFormId: baseForm, noblePhantasmId: 'base-non-attack' };
    const firstRef = { actorFormId: firstForm, noblePhantasmId: 'first-attack' };
    const secondRef = { actorFormId: secondForm, noblePhantasmId: 'second-attack' };
    const attack = source.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (attack.kind !== 'attack') throw new TypeError('fixture_attack_required');
    const firstEffect = {
      ...modifierEffect('first-structure', 'stateContext', 0),
      execution: [
        {
          kind: 'transformActorForm' as const,
          route: mutationRoute('sourceSelf'),
          targetFormId: firstForm,
        },
        {
          kind: 'selectNoblePhantasmVariant' as const,
          route: mutationRoute('sourceSelf'),
          variant: firstRef,
        },
      ],
    };
    const secondEffect = {
      ...modifierEffect('second-structure', 'stateContext', 0),
      execution: [
        {
          kind: 'transformActorForm' as const,
          route: mutationRoute('sourceSelf'),
          targetFormId: secondForm,
        },
        {
          kind: 'selectNoblePhantasmVariant' as const,
          route: mutationRoute('sourceSelf'),
          variant: secondRef,
        },
      ],
    };
    const structuralMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...source,
          actorFormGraph: {
            ...source.actorFormGraph,
            forms: [
              { ...source.actorFormGraph.forms[0]!, baseNoblePhantasmVariant: baseRef },
              {
                ...source.actorFormGraph.forms[0]!,
                id: firstForm,
                name: 'first',
                baseNoblePhantasmVariant: firstRef,
              },
              {
                ...source.actorFormGraph.forms[0]!,
                id: secondForm,
                name: 'second',
                baseNoblePhantasmVariant: secondRef,
              },
            ],
            transitions: [
              {
                id: 'first-transition',
                from: baseForm,
                to: firstForm,
                direction: 'forward' as const,
                activation: {
                  sourceKind: 'skill' as const,
                  sourceId: 'first-skill',
                  effectOccurrenceIds: [firstEffect.occurrenceId],
                },
                operations: firstEffect.execution,
              },
              {
                id: 'second-transition',
                from: firstForm,
                to: secondForm,
                direction: 'forward' as const,
                activation: {
                  sourceKind: 'skill' as const,
                  sourceId: 'second-skill',
                  effectOccurrenceIds: [secondEffect.occurrenceId],
                },
                operations: secondEffect.execution,
              },
            ],
          },
          noblePhantasmVariantGroups: [
            {
              id: 'structural-group',
              baseVariant: baseRef,
              variants: [
                {
                  kind: 'nonAttack' as const,
                  canonicalId: '1'.repeat(64),
                  ref: baseRef,
                  name: 'base',
                  priority: 1,
                  effects: [],
                },
                { ...attack, canonicalId: '2'.repeat(64), ref: firstRef, name: 'first' },
                { ...attack, canonicalId: '3'.repeat(64), ref: secondRef, name: 'second' },
              ],
            },
          ],
          baseNoblePhantasmGroupId: 'structural-group',
          skills: [
            {
              id: 'first-skill',
              slot: 1,
              priority: 1,
              name: 'first',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [firstEffect],
            },
            {
              id: 'second-skill',
              slot: 2,
              priority: 1,
              name: 'second',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [secondEffect],
            },
          ],
        },
      ],
    });
    const structuralVersions = { ...versions, masterDataVersion: structuralMaster.version };
    const base = createDefaultResolvedScenario(master, undefined);
    const command = (slot: 1 | 2) => ({
      kind: 'useSkillSlot' as const,
      slot,
      skillLevel: 10,
      choice: null,
    });
    const attackCommand = { kind: 'executeAttackNoblePhantasm' as const };
    const firstScenario: ResolvedScenario = {
      ...base,
      preNoblePhantasmPlan: [command(1), attackCommand],
    };
    const first = calculateScenario(firstScenario, structuralMaster, structuralVersions);
    expect(first.result.status).toBe('calculated');
    const firstControl = first.effectControls.find(
      ({ projection }) => projection.source.skillId === 'first-skill',
    );
    expect(firstControl).toBeDefined();
    const firstOff = applyEffectControlPresentationDecision(
      firstScenario,
      firstControl!,
      false,
      first.activationRequirements,
      first.effects,
      first.effectInputs,
    );
    const noAttack = calculateScenario(firstOff, structuralMaster, structuralVersions);
    expect(noAttack.result).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileHasNoAttack',
      rows: [],
    });
    expect(noAttack.profileContinuity).toMatchObject({ kind: 'unavailableNoAttack' });
    expect(calculationResultSchema.parse(noAttack.result)).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileHasNoAttack',
    });
    const invalidInput = calculateScenario(
      {
        ...firstOff,
        canonicalInputValues: { 'not-a-canonical-input': { kind: 'integer', value: 1 } },
      },
      structuralMaster,
      structuralVersions,
    );
    expect(invalidInput.result.status).toBe('unsupported');

    const secondScenario: ResolvedScenario = {
      ...base,
      preNoblePhantasmPlan: [command(1), command(2), attackCommand],
    };
    const second = calculateScenario(secondScenario, structuralMaster, structuralVersions);
    expect(second.result.status).toBe('calculated');
    const secondControl = second.effectControls.find(
      ({ projection }) => projection.source.skillId === 'second-skill',
    );
    expect(secondControl).toBeDefined();
    const secondOff = applyEffectControlPresentationDecision(
      secondScenario,
      secondControl!,
      false,
      second.activationRequirements,
      second.effects,
      second.effectInputs,
    );
    const changed = calculateScenario(secondOff, structuralMaster, structuralVersions);
    expect(changed.noblePhantasmVariant?.ref).toEqual(firstRef);
    expect(changed.result).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileChanged',
      rows: [],
    });
    expect(changed.profileContinuity).toMatchObject({ kind: 'unavailableDifferentAttack' });
    expect(calculationResultSchema.parse(changed.result)).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileChanged',
    });
    expect(
      executeRankingScenarios([secondOff], structuralMaster, structuralVersions)[0]?.result,
    ).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileChanged',
      rows: [],
    });
    const retained = createCalculatorPortableRequest(
      secondScenario,
      currentCalculationVersionContext(structuralMaster),
    );
    const offAttempt = attemptPortableCalculationScenarioChange(
      retained,
      second.result,
      secondOff,
      structuralMaster,
    );
    expect(offAttempt.status).toBe('committed');
    if (offAttempt.status !== 'committed') return;
    expect(offAttempt.result).toMatchObject({
      status: 'unavailable',
      reason: 'selectedAttackProfileChanged',
    });
    const recovery = attemptPortableCalculationScenarioChange(
      offAttempt.request,
      offAttempt.result,
      secondScenario,
      structuralMaster,
    );
    expect(recovery).toMatchObject({ status: 'committed', result: { status: 'calculated' } });
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
        execution: [npResourceMutation('loss', 1_000)],
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
        status: ['insufficientNpGauge', 'resourceRequirementExceedsCapacity'].includes(code)
          ? 'unavailable'
          : 'unsupported',
        rows: [],
        issues: [{ code: `preparation:${code}` }],
      });
      const request = createCalculatorPortableRequest(scenario, {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: rejectedMaster.version,
        engineVersion: ENGINE_VERSION,
      });
      const portable = executePortableCalculation(request, rejectedMaster);
      expect(portable.status).toBe(
        execution.result.status === 'unavailable' ? 'executed' : 'unsupported',
      );
      if (portable.status !== 'executed' && portable.status !== 'unsupported')
        throw new Error('unexpected portable failure');
      expect(portable.execution.result).toEqual(execution.result);
      expect(calculationResultSchema.safeParse(execution.result).success).toBe(true);
      expect(
        calculationShareSnapshotSchema.safeParse({
          kind: 'fgo-lab-calculation-share',
          schemaVersion: SCHEMA_VERSION,
          sharedAt: '2026-09-09T00:00:00.000Z',
          request,
          result: execution.result,
        }).success,
      ).toBe(true);
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
    const calculation = calculateScenarioOutcome(scenario, master, versions);

    expect(calculation).toMatchObject({
      status: 'invalid',
      result: {
        issue: { kind: 'initialHpUnavailable', source: 'craftEssence', reason: 'invalidEquipment' },
      },
    });
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
