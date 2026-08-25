import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type MasterEffect,
  type NpDamageSpec,
  type TraitCondition,
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
  validateConditionDecisions,
} from './condition';
import { validateAndApplyWorldFacts, validateCanonicalWorldState } from './facts';
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
  'overwriteClassRelation',
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
const SUPPORTED_PARAMETER_KEYS = new Set([
  'AuraEffectId',
  'Count',
  'HideMiss',
  'HideNoEffect',
  'OnField',
  'Rate',
  'ShowQuestNoEffect',
  'ShowState',
  'Turn',
  'Value',
  'Value2',
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
  const recipient = targetRecipient(origin, effect.target);
  const types = effect.buffTypes ?? [];
  const potentiallyRelevant =
    !(effect.target.startsWith('enemy') && types.some((type) => ATTACK_REDUCTION.has(type))) &&
    !(!effect.target.startsWith('enemy') && types.some((type) => DEFENSIVE.has(type))) &&
    types.some((type) => POSSIBLY_DAMAGE.has(type));
  return Boolean(
    route(effect, origin) ||
    (recipient === 'attacker' &&
      effect.buffTypes?.includes('buffRate') &&
      effect.buffRateTargets?.includes('buffNpDamageUp')) ||
    (recipient && potentiallyRelevant),
  );
}

function effectCondition(effect: MasterEffect, origin: Origin): ConditionExpression {
  const recipient = targetRecipient(origin, effect.target) ?? 'attacker';
  const holder: TraitScope = recipient;
  const opponent: TraitScope = recipient === 'target' ? 'attacker' : 'target';
  return combineConditions([
    ...effect.conditions.recipient.map((condition) => normalizeTraitCondition(condition, holder)),
    normalizeTraitCondition(effect.conditions.holder, holder),
    normalizeTraitCondition(effect.conditions.opponent, opponent),
    normalizeTraitCondition(effect.conditions.field, 'field'),
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

function decisionKey(source: SourceEffect): string {
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.id}`;
}

function sourceIdentity(source: SourceEffect): OperationSource {
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    skillId: source.skillId,
    effectId: source.effect.id,
  };
}

function baseOperation(source: SourceEffect, order: number, suffix: string) {
  const key = decisionKey(source);
  const condition = effectCondition(source.effect, source.origin);
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
  const condition = effectCondition(source.effect, source.origin);
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
  const rateChange =
    source.effect.buffTypes?.includes('buffRate') &&
    source.effect.buffRateTargets?.includes('buffNpDamageUp');
  if (containsUnsupportedCondition(condition) && (routed || rateChange)) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ?? (rateChange ? 'npDamageBuff' : null),
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (!routed && !rateChange) {
    if (canNormalizeDamageEffect(source.effect, source.origin))
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, condition),
      );
    return { operations, unsupported };
  }
  const unknownParameters = [
    ...new Set(
      source.effect.parameterSets.flatMap((set) =>
        set.flatMap((item) =>
          Object.keys(item).filter((name) => !SUPPORTED_PARAMETER_KEYS.has(name)),
        ),
      ),
    ),
  ].sort();
  if (
    unknownParameters.length ||
    (source.effect.functionScript && Object.keys(source.effect.functionScript).length) ||
    source.effect.overwriteTargetValues?.length
  ) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ?? null,
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (rateChange) {
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
        enabledByDefault: true,
      });
  return { sources, issues };
}

function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    traits: {
      attacker: new Set(state.traits.attacker),
      attackerState: new Set(state.traits.attackerState),
      target: new Set(state.traits.target),
      targetState: new Set(state.traits.targetState),
      field: new Set(state.traits.field),
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

function projectionFor(
  operation: BattleOperation,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  enabled: boolean,
  condition: boolean | null,
  choice: EffectDecision | undefined,
): EffectProjection {
  const hidden = operation.kind === 'addTrait' || operation.kind === 'removeTrait';
  const valuePermille =
    operation.kind === 'addModifier'
      ? operation.valuePermille
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

function initialState(
  input: DamageResolutionInput,
  attackerTraits: readonly string[],
): BattleState {
  const attacker = [
    ...attackerTraits,
    'cardNP',
    `card${input.cardType[0]!.toUpperCase()}${input.cardType.slice(1)}`,
  ];
  return {
    card: input.cardType,
    traits: {
      attacker: new Set(attacker),
      attackerState: new Set(input.attackerStateTraits),
      target: new Set(input.target.traits),
      targetState: new Set(input.targetStateTraits),
      field: new Set(input.fieldTraits),
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
  for (const modifier of state.modifiers)
    sums[modifier.modifier] = (sums[modifier.modifier] ?? 0) + modifier.valuePermille;
  const value = (kind: ModifierKind) => (sums[kind] ?? 0) / 1000;
  const npBase = input.npDamageBuff + value('npDamageBuff');
  const npRate = (state.modifierRates.npDamageBuff ?? 0) / 1000;
  return {
    ...input,
    fieldTraits: [...state.traits.field],
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
  const worldFactIssues = validateAndApplyWorldFacts(state, scenario.worldFactAssertions);
  const initialWorldStateIssues = validateCanonicalWorldState(state);
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
  const conditionIssues = validateConditionDecisions(
    scenario.effectDecisions,
    conditionByDecisionKey,
  );
  const invalidDecisionKeys = new Set(
    [...worldFactIssues, ...conditionIssues].flatMap((issue) =>
      issue.kind === 'contradictoryWorldFacts' ||
      issue.kind === 'exclusiveWorldFactConflict' ||
      issue.kind === 'conditionDecisionConflict'
        ? [...issue.decisionKeys]
        : [],
    ),
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
    const localConditionSatisfied =
      choice?.conditionSatisfaction === 'assumeSatisfied' &&
      operation.decisionPlan.condition === 'userMayAssume';
    let outcome: OperationResult['outcome'] = 'applied';
    let code: EffectProjection['explanation']['code'] = 'applied';
    let issue: ExecutionIssue | null = null;
    if (operation.decisionKey && invalidDecisionKeys.has(operation.decisionKey)) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    } else if (
      operation.kind === 'addModifier' &&
      operation.card &&
      operation.card !== state.card
    ) {
      outcome = 'impossible';
      code = 'cardMismatch';
    } else if (!enabled) {
      outcome = 'notApplied';
      code = 'disabled';
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
    } else if (condition === null && operation.decisionKey && !choice) {
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
      state = cloneState(state);
      if (operation.kind === 'addTrait') {
        (state.traits[operation.scope] as Set<string>).add(operation.trait);
        state.traitCounts[operation.scope] = {
          ...state.traitCounts[operation.scope],
          [operation.trait]: (state.traitCounts[operation.scope][operation.trait] ?? 0) + 1,
        };
      } else if (operation.kind === 'removeTrait') {
        (state.traits[operation.scope] as Set<string>).delete(operation.trait);
        state.traitCounts[operation.scope] = withoutTraitCount(
          state.traitCounts[operation.scope],
          operation.trait,
        );
      } else if (operation.kind === 'addModifier')
        state.modifiers = [
          ...state.modifiers,
          {
            operationId: operation.operationId,
            source: operation.source,
            modifier: operation.modifier,
            valuePermille: operation.valuePermille,
            order: operation.order,
          },
        ];
      else if (operation.kind === 'changeModifierRate')
        state.modifierRates = {
          ...state.modifierRates,
          [operation.modifier]: Math.max(
            state.modifierRates[operation.modifier] ?? 0,
            operation.ratePermille,
          ),
        };
      else if (operation.kind === 'ignoreDefense') state.ignoreDefense = true;
      else if (operation.kind === 'ignoreDamageCut') state.ignoreDamageCut = true;
      else input = applyNp(input, operation, state, localConditionSatisfied);
      const mutationIssues =
        operation.kind === 'addTrait' || operation.kind === 'removeTrait'
          ? validateCanonicalWorldState(state, [operation.operationId])
          : [];
      if (mutationIssues.length) {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = mutationIssues[0]!;
      }
      state.evidence = [...state.evidence, operation.evidence];
    }
    if (issue) state.unresolved = [...state.unresolved, issue];
    results.push({
      operation,
      outcome,
      condition: condition === null ? 'unresolved' : condition ? 'satisfied' : 'unsatisfied',
      state: cloneState(state),
      projection: projectionFor(operation, outcome, code, enabled, condition, choice),
      issue,
    });
  }
  const issues = [
    ...worldFactIssues,
    ...initialWorldStateIssues,
    ...conditionIssues,
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
    ...results.map((result) => result.projection),
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
