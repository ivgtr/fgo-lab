import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type MasterEffect,
  type ModifierValueExpression,
  type NpDamageSpec,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type {
  BattleExecutionResult,
  BattleOperation,
  BattleState,
  ConditionExpression,
  EffectProjection,
  EffectDecision,
  ExecutionIssue,
  ExecutionPhase,
  ModifierKind,
  OperationResult,
  OperationSource,
  TraitScope,
} from './index';
import {
  combineConditions,
  containsUnsupportedCondition,
  evaluateCondition,
  isConditional,
  normalizeTraitCondition,
} from './condition';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type SatisfiableConditionConstraint,
} from './constraints';
import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';
import { applyNpDamageOperation } from './npDamageOperation';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

const NON_DAMAGE = new Set([
  'changeCommandCardType',
  'downTolerance',
  'upCriticaldamage',
  'upExtraattack',
  'upTolerance',
  'upToleranceSubstate',
]);
const POSSIBLY_DAMAGE = new Set([
  'attackBeforeFunction',
  'addSelfdamage',
  'buffRate',
  'downAtk',
  'downCommandall',
  'downNpdamage',
  'fieldIndividuality',
  'fieldIndividualityChangedFunction',
  'npattackPrevBuff',
  'subFieldIndividuality',
  'subIndividuality',
  'subSelfdamage',
  'tdTypeChange',
  'tdTypeChangeArts',
  'tdTypeChangeBuster',
  'tdTypeChangeQuick',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
const ATTACK_REDUCTION = new Set(['downAtk', 'downCommandall', 'downNpdamage']);
const DEFENSIVE = new Set([
  'subSelfdamage',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
type Origin = OperationSource['origin'];
type Recipient = 'attacker' | 'target';

interface Route {
  modifier: ModifierKind | 'ignoreDefense' | 'ignoreDamageCut';
  recipient: Recipient;
  sign: 1 | -1;
}

interface SourceEffect {
  phase: ExecutionPhase;
  origin: Origin;
  sourceInstanceId: string;
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  rawValue: number | undefined;
  valueExpression: ModifierValueExpression | null;
  enabledByDefault: boolean;
}

export interface OrderedScenarioExecution extends BattleExecutionResult {
  input: DamageResolutionInput;
}

function targetRecipient(origin: Origin, target: string): Recipient | null {
  if (target.startsWith('enemy')) return 'target';
  if (target === 'self') return origin === 'support' || origin === 'mysticCode' ? null : 'attacker';
  if (target === 'ptOther' || target === 'ptOtherFull')
    return origin === 'support' ? 'attacker' : null;
  if (target === 'ptOne' || target === 'ptAll' || target === 'ptFull') return 'attacker';
  return null;
}

function changesAttackerNpCard(effect: MasterEffect, origin: Origin): boolean {
  return (
    effect.npCardTypeChange !== null &&
    ['attacker', 'passive', 'craftEssence', 'np'].includes(origin) &&
    (effect.target === 'self' || effect.target === 'commandTypeSelfTreasureDevice')
  );
}

function rawRoute(effect: MasterEffect): Omit<Route, 'recipient'> | null {
  const types = effect.buffTypes ?? [];
  if (types.some((type) => NON_DAMAGE.has(type))) return null;
  if (types.includes('pierceDefence')) return { modifier: 'ignoreDefense', sign: 1 };
  if (types.includes('pierceSubdamage')) return { modifier: 'ignoreDamageCut', sign: 1 };
  if (types.includes('addDamage')) return { modifier: 'flatDamage', sign: 1 };
  if (
    types.some((type) =>
      ['upDamage', 'upDamageIndividuality', 'upDamageIndividualityActiveonly'].includes(type),
    )
  )
    return { modifier: 'powerMod', sign: 1 };
  if (types.includes('upAtk')) return { modifier: 'attackBuff', sign: 1 };
  if (types.includes('downAtk')) return { modifier: 'attackBuff', sign: -1 };
  if (types.includes('downDefence')) return { modifier: 'attackBuff', sign: 1 };
  if (types.includes('upDefence')) return { modifier: 'defenseBuff', sign: 1 };
  if (types.includes('upNpdamage')) return { modifier: 'npDamageBuff', sign: 1 };
  if (types.includes('downNpdamage')) return { modifier: 'npDamageBuff', sign: -1 };
  if (types.includes('downDefenceNpdamage')) return { modifier: 'npDamageBuff', sign: 1 };
  if (types.includes('upDefenceNpdamage')) return { modifier: 'npResistance', sign: 1 };
  if (
    effect.cardTypes.length &&
    types.some((type) => ['upCommandall', 'upCommandatk'].includes(type))
  )
    return { modifier: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length && types.includes('downCommandall'))
    return { modifier: 'cardBuff', sign: -1 };
  if (effect.cardTypes.length && types.includes('downDefencecommandall'))
    return { modifier: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length && types.includes('upDefencecommandall'))
    return { modifier: 'cardResistance', sign: 1 };
  return null;
}

function expectedRecipient(effect: MasterEffect): Recipient {
  return (effect.buffTypes ?? []).some((type) =>
    [
      'downDefence',
      'upDefence',
      'downDefencecommandall',
      'upDefencecommandall',
      'downDefenceNpdamage',
      'upDefenceNpdamage',
    ].includes(type),
  )
    ? 'target'
    : 'attacker';
}

function route(effect: MasterEffect, origin: Origin): Route | null {
  const value = rawRoute(effect);
  const recipient = targetRecipient(origin, effect.target);
  return value && recipient === expectedRecipient(effect) ? { ...value, recipient } : null;
}

export function canNormalizeDamageEffect(effect: MasterEffect, origin: Origin): boolean {
  if (effect.triggerScope !== null) return false;
  const recipient = targetRecipient(origin, effect.target);
  const types = effect.buffTypes ?? [];
  const potentiallyRelevant =
    !(effect.target.startsWith('enemy') && types.some((type) => ATTACK_REDUCTION.has(type))) &&
    !(!effect.target.startsWith('enemy') && types.some((type) => DEFENSIVE.has(type))) &&
    types.some((type) => POSSIBLY_DAMAGE.has(type));
  return Boolean(
    changesAttackerNpCard(effect, origin) ||
    route(effect, origin) ||
    (recipient === 'attacker' &&
      effect.buffTypes?.includes('buffRate') &&
      effect.buffRateTargets?.includes('buffNpDamageUp')) ||
    (recipient && potentiallyRelevant),
  );
}

function effectCondition(
  effect: MasterEffect,
  origin: Origin,
  sourceId: string,
  sourceInstanceId: string,
  skillId: string,
): ConditionExpression {
  const recipient = targetRecipient(origin, effect.target) ?? 'attacker';
  const holder: TraitScope = recipient;
  const opponent: TraitScope = recipient === 'target' ? 'attacker' : 'target';
  return combineConditions([
    ...effect.conditions.recipient.map((condition) => normalizeTraitCondition(condition, holder)),
    normalizeTraitCondition(effect.conditions.holder, holder),
    normalizeTraitCondition(effect.conditions.opponent, opponent),
    normalizeTraitCondition(effect.conditions.field, 'field'),
    ...effect.quantityConditions.map<ConditionExpression>((condition) => {
      const currentAttackerSource = ['attacker', 'passive', 'np', 'craftEssence'].includes(origin);
      const subjectId =
        currentAttackerSource &&
        (condition.subjectId === undefined || condition.subjectId === sourceId)
          ? undefined
          : (condition.subjectId ?? sourceId);
      return {
        kind: 'quantity',
        quantity: condition.quantity,
        ...(subjectId === undefined ? {} : { subjectId }),
        comparison: condition.comparison,
        value: condition.value,
      };
    }),
    ...effect.sourceQuantityConditions.map<ConditionExpression>((condition) => ({
      kind: 'sourceQuantity',
      ...condition,
    })),
    ...(effect.choice
      ? [
          {
            kind: 'choice' as const,
            group: `${sourceInstanceId}:${skillId}:${effect.choice.family}`,
            candidate: String(effect.choice.candidate),
          },
        ]
      : []),
    ...(effect.operationTrigger
      ? [
          {
            kind: 'operationTrigger' as const,
            source: `${sourceInstanceId}:${skillId}`,
            position: effect.operationTrigger.position,
          },
        ]
      : []),
  ]);
}

export function evaluateConditionExpression(
  condition: ConditionExpression,
  state: BattleState,
): boolean | null {
  return evaluateCondition(condition, state);
}

function decisionPlan(source: SourceEffect, condition: ConditionExpression) {
  return {
    activation: ['attacker', 'support', 'mysticCode'].includes(source.origin)
      ? ('user' as const)
      : ('automatic' as const),
    condition: containsUnsupportedCondition(condition)
      ? ('unsupported' as const)
      : isConditional(condition)
        ? ('userMayAssume' as const)
        : ('evaluate' as const),
  };
}

function parameter(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  limitBreak = false,
): number | undefined {
  const sets =
    limitBreak && effect.limitBreakParameterSets
      ? effect.limitBreakParameterSets
      : effect.parameterSets;
  const value = sets[setIndex]?.[valueIndex]?.['Value'];
  return typeof value === 'number' ? value : undefined;
}

function modifierValueExpression(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  limitBreak = false,
): ModifierValueExpression | null {
  const sets =
    limitBreak && effect.limitBreakModifierValueExpressionSets
      ? effect.limitBreakModifierValueExpressionSets
      : effect.modifierValueExpressionSets;
  return sets[setIndex]?.[valueIndex] ?? null;
}

function signedModifierValueExpression(
  expression: ModifierValueExpression,
  sign: 1 | -1,
): ModifierValueExpression {
  return expression.kind === 'inverseHpLinear'
    ? {
        ...expression,
        basePermille: expression.basePermille * sign,
        bonusAtZeroHpPermille: expression.bonusAtZeroHpPermille * sign,
      }
    : {
        ...expression,
        basePermille: expression.basePermille * sign,
        valueAtMinimumHpPermille: expression.valueAtMinimumHpPermille * sign,
        valueAtMaximumHpPermille: expression.valueAtMaximumHpPermille * sign,
      };
}

function decisionKey(source: SourceEffect): string {
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.occurrenceId}`;
}

function sourceIdentity(source: SourceEffect): OperationSource {
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    skillId: source.skillId,
    effectId: source.effect.id,
    effectOccurrenceId: source.effect.occurrenceId,
  };
}

function baseOperation(source: SourceEffect, order: number, suffix: string) {
  const key = decisionKey(source);
  const condition = effectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  const plan = decisionPlan(source, condition);
  return {
    operationId: `${key}:${suffix}`,
    order,
    phase:
      source.origin === 'passive' && condition.kind !== 'always'
        ? ('damageEvaluation' as const)
        : source.phase,
    source: sourceIdentity(source),
    condition,
    decisionKey: plan.activation === 'user' || plan.condition === 'userMayAssume' ? key : null,
    decisionPlan: plan,
    enabledByDefault: source.enabledByDefault,
    evidence: { rawPath: key, functionId: source.effect.id, parameterKeys: [] },
    presentation: {
      label: source.effect.label,
      sourceName: source.sourceName,
      skillName: source.skillName,
    },
  };
}

interface CompiledOperations {
  operations: BattleOperation[];
  unsupported: EffectProjection[];
}

function compileEffect(source: SourceEffect, startOrder: number): CompiledOperations {
  const operations: BattleOperation[] = [];
  const unsupported: EffectProjection[] = [];
  if (source.effect.triggerScope !== null) return { operations, unsupported };
  const condition = effectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  const key = decisionKey(source);
  let order = startOrder;
  for (const trait of source.effect.contextChanges.addedFieldTraits)
    operations.push({
      ...baseOperation(source, order++, `add-field:${trait}`),
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      kind: 'addTrait',
      scope: 'field',
      trait,
    });
  for (const trait of source.effect.contextChanges.removedFieldTraits)
    operations.push({
      ...baseOperation(source, order++, `remove-field:${trait}`),
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      kind: 'removeTrait',
      scope: 'field',
      trait,
    });
  const recipient = targetRecipient(source.origin, source.effect.target);
  if (recipient)
    for (const trait of source.effect.contextChanges.addedRecipientTraits)
      operations.push({
        ...baseOperation(source, order++, `add-${recipient}:${trait}`),
        decisionKey: null,
        decisionPlan: { activation: 'automatic', condition: 'evaluate' },
        kind: 'addTrait',
        scope: recipient === 'attacker' ? 'attackerState' : 'targetState',
        trait,
      });
  const routed = route(source.effect, source.origin);
  const cardTypeChange = changesAttackerNpCard(source.effect, source.origin)
    ? source.effect.npCardTypeChange
    : null;
  const rateChange =
    source.effect.buffTypes?.includes('buffRate') &&
    source.effect.buffRateTargets?.includes('buffNpDamageUp');
  if (containsUnsupportedCondition(condition) && (routed || rateChange || cardTypeChange)) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ??
          (rateChange ? 'npDamageBuff' : cardTypeChange ? 'cardTypeChange' : null),
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (!routed && !rateChange && !cardTypeChange) {
    if (operations.length === 0 && canNormalizeDamageEffect(source.effect, source.origin))
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, condition),
      );
    return { operations, unsupported };
  }
  if (
    source.effect.parameterSemantics.unresolved.length ||
    source.effect.unresolvedSemanticKeys.length
  ) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ?? (cardTypeChange ? 'cardTypeChange' : null),
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (cardTypeChange) {
    operations.push({
      ...baseOperation(source, order++, `card:${cardTypeChange}`),
      kind: 'changeCardType',
      card: cardTypeChange,
      stateTraits: source.effect.npCardTypeStateTraits,
    });
  } else if (rateChange) {
    if (source.rawValue === undefined)
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', 'npDamageBuff', null, condition),
      );
    else
      operations.push({
        ...baseOperation(source, order++, 'rate'),
        kind: 'changeModifierRate',
        modifier: 'npDamageBuff',
        ratePermille: source.rawValue,
      });
  } else if (routed?.modifier === 'ignoreDefense')
    operations.push({ ...baseOperation(source, order++, 'ignore-defense'), kind: 'ignoreDefense' });
  else if (routed?.modifier === 'ignoreDamageCut')
    operations.push({
      ...baseOperation(source, order++, 'ignore-damage-cut'),
      kind: 'ignoreDamageCut',
    });
  else if (routed) {
    if (source.rawValue === undefined)
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', routed.modifier, null, condition),
      );
    else
      operations.push({
        ...baseOperation(source, order++, `modifier:${routed.modifier}`),
        kind: 'addModifier',
        modifier: routed.modifier,
        valuePermille: source.rawValue * routed.sign,
        valueExpression: source.valueExpression
          ? {
              ...signedModifierValueExpression(source.valueExpression, routed.sign),
              ...(['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
                ? {}
                : { subjectId: source.sourceId }),
            }
          : null,
        card:
          routed.modifier === 'cardBuff' || routed.modifier === 'cardResistance'
            ? (source.effect.cardTypes[0] ?? null)
            : null,
      });
  }
  return { operations, unsupported };
}

function collectSources(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
): { sources: SourceEffect[]; issues: ExecutionIssue[] } {
  const sources: SourceEffect[] = [];
  const issues: ExecutionIssue[] = [];
  const attacker = master.servants.find((servant) => servant.id === input.attackerId);
  if (!attacker)
    return {
      sources,
      issues: [
        {
          kind: 'unsupportedOperation',
          operationId: 'attacker',
          detail: 'attacker_source_missing',
        },
      ],
    };
  const appendSkill = (
    origin: Origin,
    phase: ExecutionPhase,
    sourceInstanceId: string,
    sourceId: string,
    skillId: string,
    skillLevel: number,
    enabledByDefault: boolean,
  ) => {
    const servant = master.servants.find((candidate) => candidate.id === sourceId);
    const skill = [...(servant?.skills ?? []), ...(servant?.passives ?? [])].find(
      (candidate) => candidate.id === skillId,
    );
    if (!servant || !skill) {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `${origin}:${sourceId}:${skillId}`,
        detail: 'source_missing',
      });
      return;
    }
    for (const effect of skill.effects)
      sources.push({
        phase,
        origin,
        sourceInstanceId,
        sourceId,
        sourceName: servant.name,
        skillId,
        skillName: skill.name,
        effect,
        rawValue: parameter(effect, 0, skillLevel - 1),
        valueExpression: modifierValueExpression(effect, 0, skillLevel - 1),
        enabledByDefault,
      });
  };
  for (const passive of attacker.passives)
    appendSkill('passive', 'passive', `passive:${attacker.id}`, attacker.id, passive.id, 1, true);
  for (const selected of scenario.attackerSkills)
    appendSkill(
      'attacker',
      'attackerSkill',
      `attacker:${attacker.id}`,
      attacker.id,
      selected.skillId,
      selected.skillLevel,
      false,
    );
  if (scenario.craftEssence) {
    const ce = master.craftEssences.find(
      (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
    );
    if (!ce)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `craftEssence:${scenario.craftEssence.craftEssenceId}`,
        detail: 'source_missing',
      });
    else
      for (const effect of ce.effects)
        sources.push({
          phase: 'craftEssence',
          origin: 'craftEssence',
          sourceInstanceId: `craftEssence:${ce.id}`,
          sourceId: ce.id,
          sourceName: ce.name,
          skillId: `ce:${ce.id}`,
          skillName: ce.name,
          effect,
          rawValue: parameter(effect, 0, 0, scenario.craftEssence.limitBreak === 4),
          valueExpression: modifierValueExpression(
            effect,
            0,
            0,
            scenario.craftEssence.limitBreak === 4,
          ),
          enabledByDefault: true,
        });
  }
  if (scenario.support)
    for (const source of scenario.support.composition.sources)
      for (const skill of source.skills)
        appendSkill(
          'support',
          'support',
          source.sourceInstanceId,
          source.servantId,
          skill.skillId,
          skill.skillLevel,
          false,
        );
  if (scenario.mysticCode) {
    const code = master.mysticCodes.find(
      (candidate) => candidate.id === scenario.mysticCode?.mysticCodeId,
    );
    if (!code)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `mysticCode:${scenario.mysticCode.mysticCodeId}`,
        detail: 'source_missing',
      });
    else
      for (const selected of scenario.mysticCode.skills) {
        const skill = code.skills.find((candidate) => candidate.id === selected.skillId);
        if (!skill) {
          issues.push({
            kind: 'unsupportedOperation',
            operationId: `mysticCode:${code.id}:${selected.skillId}`,
            detail: 'source_missing',
          });
          continue;
        }
        for (const effect of skill.effects)
          sources.push({
            phase: 'mysticCode',
            origin: 'mysticCode',
            sourceInstanceId: `mysticCode:${code.id}`,
            sourceId: code.id,
            sourceName: code.name,
            skillId: skill.id,
            skillName: skill.name,
            effect,
            rawValue: parameter(effect, 0, selected.skillLevel - 1),
            valueExpression: modifierValueExpression(effect, 0, selected.skillLevel - 1),
            enabledByDefault: false,
          });
      }
  }
  const np = getPrimaryNoblePhantasm(attacker);
  if (np)
    for (const effect of np.effects.filter((candidate) => candidate.timing === 'beforeDamage'))
      sources.push({
        phase: 'beforeNpDamage',
        origin: 'np',
        sourceInstanceId: `np:${attacker.id}`,
        sourceId: attacker.id,
        sourceName: attacker.name,
        skillId: `np:${attacker.id}`,
        skillName: '宝具前効果',
        effect,
        rawValue: parameter(effect, input.overcharge - 1, input.npLevel - 1),
        valueExpression: modifierValueExpression(effect, input.overcharge - 1, input.npLevel - 1),
        enabledByDefault: true,
      });
  return { sources, issues };
}

function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    traits: {
      attacker: new Map(state.traits.attacker),
      attackerState: new Map(state.traits.attackerState),
      target: new Map(state.traits.target),
      targetState: new Map(state.traits.targetState),
      field: new Map(state.traits.field),
    },
    traitCounts: {
      attacker: { ...state.traitCounts.attacker },
      attackerState: { ...state.traitCounts.attackerState },
      target: { ...state.traitCounts.target },
      targetState: { ...state.traitCounts.targetState },
      field: { ...state.traitCounts.field },
    },
    quantities: { ...state.quantities },
    modifiers: [...state.modifiers],
    modifierRates: { ...state.modifierRates },
    evidence: [...state.evidence],
    unresolved: [...state.unresolved],
  };
}

function makeProjection(
  source: SourceEffect,
  key: string,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  modifier: EffectProjection['modifier'],
  rawValue: number | null,
  condition: ConditionExpression,
): EffectProjection {
  const plan = decisionPlan(source, condition);
  const userControllable = plan.activation === 'user' || plan.condition === 'userMayAssume';
  return {
    projectionKey: key,
    operationId: key,
    label: source.effect.label,
    sourceName: source.sourceName,
    skillName: source.skillName,
    valuePermille: modifier === 'flatDamage' ? null : rawValue,
    value: rawValue === null ? null : modifier === 'flatDamage' ? rawValue : rawValue / 1000,
    requiredQuantity: source.valueExpression ? 'attackerHpPermille' : null,
    requiredQuantityOwner: source.valueExpression
      ? ['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
        ? 'attacker'
        : 'source'
      : null,
    modifier,
    source: sourceIdentity(source),
    executionSupport: 'unsupported',
    outcome: userControllable ? 'notApplied' : outcome,
    visibility: 'visible',
    controllability: userControllable ? 'user' : 'automatic',
    decision: userControllable
      ? {
          state: 'disabled',
          decisionKey: key,
          kind: 'effect',
          plan,
        }
      : { state: 'none' },
    explanation: { code: userControllable ? 'disabled' : code, condition },
  };
}

function resolveModifierValue(
  operation: Extract<BattleOperation, { kind: 'addModifier' }>,
  state: BattleState,
): number | null {
  const expression = operation.valueExpression;
  if (!expression) return operation.valuePermille;
  if (expression.subjectId !== undefined) return null;
  const hp = state.quantities.attackerHpPermille;
  if (hp === null) return null;
  if (expression.kind === 'inverseHpLinear')
    return (
      expression.basePermille +
      Math.trunc((expression.bonusAtZeroHpPermille * (1_000 - hp)) / 1_000)
    );
  const clampedHp = Math.min(
    expression.maximumHpPermille,
    Math.max(expression.minimumHpPermille, hp),
  );
  return (
    expression.basePermille +
    expression.valueAtMinimumHpPermille +
    Math.trunc(
      ((expression.valueAtMaximumHpPermille - expression.valueAtMinimumHpPermille) *
        (clampedHp - expression.minimumHpPermille)) /
        (expression.maximumHpPermille - expression.minimumHpPermille),
    )
  );
}

function projectionFor(
  operation: BattleOperation,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  enabled: boolean,
  condition: boolean | null,
  choice: EffectDecision | undefined,
  resolvedModifierValue: number | null,
): EffectProjection {
  const hidden = operation.kind === 'addTrait' || operation.kind === 'removeTrait';
  const valuePermille =
    operation.kind === 'addModifier'
      ? resolvedModifierValue
      : operation.kind === 'changeModifierRate'
        ? operation.ratePermille
        : operation.kind === 'executeNpDamage' && operation.condition.kind !== 'always'
          ? (operation.damage.parametersByOvercharge[operation.overcharge - 1]?.[
              operation.selectedNpLevel - 1
            ]?.correctionPermille ?? null)
          : null;
  const modifier =
    operation.kind === 'addModifier' || operation.kind === 'changeModifierRate'
      ? operation.modifier
      : operation.kind === 'changeCardType'
        ? 'cardTypeChange'
        : operation.kind === 'executeNpDamage' && operation.condition.kind !== 'always'
          ? 'npSpecial'
          : operation.kind === 'ignoreDefense'
            ? 'ignoreDefense'
            : operation.kind === 'ignoreDamageCut'
              ? 'ignoreDamageCut'
              : null;
  const decisionSelected =
    operation.decisionPlan.activation === 'user'
      ? enabled
      : choice?.conditionSatisfaction === 'assumeSatisfied';
  const conditionSatisfiedInternally = condition === true;
  const userControllable =
    operation.decisionKey !== null &&
    (operation.decisionPlan.activation === 'user' ||
      (operation.decisionPlan.condition === 'userMayAssume' && !conditionSatisfiedInternally));
  return {
    projectionKey: operation.decisionKey ?? operation.operationId,
    operationId: operation.operationId,
    label: operation.presentation.label,
    sourceName: operation.presentation.sourceName,
    skillName: operation.presentation.skillName,
    valuePermille,
    value:
      valuePermille === null
        ? null
        : modifier === 'flatDamage'
          ? valuePermille
          : valuePermille / 1000,
    requiredQuantity:
      operation.kind === 'addModifier' && operation.valueExpression ? 'attackerHpPermille' : null,
    requiredQuantityOwner:
      operation.kind === 'addModifier' && operation.valueExpression
        ? operation.valueExpression.subjectId === undefined
          ? 'attacker'
          : 'source'
        : null,
    modifier,
    source: operation.source,
    executionSupport: 'supported',
    outcome,
    visibility:
      hidden ||
      code === 'cardMismatch' ||
      (operation.kind === 'executeNpDamage' && operation.condition.kind === 'always')
        ? 'hidden'
        : 'visible',
    controllability: userControllable ? 'user' : 'automatic',
    decision:
      userControllable && operation.decisionKey
        ? {
            state: decisionSelected ? ('enabled' as const) : ('disabled' as const),
            decisionKey: operation.decisionKey,
            kind: 'effect' as const,
            plan: operation.decisionPlan,
          }
        : { state: 'none' },
    explanation: {
      code,
      condition: operation.condition.kind === 'always' ? null : operation.condition,
    },
  };
}

function projectionAtDamageEvaluation(
  result: OperationResult,
  finalState: BattleState,
): EffectProjection {
  if (
    result.operation.kind !== 'addModifier' ||
    result.operation.card === null ||
    result.operation.card === finalState.card
  )
    return result.projection;
  return {
    ...result.projection,
    outcome: 'impossible',
    visibility: 'hidden',
    explanation: { ...result.projection.explanation, code: 'cardMismatch' },
  };
}

function initialState(
  input: DamageResolutionInput,
  attackerTraits: readonly string[],
): BattleState {
  const attacker = [...attackerTraits, 'cardNP'];
  return {
    card: input.cardType,
    traits: {
      attacker: traitFacts(attacker),
      attackerState: traitFacts(input.attackerStateTraits),
      target: traitFacts(input.target.traits),
      targetState: traitFacts(input.targetStateTraits),
      field: traitFacts(input.fieldTraits),
    },
    traitCounts: {
      attacker: traitCounts(attacker),
      attackerState: traitCounts(input.attackerStateTraits),
      target: traitCounts(input.target.traits),
      targetState: traitCounts(input.targetStateTraits),
      field: traitCounts(input.fieldTraits),
    },
    quantities: {
      attackerHpPermille: input.attackerHpPermille,
      targetRarity: input.targetRarity,
      battlePointPhase: input.battlePointPhase,
    },
    modifiers: [],
    modifierRates: {},
    ignoreDefense: input.damageFunction.status === 'resolved' && input.damageFunction.ignoreDefense,
    ignoreDamageCut: input.ignoreDamageCut,
    evidence: [],
    unresolved: [],
  };
}

function traitFacts(traits: Iterable<string>): ReadonlyMap<string, boolean> {
  return new Map([...traits].map((trait) => [trait, true] as const));
}

function applyWorldFacts(
  state: BattleState,
  assertions: ResolvedScenario['worldFactAssertions'],
): BattleState {
  const candidate = cloneState(state);
  for (const assertion of assertions) {
    const fact = assertion.fact;
    if (fact.kind === 'quantity') candidate.quantities[fact.quantity] = fact.value;
    else {
      (candidate.traits[fact.scope] as Map<string, boolean>).set(fact.trait, fact.present);
      candidate.traitCounts[fact.scope] = fact.present
        ? {
            ...candidate.traitCounts[fact.scope],
            [fact.trait]: Math.max(1, candidate.traitCounts[fact.scope][fact.trait] ?? 0),
          }
        : withoutTraitCount(candidate.traitCounts[fact.scope], fact.trait);
    }
  }
  return candidate;
}

function traitCounts(traits: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const trait of traits) result[trait] = (result[trait] ?? 0) + 1;
  return result;
}

function combinedTraitCounts(
  ...groups: readonly Readonly<Record<string, number>>[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const group of groups)
    for (const [trait, count] of Object.entries(group))
      result[trait] = (result[trait] ?? 0) + count;
  return result;
}

function withoutTraitCount(
  counts: Readonly<Record<string, number>>,
  removedTrait: string,
): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([trait]) => trait !== removedTrait));
}

function expandedTraits(counts: Readonly<Record<string, number>>): string[] {
  return Object.entries(counts).flatMap(([trait, count]) =>
    Array.from({ length: Math.max(0, count) }, () => trait),
  );
}

function applyNp(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: BattleState,
  effectLocalConditionSatisfied: boolean,
): DamageResolutionInput {
  const attackerTraits = combinedTraitCounts(
    state.traitCounts.attacker,
    state.traitCounts.attackerState,
  );
  const targetTraits = state.traitCounts.target;
  const targetStateTraits = state.traitCounts.targetState;
  return applyNpDamageOperation(input, operation.damage, {
    overcharge: operation.overcharge,
    attackerTraitCounts: attackerTraits,
    targetTraitCounts: targetTraits,
    targetCombinedTraitCounts: combinedTraitCounts(
      state.traitCounts.target,
      state.traitCounts.targetState,
    ),
    targetStateTraitCounts: targetStateTraits,
    attackerHpPermille: state.quantities.attackerHpPermille,
    targetRarity: state.quantities.targetRarity,
    battlePointPhase: state.quantities.battlePointPhase,
    effectLocalConditionSatisfied,
  });
}

function npCondition(damage: NpDamageSpec, overcharge: number): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[0];
  if (!item) return { kind: 'always' };
  if ((damage.kind === 'trait' || damage.kind === 'stateTrait') && item.targetTrait)
    return {
      kind: 'trait',
      scope: damage.kind === 'stateTrait' ? 'targetState' : 'target',
      trait: item.targetTrait.name,
      present: true,
    };
  if (damage.kind === 'traitExpression' && item.andCheckTraits)
    return {
      kind: 'all',
      expressions: item.andCheckTraits.map((trait) => ({
        kind: 'trait',
        scope: 'target',
        trait: trait.name,
        present: true,
      })),
    };
  if (damage.kind === 'targetRarity' && item.targetRarities)
    return {
      kind: 'any',
      expressions: item.targetRarities.map((rarity) => ({
        kind: 'quantity',
        quantity: 'targetRarity',
        comparison: 'equal',
        value: rarity,
      })),
    };
  return { kind: 'always' };
}

function traitCountProjections(
  attackerId: string,
  damage: NpDamageSpec,
  overcharge: number,
  selectedNpLevel: number,
  source: OperationSource,
  sourceName: string,
  skillName: string,
): EffectProjection[] {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[selectedNpLevel - 1];
  if (damage.kind !== 'traitCount' || item?.targetId !== 1) return [];
  const valuePermille = (item.secondaryValuePermille ?? 1_000) + (item.correctionPermille ?? 0);
  return (item.targetTraits ?? []).map((trait) => {
    const projectionKey = `np:${attackerId}:${damage.functionId}:trait:${trait.id}`;
    return {
      projectionKey,
      operationId: `np:${attackerId}:${damage.functionId}:damage`,
      label: '特攻宝具',
      sourceName,
      skillName,
      valuePermille,
      value: valuePermille / 1_000,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      modifier: 'npSpecial',
      source,
      executionSupport: 'supported',
      outcome: 'applied',
      visibility: 'visible',
      controllability: 'user',
      decision: {
        state: 'disabled',
        decisionKey: projectionKey,
        kind: 'worldFact',
        fact: { kind: 'trait', scope: 'target', trait: trait.name, present: true },
      },
      explanation: {
        code: 'applied',
        condition: { kind: 'trait', scope: 'target', trait: trait.name, present: true },
      },
    };
  });
}

function foldInput(input: DamageResolutionInput, state: BattleState): DamageResolutionInput {
  const sums: Partial<Record<ModifierKind, number>> = {};
  for (const modifier of state.modifiers) {
    if (modifier.card !== null && modifier.card !== state.card) continue;
    sums[modifier.modifier] = (sums[modifier.modifier] ?? 0) + modifier.valuePermille;
  }
  const value = (kind: ModifierKind) => (sums[kind] ?? 0) / 1000;
  const npBase = input.npDamageBuff + value('npDamageBuff');
  const npRate = (state.modifierRates.npDamageBuff ?? 0) / 1000;
  return {
    ...input,
    cardType: state.card,
    fieldTraits: [...state.traits.field].flatMap(([trait, present]) => (present ? [trait] : [])),
    attackerStateTraits: expandedTraits(state.traitCounts.attackerState),
    targetStateTraits: expandedTraits(state.traitCounts.targetState),
    target: {
      ...input.target,
      traits: expandedTraits(state.traitCounts.target),
    },
    attackBuff: input.attackBuff + value('attackBuff'),
    defenseBuff: input.defenseBuff + value('defenseBuff'),
    cardBuff: input.cardBuff + value('cardBuff'),
    cardResistance: input.cardResistance + value('cardResistance'),
    npDamageBuff: npRate ? npBase * (1 + npRate) : npBase,
    npResistance: input.npResistance + value('npResistance'),
    eventDamageBuff: input.eventDamageBuff + value('eventDamageBuff'),
    specialDamageBuff: input.specialDamageBuff + value('specialDamageBuff'),
    powerMod: input.powerMod + value('powerMod'),
    flatDamage: input.flatDamage + (sums.flatDamage ?? 0),
    ignoreDamageCut: state.ignoreDamageCut,
    damageFunction:
      input.damageFunction.status === 'resolved'
        ? {
            ...input.damageFunction,
            ignoreDefense: input.damageFunction.ignoreDefense || state.ignoreDefense,
          }
        : input.damageFunction,
  };
}

export function executeOrderedScenario(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
): OrderedScenarioExecution {
  const attacker = master.servants.find((servant) => servant.id === baseInput.attackerId);
  let state = initialState(baseInput, attacker?.traits ?? []);
  const collected = collectSources(baseInput, scenario, master);
  const operations: BattleOperation[] = [];
  const compileProjections: EffectProjection[] = [];
  for (const source of collected.sources) {
    const compiled = compileEffect(source, operations.length);
    operations.push(...compiled.operations);
    compileProjections.push(...compiled.unsupported);
  }
  const damage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  if (attacker && damage) {
    const np = getPrimaryNoblePhantasm(attacker)!;
    const condition = npCondition(damage, baseInput.overcharge);
    const npDecisionPlan = {
      activation: 'automatic' as const,
      condition: containsUnsupportedCondition(condition)
        ? ('unsupported' as const)
        : isConditional(condition)
          ? ('userMayAssume' as const)
          : ('evaluate' as const),
    };
    const source: OperationSource = {
      origin: 'np',
      sourceInstanceId: `np:${attacker.id}`,
      sourceId: attacker.id,
      skillId: `np:${attacker.id}`,
      effectId: damage.functionId,
      effectOccurrenceId: `damage:${damage.functionId}`,
    };
    compileProjections.push(
      ...traitCountProjections(
        attacker.id,
        damage,
        baseInput.overcharge,
        baseInput.npLevel,
        source,
        attacker.name,
        np.name,
      ),
    );
    operations.push({
      operationId: `np:${attacker.id}:${damage.functionId}:damage`,
      order: operations.length,
      phase: 'npDamage',
      source,
      condition,
      decisionKey:
        npDecisionPlan.condition === 'userMayAssume'
          ? `np:${attacker.id}:${damage.functionId}:condition`
          : null,
      decisionPlan: npDecisionPlan,
      enabledByDefault: true,
      evidence: { rawPath: damage.rawPath, functionId: damage.functionId, parameterKeys: [] },
      presentation: {
        label: damage.kind === 'targetRarity' ? 'レアリティ特攻宝具' : '特攻宝具',
        sourceName: attacker.name,
        skillName: np.name,
      },
      kind: 'executeNpDamage',
      damage,
      overcharge: baseInput.overcharge,
      selectedNpLevel: baseInput.npLevel,
      npMultipliers: damage.parametersByOvercharge[baseInput.overcharge - 1]!.map(
        (item) => item.valuePermille / 10,
      ) as [number, number, number, number, number],
    });
  }
  const phaseOrder: Record<ExecutionPhase, number> = {
    passive: 0,
    attackerSkill: 1,
    craftEssence: 2,
    support: 3,
    mysticCode: 4,
    beforeNpDamage: 5,
    damageEvaluation: 6,
    npDamage: 7,
  };
  operations.sort(
    (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.order - right.order,
  );
  operations.forEach((operation, order) => {
    operation.order = order;
  });
  const decisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const conditionByDecisionKey = new Map(
    operations.flatMap((operation) =>
      operation.decisionKey ? [[operation.decisionKey, operation.condition] as const] : [],
    ),
  );
  const activeConditionConstraints: SatisfiableConditionConstraint[] =
    scenario.effectDecisions.flatMap((decision) => {
      const expression = conditionByDecisionKey.get(decision.decisionKey);
      return decision.operationEnabled &&
        decision.conditionSatisfaction === 'assumeSatisfied' &&
        expression
        ? [{ sourceKey: decision.decisionKey, expression }]
        : [];
    });
  const selectedCardMutations = operations.filter((operation) => {
    if (operation.kind !== 'changeCardType') return false;
    if (operation.decisionPlan.activation === 'automatic') return operation.enabledByDefault;
    return operation.decisionKey
      ? (decisions.get(operation.decisionKey)?.operationEnabled ?? operation.enabledByDefault)
      : operation.enabledByDefault;
  }) as Extract<BattleOperation, { kind: 'changeCardType' }>[];
  const finalSelectedCardMutation = selectedCardMutations.at(-1);
  const initialConstraintValidation = validateConstraintSet({
    fixedFacts: [
      ...fixedConstraintFactsFromState(state, 'initial').filter(
        ({ fact }) => !finalSelectedCardMutation || fact.kind !== 'card',
      ),
      ...(finalSelectedCardMutation
        ? [
            {
              sourceKey:
                finalSelectedCardMutation.decisionKey ?? finalSelectedCardMutation.operationId,
              fact: { kind: 'card' as const, card: finalSelectedCardMutation.card },
            },
          ]
        : []),
      ...scenario.worldFactAssertions.map((assertion) => ({
        sourceKey: assertion.decisionKey,
        fact: assertion.fact,
      })),
    ],
    expressions: activeConditionConstraints,
  });
  const constraintIssues =
    initialConstraintValidation.status === 'satisfied' ? [] : [initialConstraintValidation.issue];
  if (initialConstraintValidation.status === 'satisfied')
    state = applyWorldFacts(state, scenario.worldFactAssertions);
  const invalidDecisionKeys = new Set(
    initialConstraintValidation.status === 'satisfied'
      ? []
      : activeConditionConstraints.map((constraint) => constraint.sourceKey),
  );
  const resolvedCompileProjections = compileProjections.map((projection) => {
    const choice = decisions.get(projection.projectionKey);
    const enabled =
      choice?.operationEnabled ??
      (projection.decision.state === 'none' || projection.decision.state === 'enabled');
    if (invalidDecisionKeys.has(projection.projectionKey))
      return {
        ...projection,
        outcome: 'notApplied' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : {
                ...projection.decision,
                state: enabled ? ('enabled' as const) : ('disabled' as const),
              },
        explanation: { ...projection.explanation, code: 'conditionNotMet' as const },
      };
    if (projection.executionSupport === 'unsupported' && enabled)
      return {
        ...projection,
        outcome: 'unsupported' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : { ...projection.decision, state: 'enabled' as const },
        explanation: { ...projection.explanation, code: 'unresolved' as const },
      };
    return enabled
      ? projection
      : {
          ...projection,
          outcome: 'notApplied' as const,
          decision:
            projection.decision.state === 'none'
              ? projection.decision
              : { ...projection.decision, state: 'disabled' as const },
          explanation: { ...projection.explanation, code: 'disabled' as const },
        };
  });
  const results: OperationResult[] = [];
  let input = baseInput;
  for (const operation of operations) {
    const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
    const enabled =
      operation.decisionPlan.activation === 'automatic'
        ? operation.enabledByDefault
        : (choice?.operationEnabled ?? operation.enabledByDefault);
    const condition = evaluateConditionExpression(operation.condition, state);
    const resolvedModifierValue =
      operation.kind === 'addModifier' ? resolveModifierValue(operation, state) : null;
    const localConditionSatisfied =
      choice?.conditionSatisfaction === 'assumeSatisfied' &&
      operation.decisionPlan.condition === 'userMayAssume';
    let outcome: OperationResult['outcome'] = 'applied';
    let code: EffectProjection['explanation']['code'] = 'applied';
    let issue: ExecutionIssue | null = null;
    if (operation.decisionKey && invalidDecisionKeys.has(operation.decisionKey)) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    } else if (!enabled) {
      outcome = 'notApplied';
      code = 'disabled';
    } else if (
      operation.kind === 'changeCardType' &&
      finalSelectedCardMutation !== undefined &&
      operation.operationId !== finalSelectedCardMutation.operationId &&
      operation.order < finalSelectedCardMutation.order
    ) {
      outcome = 'notRelevant';
      code = 'disabled';
    } else if (operation.kind === 'addModifier' && resolvedModifierValue === null) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsupportedOperation',
        operationId: operation.operationId,
        detail: 'modifier_value_quantity_missing',
      };
    } else if (
      localConditionSatisfied &&
      (operation.kind === 'addTrait' || operation.kind === 'removeTrait')
    ) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsafeLocalConditionDecision',
        operationId: operation.operationId,
        detail: 'condition_satisfaction_would_create_world_fact',
      };
    } else if (condition === null && localConditionSatisfied) {
      outcome = 'applied';
    } else if (
      condition === null &&
      operation.decisionKey &&
      choice?.conditionSatisfaction !== 'assumeSatisfied'
    ) {
      outcome = 'notApplied';
      code = 'unresolved';
    } else if (
      condition === null &&
      (operation.kind === 'addTrait' || operation.kind === 'removeTrait')
    ) {
      outcome = 'notApplied';
      code = 'unresolved';
    } else if (condition === null) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsupportedCondition',
        operationId: operation.operationId,
        detail: 'quantity_missing',
      };
    } else if (!condition && !localConditionSatisfied) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    }
    if (outcome === 'applied') {
      const candidateState = cloneState(state);
      if (operation.kind === 'addTrait') {
        (candidateState.traits[operation.scope] as Map<string, boolean>).set(operation.trait, true);
        candidateState.traitCounts[operation.scope] = {
          ...candidateState.traitCounts[operation.scope],
          [operation.trait]:
            (candidateState.traitCounts[operation.scope][operation.trait] ?? 0) + 1,
        };
      } else if (operation.kind === 'removeTrait') {
        (candidateState.traits[operation.scope] as Map<string, boolean>).set(
          operation.trait,
          false,
        );
        candidateState.traitCounts[operation.scope] = withoutTraitCount(
          candidateState.traitCounts[operation.scope],
          operation.trait,
        );
      } else if (operation.kind === 'addModifier')
        candidateState.modifiers = [
          ...candidateState.modifiers,
          {
            operationId: operation.operationId,
            source: operation.source,
            modifier: operation.modifier,
            valuePermille: resolvedModifierValue!,
            card: operation.card,
            order: operation.order,
          },
        ];
      else if (operation.kind === 'changeModifierRate')
        candidateState.modifierRates = {
          ...candidateState.modifierRates,
          [operation.modifier]: Math.max(
            candidateState.modifierRates[operation.modifier] ?? 0,
            operation.ratePermille,
          ),
        };
      else if (operation.kind === 'changeCardType') {
        candidateState.card = operation.card;
        for (const trait of operation.stateTraits) {
          const group = canonicalExclusiveGroup('attackerState', trait);
          if (group)
            for (const conflictingTrait of canonicalExclusiveTraits('attackerState', group)) {
              if (conflictingTrait === trait) continue;
              (candidateState.traits.attackerState as Map<string, boolean>).set(
                conflictingTrait,
                false,
              );
              candidateState.traitCounts.attackerState = withoutTraitCount(
                candidateState.traitCounts.attackerState,
                conflictingTrait,
              );
            }
          (candidateState.traits.attackerState as Map<string, boolean>).set(trait, true);
          candidateState.traitCounts.attackerState = {
            ...candidateState.traitCounts.attackerState,
            [trait]: 1,
          };
        }
      } else if (operation.kind === 'ignoreDefense') candidateState.ignoreDefense = true;
      else if (operation.kind === 'ignoreDamageCut') candidateState.ignoreDamageCut = true;
      else input = applyNp(input, operation, state, localConditionSatisfied);
      const mutationValidation =
        operation.kind === 'addTrait' ||
        operation.kind === 'removeTrait' ||
        operation.kind === 'changeCardType'
          ? validateConstraintSet({
              fixedFacts: fixedConstraintFactsFromState(candidateState, operation.operationId),
              expressions: activeConditionConstraints.filter(
                (constraint) => !invalidDecisionKeys.has(constraint.sourceKey),
              ),
            })
          : { status: 'satisfied' as const, alternativeCount: 1 };
      if (mutationValidation.status !== 'satisfied') {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = mutationValidation.issue;
        mutationValidation.issue.sourceKeys.forEach((key) => invalidDecisionKeys.add(key));
      } else {
        state = candidateState;
        state.evidence = [...state.evidence, operation.evidence];
      }
    }
    if (issue) state.unresolved = [...state.unresolved, issue];
    results.push({
      operation,
      outcome,
      condition: condition === null ? 'unresolved' : condition ? 'satisfied' : 'unsatisfied',
      state: cloneState(state),
      projection: projectionFor(
        operation,
        outcome,
        code,
        enabled,
        condition,
        choice,
        resolvedModifierValue,
      ),
      issue,
    });
  }
  const issues = [
    ...constraintIssues,
    ...collected.issues,
    ...resolvedCompileProjections
      .filter((projection) => projection.outcome === 'unsupported')
      .map<ExecutionIssue>((projection) => ({
        kind: 'unsupportedOperation',
        operationId: projection.operationId,
        detail: 'effect_semantics_unresolved',
      })),
    ...state.unresolved,
  ];
  const projectionByKey = new Map<string, EffectProjection>();
  for (const projection of [
    ...resolvedCompileProjections,
    ...results.map((result) => projectionAtDamageEvaluation(result, state)),
  ]) {
    const prior = projectionByKey.get(projection.projectionKey);
    if (!prior || (prior.visibility === 'hidden' && projection.visibility === 'visible'))
      projectionByKey.set(projection.projectionKey, projection);
  }
  const projections = [...projectionByKey.values()];
  return {
    input: foldInput(input, state),
    state,
    operations: results,
    projections,
    precision: issues.length ? 'unsupported' : 'exact',
    issues,
  };
}
