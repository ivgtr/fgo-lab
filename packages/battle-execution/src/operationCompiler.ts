import type { ResourceMutationIdentity } from './contracts';
import { operationSourceFor, retainOperationSource } from './executionSourceObservation';
import { markerIntersects } from './markerDependency';
import { effectExecutesInNpProgram } from './npProgramScope';
import { actorFormEquals, canonicalRequirementLeaves } from '@fgo-lab/master-data';
import type {
  ActorCountPredicate,
  CanonicalEffectRequirement,
  CanonicalInputDefinition,
  CanonicalEffectContributionScope,
  EffectExecutionOperation,
  MasterEffect,
  ModifierValueExpression,
  ServantMaster,
} from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ConditionExpression,
  EffectProjection,
  OperationModifierValueExpression,
  OperationSource,
  TraitScope,
} from './contracts';
import {
  combineConditions,
  conditionRequiresQuantity,
  containsUnsupportedCondition,
  requiresUserAssumption,
} from './condition';
import { traitConditionScopeSemantics } from './conditionSemantics';
import {
  canNormalizeDamageEffect,
  operationRecipient,
  resolveContributionScope,
  resolveTargetPolicy,
  type Origin,
} from './effectRouting';
import type { SourceEffect } from './sourceCollection';
import { bindExecutionOperation } from './executionBinding';
import { selectionGroupsForCondition } from './projection';
import { runtimeInputKey } from './runtimeInputIdentity';

type ValuedOperation = Extract<
  EffectExecutionOperation,
  { kind: 'damageModifier' | 'modifierRateChange' }
>;

export function sourceMaximumHpInputKey(
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>,
): string {
  return `source:${source.origin}:${source.sourceInstanceId}:maximumHp`;
}

export function sourceMaximumHpInput(
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>,
): CanonicalInputDefinition {
  return {
    key: sourceMaximumHpInputKey(source),
    kind: 'sourceMaximumHp',
    owner: 'source',
    label: '支援元の準備開始時の最大HP',
    description: 'HP更新と割合読取を初期状態から計算するための最大HP',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    step: 1,
    defaultValue: null,
    defaultReason: null,
  };
}

export function sourceHpInputKey(source: SourceEffect): string {
  return `source:${source.origin}:${source.sourceInstanceId}:hpPermille`;
}

function guaranteedPredicateCount(
  predicate: ActorCountPredicate | null,
  traits: ReadonlySet<string> | null,
): number {
  if (!predicate) return 0;
  const atomMatches = (
    atom:
      | { kind: 'trait'; trait: { name: string; negative: boolean } }
      | { kind: 'actorProperty'; property: 'inBattle' },
  ): boolean => {
    if (atom.kind === 'actorProperty') return true;
    if (!traits) return false;
    const present = traits.has(atom.trait.name);
    return atom.trait.negative ? !present : present;
  };
  if (predicate.counting === 'matchingTraits') return predicate.atoms.filter(atomMatches).length;
  return predicate.clauses.filter((clause) => clause.every(atomMatches)).length;
}

function resolveMatchingActorMinimum(
  source: SourceEffect,
  definition: Extract<CanonicalInputDefinition, { kind: 'matchingActorCount' }>,
): { minimum: number; defaultReason: string } {
  const { countSemantics } = definition;
  const sourceCount = ['allActors', 'allies'].includes(countSemantics.population)
    ? guaranteedPredicateCount(countSemantics.sourcePredicate, new Set(source.sourceTraits))
    : 0;
  const targetCount =
    countSemantics.population === 'enemies'
      ? guaranteedPredicateCount(countSemantics.otherPredicate, null)
      : 0;
  return {
    minimum: Math.min(definition.maximum, sourceCount + targetCount),
    defaultReason:
      sourceCount > 0 && targetCount > 0
        ? '攻撃役本人と現在の宝具対象から保証できる最低値'
        : sourceCount > 0
          ? '攻撃役本人を含む保証済み最低値'
          : targetCount > 0
            ? '現在の宝具対象1体を含む保証済み最低値'
            : '外部のactorを追加しない保証済み最低値',
  };
}

export function runtimeInputDefinitionsForSource(source: SourceEffect) {
  const normalized = source.effect.inputDefinitions.map((definition) => {
    if (definition.kind === 'effectStackCount') return definition;
    const derived =
      definition.kind === 'matchingActorCount'
        ? resolveMatchingActorMinimum(source, definition)
        : { minimum: definition.minimum, defaultReason: definition.defaultReason };
    return {
      ...definition,
      key: runtimeInputKey(
        source.origin,
        source.sourceInstanceId,
        source.skillId,
        source.effect.occurrenceId,
        definition.key,
      ),
      minimum: derived.minimum,
      ...(definition.kind === 'matchingActorCount'
        ? { defaultValue: derived.minimum, defaultReason: derived.defaultReason }
        : {}),
    };
  });
  const requiresSourceHp =
    !['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin) &&
    (canonicalRequirementLeaves(source.effect.requirement.expression).some(
      (requirement) =>
        requirement.kind === 'quantity' && requirement.quantity === 'attackerHpPermille',
    ) ||
      source.effect.execution.some((operation) => {
        if (operation.kind === 'grantOcApplicationRate')
          return [...operation.cells, ...(operation.limitBreakCells ?? [])].some((row) =>
            row.some(
              (cell) =>
                cell.amount.kind === 'inverseHpLinear' || cell.amount.kind === 'hpRangeLinear',
            ),
          );
        if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
          return false;
        const expression = selectedValueExpression(source, operation);
        return (
          (expression?.kind === 'inverseHpLinear' || expression?.kind === 'hpRangeLinear') &&
          expression.quantitySource.kind === 'actorHpPermille'
        );
      }));
  return requiresSourceHp
    ? [
        ...normalized,
        {
          key: sourceHpInputKey(source),
          kind: 'sourceHpPermille' as const,
          owner: 'source' as const,
          label: `${source.sourceName}のHP割合（%）`,
          description: '効果を使用する支援元の現在HP割合',
          minimum: 0,
          maximum: 1_000,
          step: 10,
          defaultValue: 1_000,
          defaultReason: '支援元の初期HPは100%として扱う',
        },
      ]
    : normalized;
}

export function compileEffectCondition(
  effect: MasterEffect,
  origin: Origin,
  sourceId: string,
  sourceInstanceId: string,
  skillId: string,
  sourceActorIsCurrent = false,
): ConditionExpression {
  const activationSource = {
    origin,
    sourceInstanceId,
    skillId: skillId || null,
  } as const;
  const recipient = resolveTargetPolicy(
    sourceActorIsCurrent ? 'attacker' : origin,
    effect.requirement.recipient,
  );
  const actorScope = (
    scope: Extract<CanonicalEffectRequirement, { kind: 'trait' }>['scope'],
  ): TraitScope | null => {
    if (scope === 'field') return 'field';
    if (recipient === null) return null;
    const actor =
      scope === 'recipient' || scope === 'recipientState'
        ? recipient
        : recipient === 'target'
          ? 'attacker'
          : 'target';
    return scope === 'recipientState' || scope === 'opponentState'
      ? actor === 'attacker'
        ? 'attackerState'
        : 'targetState'
      : actor;
  };
  const bind = (requirement: CanonicalEffectRequirement): ConditionExpression => {
    if (requirement.kind === 'always') return requirement;
    if (requirement.kind === 'trait') {
      const scope = actorScope(requirement.scope);
      if (scope === null) return { kind: 'unsupported', reason: 'unresolvedRecipient' };
      const scopeSemantics = traitConditionScopeSemantics(scope);
      if (
        scopeSemantics.actor === 'attacker' &&
        ['cardNP', 'faceCard', 'cardExtra'].includes(requirement.trait)
      ) {
        const actual = !sourceActorIsCurrent && requirement.trait === 'cardNP';
        return actual === requirement.present
          ? { kind: 'always' }
          : { kind: 'not', expression: { kind: 'always' } };
      }
      const card =
        scopeSemantics.actor === 'attacker'
          ? ({ cardArts: 'arts', cardBuster: 'buster', cardQuick: 'quick' } as const)[
              requirement.trait as 'cardArts' | 'cardBuster' | 'cardQuick'
            ]
          : undefined;
      if (card)
        return requirement.present
          ? { kind: 'card', card }
          : { kind: 'not', expression: { kind: 'card', card } };
      return {
        kind: 'trait',
        scope,
        trait: requirement.trait,
        present: requirement.present,
        provenance: requirement.provenance,
      };
    }
    if (requirement.kind === 'targetPredicate') {
      if (recipient === null) return { kind: 'unsupported', reason: 'unresolvedRecipient' };
      const scope =
        requirement.scope === 'recipient'
          ? recipient
          : recipient === 'target'
            ? 'attacker'
            : 'target';
      return { ...requirement, scope };
    }
    if (requirement.kind === 'card')
      return requirement.present
        ? { kind: 'card', card: requirement.card }
        : { kind: 'not', expression: { kind: 'card', card: requirement.card } };
    if (requirement.kind === 'attackType') {
      const actual = !sourceActorIsCurrent && requirement.attack === 'noblePhantasm';
      return actual === requirement.present
        ? { kind: 'always' }
        : { kind: 'not', expression: { kind: 'always' } };
    }
    if (requirement.kind === 'quantity') {
      if (requirement.quantity === 'battlePointPhase') {
        if (requirement.subjectId === undefined)
          return { kind: 'unsupported', reason: 'unresolvedBattlePointDomain' };
        return {
          kind: 'quantity',
          quantity: requirement.quantity,
          subjectId: requirement.subjectId,
          comparison: requirement.comparison,
          value: requirement.value,
        };
      }
      const currentAttackerSource =
        sourceActorIsCurrent ||
        ['attacker', 'passive', 'np', 'craftEssence'].includes(origin) ||
        (requirement.subjectId === undefined && recipient === 'attacker');
      const subjectId =
        currentAttackerSource &&
        (requirement.subjectId === undefined || requirement.subjectId === sourceId)
          ? undefined
          : (requirement.subjectId ?? sourceId);
      return {
        kind: 'quantity',
        quantity: requirement.quantity,
        comparison: requirement.comparison,
        value: requirement.value,
        ...(subjectId === undefined ? {} : { subjectId }),
      };
    }
    if (requirement.kind === 'sourceQuantity') return { ...requirement, source: activationSource };
    if (requirement.kind === 'inputQuantity')
      return {
        ...requirement,
        inputKey: runtimeInputKey(
          origin,
          sourceInstanceId,
          skillId,
          effect.occurrenceId,
          requirement.inputKey,
        ),
      };
    if (requirement.kind === 'choice') return { ...requirement, source: activationSource };
    if (requirement.kind === 'operationTrigger')
      return { ...requirement, source: activationSource };
    if (requirement.kind === 'not')
      return { kind: 'not', expression: bind(requirement.requirement) };
    return {
      kind: requirement.kind,
      expressions: requirement.requirements.map(bind),
    };
  };
  return bind(effect.requirement.expression);
}

function decisionPlan(condition: ConditionExpression) {
  return {
    activation: 'user' as const,
    condition: containsUnsupportedCondition(condition)
      ? ('unsupported' as const)
      : requiresUserAssumption(condition)
        ? ('userMayAssume' as const)
        : ('evaluate' as const),
  };
}

function signedModifierValueExpression(
  expression: OperationModifierValueExpression,
  sign: 1 | -1,
): OperationModifierValueExpression {
  return expression.kind === 'inverseHpLinear'
    ? {
        ...expression,
        basePermille: expression.basePermille * sign,
        bonusAtZeroHpPermille: expression.bonusAtZeroHpPermille * sign,
      }
    : expression.kind === 'hpRangeLinear'
      ? {
          ...expression,
          basePermille: expression.basePermille * sign,
          valueAtMinimumHpPermille: expression.valueAtMinimumHpPermille * sign,
          valueAtMaximumHpPermille: expression.valueAtMaximumHpPermille * sign,
        }
      : {
          ...expression,
          basePermille: expression.basePermille * sign,
          perUnitPermille: expression.perUnitPermille * sign,
          maximumValuePermille:
            expression.maximumValuePermille === null
              ? null
              : expression.maximumValuePermille * sign,
        };
}

function selectedValue(source: SourceEffect, operation: ValuedOperation): number | undefined {
  const sets = source.limitBreak ? operation.limitBreakValues : operation.values;
  if (!sets) return undefined;
  return sets[source.valueSetIndex]?.[source.valueIndex] ?? undefined;
}

function selectedValueExpression(
  source: SourceEffect,
  operation: ValuedOperation,
): OperationModifierValueExpression | null {
  const sets = source.limitBreak
    ? operation.limitBreakValueExpressions
    : operation.valueExpressions;
  if (!sets) return null;
  const expression = sets[source.valueSetIndex]?.[source.valueIndex] ?? null;
  if (!expression) return null;
  if (expression.kind === 'stackLinear') return expression;
  if (expression.kind === 'inputLinear')
    return {
      ...expression,
      inputKey: runtimeInputKey(
        source.origin,
        source.sourceInstanceId,
        source.skillId,
        source.effect.occurrenceId,
        expression.inputKey,
      ),
    };
  return {
    ...expression,
    quantitySource:
      operationRecipient(operation, source.origin) === 'attacker'
        ? ({ kind: 'attackerHpPermille' } as const)
        : ({
            kind: 'actorHpPermille',
            actorId:
              operationRecipient(operation, source.origin) === 'target'
                ? 'enemy:0'
                : source.sourceInstanceId,
            inputKey: sourceHpInputKey(source),
          } as const),
  };
}

function decisionKey(source: SourceEffect): string {
  if (source.effect.interaction)
    return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:interaction:${source.effect.interaction.key}`;
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.occurrenceId}`;
}

function operationKey(source: SourceEffect): string {
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.occurrenceId}`;
}

function transactionGroupId(source: SourceEffect): string | null {
  if (
    source.effect.gameActivation === 'skillUse' ||
    source.effect.gameActivation === 'npBeforeDamage'
  )
    return `${source.skillId}:action`;
  if (source.effect.selection?.kind === 'playerChoice')
    return `${source.skillId}:player-choice:${source.effect.selection.group.key}:${source.effect.selection.group.candidate}`;
  if (source.effect.stateIdentity !== null)
    return `${source.skillId}:${source.effect.stateIdentity.key}`;
  return null;
}

export function sourceIdentity(source: SourceEffect): OperationSource {
  const groupId = transactionGroupId(source);
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    skillId: source.skillId,
    effectId: source.effect.id,
    effectOccurrenceId: source.effect.occurrenceId,
    ...(groupId === null ? {} : { transactionGroupId: groupId }),
  };
}

function sourceCondition(source: SourceEffect): ConditionExpression {
  const effect = compileEffectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  return source.noblePhantasmVariant
    ? combineConditions([
        effect,
        { kind: 'noblePhantasmVariant', variant: source.noblePhantasmVariant },
      ])
    : effect;
}

function baseOperation(
  source: SourceEffect,
  contributionScope: CanonicalEffectContributionScope,
  order: number,
  suffix: string,
) {
  const key = decisionKey(source);
  const identity = operationKey(source);
  const condition = sourceCondition(source);
  const plan = decisionPlan(condition);
  return {
    operationId: `${identity}:${suffix}`,
    order,
    phase:
      source.origin === 'passive' && condition.kind !== 'always'
        ? ('damageEvaluation' as const)
        : source.phase,
    source: sourceIdentity(source),
    contributionScope: resolveContributionScope(source.origin, contributionScope),
    activationSources: [],
    condition,
    decisionKey: key,
    decisionPlan: plan,
    sourceEnabled: source.sourceEnabled,
    enabledByDefault: source.enabledByDefault,
    gameActivation: source.effect.gameActivation,
    proc: source.effect.proc,
    stochasticOutcome:
      source.effect.selection?.kind === 'stochasticOutcome'
        ? {
            ...source.effect.selection.group,
            key: runtimeInputKey(
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              source.effect.occurrenceId,
              source.effect.selection.group.key,
            ),
          }
        : null,
    sourceActivation: source.sourceActivation,
    procRatePermille:
      source.effect.proc.kind === 'guaranteed'
        ? 1_000
        : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ?? null),
    activation: { kind: 'sourceDefault' as const },
    evidence: {
      rawPath: identity,
      functionId: source.effect.id,
    },
    presentation: {
      label: source.effect.label,
      sourceName: source.sourceName,
      skillName: source.skillName,
    },
    inputDefinitions: runtimeInputDefinitionsForSource(source),
  };
}

export interface CompiledOperations {
  operations: BattleOperation[];
  projections: EffectProjection[];
}

const compiledEffectCache = new WeakMap<MasterEffect, Map<string, CompiledOperations>>();

function compilationCacheKey(
  source: SourceEffect,
  actorForms: ServantMaster['actorFormGraph']['forms'],
): string {
  const needsActorForms = source.effect.execution.some(({ kind }) => kind === 'transformActorForm');
  return JSON.stringify({
    phase: source.phase,
    origin: source.origin,
    ocExecutionCommitted: source.ocExecutionCommitted,
    hpExecutionCommitted: source.hpExecutionCommitted,
    battlePointExecutionCommitted: source.battlePointExecutionCommitted,
    markerProgram: source.markerProgram,
    markerReaders: source.effect.execution.some(
      (operation) => operation.kind === 'buffInstanceMutation' && operation.marker,
    )
      ? source.markerReaders
        ? [...source.markerReaders].sort()
        : null
      : undefined,
    compilationPurpose: source.compilationPurpose,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceTraits: [...source.sourceTraits].sort(),
    skillId: source.skillId,
    skillName: source.skillName,
    valueSetIndex: source.valueSetIndex,
    valueIndex: source.valueIndex,
    limitBreak: source.limitBreak,
    sourceEnabled: source.sourceEnabled,
    enabledByDefault: source.enabledByDefault,
    noblePhantasmVariant: source.noblePhantasmVariant,
    actorForms: needsActorForms
      ? actorForms.map(({ id, traits }) => ({ id, traits: [...traits].sort() }))
      : [],
  });
}

export function compileEffectCached(
  source: SourceEffect,
  startOrder: number,
  actorForms: ServantMaster['actorFormGraph']['forms'] = [],
): CompiledOperations {
  const byKey = compiledEffectCache.get(source.effect) ?? new Map<string, CompiledOperations>();
  if (!compiledEffectCache.has(source.effect)) compiledEffectCache.set(source.effect, byKey);
  const key = compilationCacheKey(source, actorForms);
  let compiled = byKey.get(key);
  if (!compiled) {
    compiled = compileEffect({ ...source, sourceActivation: { kind: 'unread' } }, 0, actorForms);
    byKey.set(key, compiled);
  }
  return {
    operations: compiled.operations.map((operation) => {
      const copy = {
        ...operation,
        order: operation.order + startOrder,
        sourceActivation: source.sourceActivation,
      };
      const sourceOperation = operationSourceFor(operation);
      if (sourceOperation) retainOperationSource(copy, sourceOperation);
      if (source.runtimeBinding)
        bindExecutionOperation(
          copy,
          source.runtimeBinding,
          sourceOperation ? source.effect.execution.indexOf(sourceOperation) : -1,
        );
      return copy;
    }),
    projections: compiled.projections,
  };
}

function resourceMutationIdentity(
  semantic: Extract<EffectExecutionOperation, { kind: 'resourceMutation' }> & {
    resource: 'hp' | 'criticalStars' | 'battlePoint';
  },
): ResourceMutationIdentity {
  if (semantic.resource !== 'hp')
    return { resource: semantic.resource, direction: semantic.direction };
  if (semantic.direction === 'gain') return { resource: 'hp', direction: 'gain' };
  return { resource: 'hp', direction: 'loss', lossFloor: semantic.lossFloor };
}

export function compileEffect(
  source: SourceEffect,
  startOrder: number,
  actorForms: ServantMaster['actorFormGraph']['forms'] = [],
): CompiledOperations {
  const operations: BattleOperation[] = [];
  const projections: EffectProjection[] = [];
  if (!effectExecutesInNpProgram(source.effect)) return { operations, projections };
  const condition = sourceCondition(source);
  const key = decisionKey(source);
  let order = startOrder;
  const applicable: EffectExecutionOperation[] = [];
  const unsupportedResources = source.effect.execution.filter(
    (
      semantic,
    ): semantic is Extract<EffectExecutionOperation, { kind: 'resourceMutation' }> & {
      resource: 'hp' | 'criticalStars' | 'battlePoint';
    } =>
      semantic.kind === 'resourceMutation' &&
      semantic.resource !== 'npGauge' &&
      !(semantic.resource === 'hp' && source.hpExecutionCommitted) &&
      !(semantic.resource === 'battlePoint' && source.battlePointExecutionCommitted),
  );
  const retained = source.effect.execution.filter(
    (
      semantic,
    ): semantic is Extract<
      EffectExecutionOperation,
      {
        kind:
          | 'resourceMutation'
          | 'stateMutation'
          | 'hpModifier'
          | 'removeHpModifiers'
          | 'boundedPhaseIrrelevant'
          | 'buffInstanceMutation'
          | 'populationMutation'
          | 'populationFunction';
      }
    > =>
      (semantic.kind === 'resourceMutation' &&
        (semantic.resource === 'npGauge' ||
          (semantic.resource === 'hp' && source.hpExecutionCommitted) ||
          (semantic.resource === 'battlePoint' && source.battlePointExecutionCommitted))) ||
      ((semantic.kind === 'hpModifier' || semantic.kind === 'removeHpModifiers') &&
        (source.hpExecutionCommitted || source.compilationPurpose === 'dependency')) ||
      semantic.kind === 'buffInstanceMutation' ||
      semantic.kind === 'populationMutation' ||
      semantic.kind === 'populationFunction' ||
      semantic.kind === 'stateMutation' ||
      semantic.kind === 'boundedPhaseIrrelevant',
  );
  const retainedNeedsExecution =
    source.effect.proc.kind !== 'guaranteed' || condition.kind !== 'always';

  for (const semantic of source.effect.execution) {
    if (semantic.kind === 'hpModifier' || semantic.kind === 'removeHpModifiers') {
      if (!source.hpExecutionCommitted && source.compilationPurpose !== 'dependency')
        applicable.push({
          kind: 'unsupported',
          route: semantic.route,
          reason: 'resourceExecutionSemantics',
          damageRelevant: true,
        });
      continue;
    }
    if (semantic.kind === 'ocStateNonIntersection') continue;
    if (
      semantic.kind === 'ocRemovalResistance' ||
      semantic.kind === 'grantOcBoost' ||
      semantic.kind === 'grantOcApplicationRate' ||
      semantic.kind === 'removeOcState'
    ) {
      if (source.compilationPurpose === 'dependency') continue;
      if (!source.ocExecutionCommitted)
        applicable.push({
          kind: 'unsupported',
          route: semantic.route,
          reason: 'operationSemantics',
          damageRelevant: true,
        });
      else
        projections.push({
          ...makeProjection(
            source,
            key,
            'notRelevant',
            'stateMutationOnly',
            null,
            null,
            null,
            condition,
          ),
          executionSupport: 'supported',
          outcome: 'notRelevant',
          visibility: 'hidden',
          controllability: 'automatic',
          decision: { state: 'none' },
          conditionDecision: 'none',
          explanation: { code: 'stateMutationOnly', condition: null },
        });
      continue;
    }
    if (
      semantic.kind === 'resourceMutation' ||
      semantic.kind === 'battlePointCapacityModifier' ||
      semantic.kind === 'buffInstanceMutation' ||
      semantic.kind === 'populationMutation' ||
      semantic.kind === 'populationFunction' ||
      semantic.kind === 'stateMutation' ||
      semantic.kind === 'boundedPhaseIrrelevant'
    )
      continue;
    if (semantic.kind === 'unsupported') {
      const recipient = operationRecipient(semantic, source.origin);
      if (semantic.damageRelevant && recipient) applicable.push(semantic);
      continue;
    }
    if (semantic.kind === 'contextMutation' && semantic.mutation === 'addQuantity') {
      applicable.push(semantic);
      continue;
    }
    const recipient = operationRecipient(semantic, source.origin);
    const fieldMutation = semantic.kind === 'contextMutation' && semantic.scope === 'field';
    const eligibility = semantic.route.eligibility;
    const eligible =
      eligibility.kind === 'anyRecipient'
        ? recipient !== null || fieldMutation
        : recipient === eligibility.recipient;
    if (eligible) applicable.push(semantic);
    else if (
      (eligibility.kind === 'anyRecipient'
        ? eligibility.onMissing
        : recipient === null
          ? eligibility.onMissing
          : eligibility.onMismatch) === 'unsupported'
    )
      applicable.push({
        kind: 'unsupported',
        route: semantic.route,
        reason: 'operationSemantics',
        damageRelevant: true,
      });
  }

  const projectable = applicable.filter((semantic) => semantic.kind !== 'contextMutation');
  const primary = projectable.find((semantic) => semantic.kind !== 'unsupported');
  const unresolved =
    (!['attacker', 'np', 'passive', 'craftEssence'].includes(source.origin) &&
      source.effect.inputDefinitions.some(
        (input) =>
          input.kind === 'effectStackCount' &&
          input.quantitySource.scope === 'attackerState' &&
          (canonicalRequirementLeaves(source.effect.requirement.expression).some(
            (leaf) => leaf.kind === 'inputQuantity' && leaf.inputKey === input.key,
          ) ||
            applicable.some(
              (semantic) =>
                'valueExpressions' in semantic &&
                [
                  ...semantic.valueExpressions.flat(),
                  ...(semantic.limitBreakValueExpressions?.flat() ?? []),
                ].some(
                  (expression) =>
                    (expression?.kind === 'stackLinear' &&
                      expression.sources.some((item) => item.key === input.key)) ||
                    (expression?.kind === 'inputLinear' && expression.inputKey === input.key),
                ),
            )),
      )) ||
    applicable.some(
      (semantic) =>
        semantic.kind === 'unsupported' ||
        ('semanticSupport' in semantic && semantic.semanticSupport === 'unresolved'),
    );
  const valued =
    primary?.kind === 'damageModifier' || primary?.kind === 'modifierRateChange' ? primary : null;
  const value = (valued ? selectedValue(source, valued) : null) ?? null;
  const valueExpression = valued ? selectedValueExpression(source, valued) : null;
  const projectionModifier =
    primary?.kind === 'damageModifier'
      ? primary.modifier
      : primary?.kind === 'modifierRateChange'
        ? primary.modifier
        : primary?.kind === 'selectNoblePhantasmVariant' || primary?.kind === 'transformActorForm'
          ? 'npVariantSelection'
          : null;

  if (containsUnsupportedCondition(condition) && primary) {
    projections.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        projectionModifier,
        value,
        valueExpression,
        condition,
      ),
    );
    return { operations, projections };
  }
  if (unresolved) {
    projections.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        projectionModifier,
        value,
        valueExpression,
        condition,
      ),
    );
    return { operations, projections };
  }
  const missingValue = applicable.find(
    (semantic) =>
      (semantic.kind === 'damageModifier' || semantic.kind === 'modifierRateChange') &&
      selectedValue(source, semantic) === undefined,
  );
  if (missingValue?.kind === 'damageModifier' || missingValue?.kind === 'modifierRateChange') {
    projections.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        missingValue.modifier,
        null,
        selectedValueExpression(source, missingValue),
        condition,
      ),
    );
    return { operations, projections };
  }
  if (applicable.length === 0 && retained.length === 0 && unsupportedResources.length === 0) {
    if (canNormalizeDamageEffect(source.effect, source.origin))
      projections.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, null, condition),
      );
    return { operations, projections };
  }

  const suffixCounts = new Map<string, number>();
  const uniqueSuffix = (suffix: string) => {
    const count = suffixCounts.get(suffix) ?? 0;
    suffixCounts.set(suffix, count + 1);
    return count === 0 ? suffix : `${suffix}:${String(count)}`;
  };
  for (const semantic of unsupportedResources) {
    const suffix = uniqueSuffix(`unsupported-resource:${semantic.resource}`);
    const operationBase = baseOperation(source, 'personal', order++, suffix);
    const operation: BattleOperation = {
      ...operationBase,
      kind: 'resourceMutation',
      ...resourceMutationIdentity(semantic),
      resolution: 'resourceStateUnavailable',
      unit: semantic.unit,
      amount:
        semantic.amount.kind === 'fixed'
          ? ((source.limitBreak ? semantic.amount.limitBreakValues : semantic.amount.values)?.[
              source.valueSetIndex
            ]?.[source.valueIndex] ?? null)
          : null,
      subjectId: semantic.subjectId,
    };
    operations.push(operation);
    retainOperationSource(operation, semantic);
  }
  for (const semantic of retained) {
    const suffix = uniqueSuffix(`evidence:${semantic.kind}`);
    if (
      (retainedNeedsExecution ||
        (semantic.kind === 'buffInstanceMutation' &&
          semantic.mutation !== 'unsupported' &&
          semantic.mutation !== 'move')) &&
      !(
        source.hpExecutionCommitted &&
        (semantic.kind === 'hpModifier' ||
          semantic.kind === 'removeHpModifiers' ||
          (semantic.kind === 'resourceMutation' && semantic.resource === 'hp'))
      )
    )
      operations.push({
        ...baseOperation(source, 'personal', order++, suffix),
        kind: 'preserveSemanticEffect',
        ...(semantic.kind === 'buffInstanceMutation' &&
        semantic.mutation !== 'unsupported' &&
        semantic.mutation !== 'move'
          ? { buffMutation: semantic }
          : {}),
        ...(semantic.kind === 'buffInstanceMutation' &&
        semantic.marker &&
        source.markerReaders &&
        !markerIntersects(semantic, source.markerReaders)
          ? {
              markerNonIntersection: {
                kind: 'boundedMarkerNonIntersection' as const,
                readTraits: [...source.markerReaders],
                selectedProgram: source.markerProgram ?? [],
                recipientCoverage: 'allRepresentedActors' as const,
                readTiming: 'entireBoundedProgram' as const,
              },
            }
          : {}),
        semanticKind: semantic.kind,
      });
    else {
      const operationId = `${operationKey(source)}:${suffix}`;
      projections.push({
        ...makeProjection(
          source,
          key,
          'notRelevant',
          'stateMutationOnly',
          null,
          null,
          null,
          condition,
        ),
        projectionKey: operationId,
        operationId,
        executionSupport: 'supported',
        outcome: 'notRelevant',
        visibility: 'hidden',
        controllability: 'automatic',
        decision: { state: 'none' },
        conditionDecision: 'none',
        explanation: { code: 'stateMutationOnly', condition: null },
      });
    }
  }
  for (const semantic of applicable) {
    const recipient = operationRecipient(semantic, source.origin);
    if (semantic.kind === 'contextMutation') {
      if (semantic.mutation === 'addQuantity') {
        operations.push({
          ...baseOperation(
            source,
            'personal',
            order++,
            uniqueSuffix(`quantity:${semantic.quantity}`),
          ),
          decisionKey: null,
          decisionPlan: { activation: 'automatic', condition: 'evaluate' },
          kind: 'addQuantity',
          quantity: semantic.quantity,
          subjectId: semantic.subjectId,
          amount: semantic.amount,
          applicationTiming: semantic.applicationTiming,
        });
        continue;
      }
      const scope =
        semantic.scope === 'field'
          ? 'field'
          : recipient === 'attacker'
            ? 'attackerState'
            : 'targetState';
      const suffixScope = semantic.scope === 'field' ? 'field' : recipient;
      const compiledBase = baseOperation(
        source,
        semantic.route.contributionScope,
        order++,
        uniqueSuffix(`${semantic.mutation}-${String(suffixScope)}:${semantic.trait}`),
      );
      const probabilistic = source.effect.proc.kind !== 'guaranteed';
      const base = {
        ...compiledBase,
        decisionKey: probabilistic ? compiledBase.decisionKey : null,
        decisionPlan: probabilistic
          ? compiledBase.decisionPlan
          : { activation: 'automatic' as const, condition: 'evaluate' as const },
        trait: semantic.trait,
      };
      if (semantic.mutation === 'suppressInitialTrait')
        operations.push({
          ...base,
          kind: 'suppressInitialTrait',
          scope: recipient === 'attacker' ? 'attacker' : 'target',
        });
      else operations.push({ ...base, kind: semantic.mutation, scope });
    } else if (semantic.kind === 'selectNoblePhantasmVariant')
      operations.push({
        ...baseOperation(
          source,
          semantic.route.contributionScope,
          order++,
          uniqueSuffix('np-variant'),
        ),
        kind: 'selectNoblePhantasmVariant',
        variant: semantic.variant,
      });
    else if (semantic.kind === 'transformActorForm')
      operations.push({
        ...baseOperation(
          source,
          semantic.route.contributionScope,
          order++,
          uniqueSuffix('actor-form'),
        ),
        kind: 'transformActorForm',
        targetFormId: semantic.targetFormId,
        targetTraits:
          actorForms.find(({ id }) => actorFormEquals(id, semantic.targetFormId))?.traits ?? [],
      });
    else if (semantic.kind === 'modifierRateChange') {
      const operation: BattleOperation = {
        ...baseOperation(source, semantic.route.contributionScope, order++, uniqueSuffix('rate')),
        kind: 'changeModifierRate',
        modifier: semantic.modifier,
        ratePermille: selectedValue(source, semantic)!,
      };
      operations.push(operation);
      retainOperationSource(operation, semantic);
    } else if (semantic.kind === 'ignoreDefense')
      operations.push({
        ...baseOperation(
          source,
          semantic.route.contributionScope,
          order++,
          uniqueSuffix('ignore-defense'),
        ),
        kind: 'ignoreDefense',
      });
    else if (semantic.kind === 'ignoreDamageCut')
      operations.push({
        ...baseOperation(
          source,
          semantic.route.contributionScope,
          order++,
          uniqueSuffix('ignore-damage-cut'),
        ),
        kind: 'ignoreDamageCut',
      });
    else if (semantic.kind === 'damageModifier') {
      const operationValue = selectedValue(source, semantic)!;
      const operationExpression = selectedValueExpression(source, semantic);
      const operation: BattleOperation = {
        ...baseOperation(
          source,
          semantic.route.contributionScope,
          order++,
          uniqueSuffix(`modifier:${semantic.modifier}`),
        ),
        kind: 'addModifier',
        modifier: semantic.modifier,
        valuePermille: operationValue * semantic.sign,
        valueExpression: operationExpression
          ? signedModifierValueExpression(operationExpression, semantic.sign)
          : null,
        card: semantic.card,
      };
      operations.push(operation);
      retainOperationSource(operation, semantic);
    }
  }
  return { operations, projections };
}

function makeProjection(
  source: SourceEffect,
  key: string,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  modifier: EffectProjection['modifier'],
  valuePermille: number | null,
  valueExpression: ModifierValueExpression | null,
  condition: ConditionExpression,
): EffectProjection {
  const plan = decisionPlan(condition);
  const requiresAttackerHp = conditionRequiresQuantity(condition, 'attackerHpPermille');
  return {
    projectionKey: key,
    operationId: operationKey(source),
    contributionId: null,
    label: source.effect.label,
    sourceName: source.sourceName,
    skillName: source.skillName,
    gameActivation: source.effect.gameActivation,
    sourceActive: source.sourceEnabled,
    proc: source.effect.proc,
    procRatePermille:
      source.effect.proc.kind === 'guaranteed'
        ? 1_000
        : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ?? null),
    valuePermille: modifier === 'flatDamage' ? null : valuePermille,
    value:
      valuePermille === null
        ? null
        : modifier === 'flatDamage'
          ? valuePermille
          : valuePermille / 1000,
    requiredQuantity: valueExpression || requiresAttackerHp ? 'attackerHpPermille' : null,
    requiredQuantityOwner: valueExpression
      ? ['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
        ? 'attacker'
        : 'source'
      : requiresAttackerHp
        ? 'attacker'
        : null,
    requiredInputs: runtimeInputDefinitionsForSource(source),
    modifier,
    source: sourceIdentity(source),
    contributionScope: resolveContributionScope(
      source.origin,
      source.effect.execution.find((operation) => 'route' in operation)?.route.contributionScope ??
        'personal',
    ),
    contributionControl: 'operation',
    activationSources: [],
    executionSupport: 'unsupported',
    outcome: 'notApplied',
    visibility: 'visible',
    controllability: 'user',
    selectionGroups: selectionGroupsForCondition(condition),
    decision: {
      state: 'disabled',
      decisionKey: key,
      kind: 'effect',
      plan,
    },
    conditionDecision: plan.condition === 'userMayAssume' ? 'evaluate' : 'none',
    explanation: { code: 'disabled', condition },
  };
}
