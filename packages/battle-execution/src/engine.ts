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
  ExecutionIssue,
  ExecutionPhase,
  ModifierKind,
  OperationResult,
  OperationSource,
  ScenarioAssumption,
  TraitScope,
} from './index';

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

function traitExpression(condition: TraitCondition, scope: TraitScope): ConditionExpression {
  if (condition.traits.length === 0) return { kind: 'always' };
  const expressions = condition.traits.map<ConditionExpression>((trait) => ({
    kind: 'trait',
    scope,
    trait: trait.name,
    present: !trait.negative,
  }));
  if (condition.operator === 'partial')
    return {
      kind: 'traitCount',
      scope,
      traits: condition.traits.map((trait) => trait.name),
      comparison: 'atLeast',
      count: 1,
    };
  return condition.operator === 'all' ? { kind: 'all', expressions } : { kind: 'any', expressions };
}

function combine(expressions: ConditionExpression[]): ConditionExpression {
  const useful = expressions.filter((expression) => expression.kind !== 'always');
  return useful.length === 0
    ? { kind: 'always' }
    : useful.length === 1
      ? useful[0]!
      : { kind: 'all', expressions: useful };
}

function effectCondition(effect: MasterEffect, origin: Origin): ConditionExpression {
  const recipient = targetRecipient(origin, effect.target) ?? 'attacker';
  const holder: TraitScope = recipient;
  const opponent: TraitScope = recipient === 'target' ? 'attacker' : 'target';
  return combine([
    ...effect.conditions.recipient.map((condition) => traitExpression(condition, holder)),
    traitExpression(effect.conditions.holder, holder),
    traitExpression(effect.conditions.opponent, opponent),
    traitExpression(effect.conditions.field, 'field'),
  ]);
}

function evaluateCondition(condition: ConditionExpression, state: BattleState): boolean | null {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'trait':
      return state.traits[condition.scope].has(condition.trait) === condition.present;
    case 'traitCount': {
      const count = condition.traits.filter((trait) =>
        state.traits[condition.scope].has(trait),
      ).length;
      return condition.comparison === 'atLeast'
        ? count >= condition.count
        : condition.comparison === 'atMost'
          ? count <= condition.count
          : count === condition.count;
    }
    case 'card':
      return state.card === condition.card;
    case 'quantity': {
      const actual = state.quantities[condition.quantity];
      if (actual === null) return null;
      if (condition.comparison === 'lessThan') return actual < condition.value;
      if (condition.comparison === 'atMost') return actual <= condition.value;
      if (condition.comparison === 'equal') return actual === condition.value;
      if (condition.comparison === 'atLeast') return actual >= condition.value;
      return actual > condition.value;
    }
    case 'all': {
      const values = condition.expressions.map((value) => evaluateCondition(value, state));
      return values.includes(false) ? false : values.includes(null) ? null : true;
    }
    case 'any': {
      const values = condition.expressions.map((value) => evaluateCondition(value, state));
      return values.includes(true) ? true : values.includes(null) ? null : false;
    }
    case 'not': {
      const value = evaluateCondition(condition.expression, state);
      return value === null ? null : !value;
    }
  }
}

function firstAssertion(condition: ConditionExpression): ScenarioAssumption['assertion'] {
  if (condition.kind === 'trait') return condition;
  if (condition.kind === 'quantity')
    return { kind: 'quantity', quantity: condition.quantity, value: condition.value };
  if (condition.kind === 'all' || condition.kind === 'any')
    for (const child of condition.expressions) {
      const assertion = firstAssertion(child);
      if (assertion) return assertion;
    }
  return null;
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
  return {
    operationId: `${key}:${suffix}`,
    order,
    phase:
      source.origin === 'passive' && condition.kind !== 'always'
        ? ('damageEvaluation' as const)
        : source.phase,
    source: sourceIdentity(source),
    condition,
    decisionKey: key,
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
      kind: 'addTrait',
      scope: 'field',
      trait,
    });
  const recipient = targetRecipient(source.origin, source.effect.target);
  if (recipient)
    for (const trait of source.effect.contextChanges.addedRecipientTraits)
      operations.push({
        ...baseOperation(source, order++, `add-${recipient}:${trait}`),
        kind: 'addTrait',
        scope: recipient,
        trait,
      });
  const routed = route(source.effect, source.origin);
  const rateChange =
    source.effect.buffTypes?.includes('buffRate') &&
    source.effect.buffRateTargets?.includes('buffNpDamageUp');
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
    selectedEffectIds?: readonly string[],
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
        enabledByDefault: selectedEffectIds?.includes(effect.id) ?? enabledByDefault,
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
          scenario.support.composition.selectedEffects
            .filter(
              (selected) =>
                selected.sourceInstanceId === source.sourceInstanceId &&
                selected.skillId === skill.skillId,
            )
            .map((selected) => selected.effectId),
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
      target: new Set(state.traits.target),
      field: new Set(state.traits.field),
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
  const state = source.enabledByDefault ? 'enabled' : 'disabled';
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
    outcome,
    visibility: 'visible',
    controllability: 'user',
    decision: { state, decisionKey: key },
    explanation: { code, condition },
  };
}

function projectionFor(
  operation: BattleOperation,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  enabled: boolean,
): EffectProjection {
  const hidden = operation.kind === 'addTrait' || operation.kind === 'removeTrait';
  const valuePermille =
    operation.kind === 'addModifier'
      ? operation.valuePermille
      : operation.kind === 'changeModifierRate'
        ? operation.ratePermille
        : operation.kind === 'executeNpDamage' && operation.condition.kind !== 'always'
          ? (operation.damage.parametersByOvercharge[operation.overcharge - 1]?.[0]
              ?.correctionPermille ?? null)
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
    outcome,
    visibility:
      hidden ||
      code === 'cardMismatch' ||
      (operation.kind === 'executeNpDamage' && operation.condition.kind === 'always')
        ? 'hidden'
        : 'visible',
    controllability: operation.decisionKey ? 'user' : 'automatic',
    decision: operation.decisionKey
      ? { state: enabled ? 'enabled' : 'disabled', decisionKey: operation.decisionKey }
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
  return {
    card: input.cardType,
    traits: {
      attacker: new Set([
        ...attackerTraits,
        ...input.attackerStateTraits,
        'cardNP',
        `card${input.cardType[0]!.toUpperCase()}${input.cardType.slice(1)}`,
      ]),
      target: new Set([...input.target.traits, ...input.targetStateTraits]),
      field: new Set(input.fieldTraits),
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

function applyAssumptions(
  state: BattleState,
  assumptions: readonly ScenarioAssumption[],
): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  const facts = new Map<string, { value: string; keys: string[] }>();
  for (const assumption of assumptions.filter((item) => item.enabled && item.assertion)) {
    const assertion = assumption.assertion!;
    const factKey =
      assertion.kind === 'trait'
        ? `trait:${assertion.scope}:${assertion.trait}`
        : `quantity:${assertion.quantity}`;
    const value = assertion.kind === 'trait' ? String(assertion.present) : String(assertion.value);
    const prior = facts.get(factKey);
    if (prior && prior.value !== value) {
      issues.push({
        kind: 'contradictoryAssumptions',
        decisionKeys: [...prior.keys, assumption.decisionKey],
      });
      continue;
    }
    facts.set(factKey, { value, keys: [...(prior?.keys ?? []), assumption.decisionKey] });
    if (assertion.kind === 'trait') {
      if (assertion.present) (state.traits[assertion.scope] as Set<string>).add(assertion.trait);
      else (state.traits[assertion.scope] as Set<string>).delete(assertion.trait);
    } else state.quantities[assertion.quantity] = assertion.value;
  }
  return issues;
}

function traitCounts(traits: ReadonlySet<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const trait of traits) result[trait] = (result[trait] ?? 0) + 1;
  return result;
}

function applyNp(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: BattleState,
): DamageResolutionInput {
  const damage = operation.damage;
  const parameters = damage.parametersByOvercharge[operation.overcharge - 1];
  if (!parameters)
    return {
      ...input,
      damageFunction: {
        status: 'unsupported',
        kind: damage.kind,
        missingEvidence: 'invalid_overcharge',
      },
    };
  const base = parameters.map((item) => item.valuePermille / 10) as [
    number,
    number,
    number,
    number,
    number,
  ];
  let special: [number, number, number, number, number] = [1, 1, 1, 1, 1];
  let multipliers = base;
  const target = traitCounts(state.traits.target);
  const attacker = traitCounts(state.traits.attacker);
  if (damage.kind === 'hpRatioLow') {
    const hp = state.quantities.attackerHpPermille;
    if (hp === null)
      return {
        ...input,
        damageFunction: {
          status: 'unsupported',
          kind: damage.kind,
          missingEvidence: 'missing_attacker_hp_ratio',
        },
      };
    multipliers = parameters.map(
      (item) => (item.valuePermille + Math.trunc(((1000 - hp) * (item.targetId ?? 0)) / 1000)) / 10,
    ) as typeof base;
  } else if (damage.kind === 'battlePointPhase') {
    const phase = state.quantities.battlePointPhase;
    if (phase === null)
      return {
        ...input,
        damageFunction: {
          status: 'unsupported',
          kind: damage.kind,
          missingEvidence: 'missing_battle_point_phase',
        },
      };
    special = parameters.map(
      (item) =>
        ((item.secondaryValuePermille ?? 1000) +
          (item.correctionPermille ?? 0) *
            Math.min(Math.max(phase, 0), damage.maximumBattlePointPhase)) /
        1000,
    ) as typeof special;
  } else if (damage.kind === 'targetRarity') {
    const rarity = state.quantities.targetRarity;
    if (rarity === null)
      return {
        ...input,
        damageFunction: {
          status: 'unsupported',
          kind: damage.kind,
          missingEvidence: 'missing_target_rarity',
        },
      };
    special = parameters.map((item) =>
      item.targetRarities?.includes(rarity) ? (item.correctionPermille ?? 1000) / 1000 : 1,
    ) as typeof special;
  } else if (damage.kind === 'traitExpression')
    special = parameters.map((item) =>
      (item.andCheckTraits ?? []).every((trait) => (target[trait.name] ?? 0) > 0)
        ? (item.correctionPermille ?? 1000) / 1000
        : 1,
    ) as typeof special;
  else if (damage.kind === 'trait' || damage.kind === 'stateTrait')
    special = parameters.map((item) =>
      item.targetTrait && (target[item.targetTrait.name] ?? 0) > 0
        ? (item.correctionPermille ?? 1000) / 1000
        : 1,
    ) as typeof special;
  else if (damage.kind === 'traitCount') {
    const counts = parameters[0].targetId === 1 ? target : attacker;
    special = parameters.map((item) => {
      const count = (item.targetTraits ?? []).reduce(
        (sum, trait) => sum + (counts[trait.name] ?? 0),
        0,
      );
      const capped = item.maximumTargetCount ? Math.min(count, item.maximumTargetCount) : count;
      return count
        ? ((item.secondaryValuePermille ?? 1000) + capped * (item.correctionPermille ?? 0)) / 1000
        : 1;
    }) as typeof special;
  }
  return {
    ...input,
    npMultipliers: multipliers,
    npSpecialMultipliers: special,
    damageFunction: {
      status: 'resolved',
      kind: damage.kind,
      ignoreDefense: damage.kind === 'defensePiercing' || state.ignoreDefense,
    },
  };
}

function npCondition(damage: NpDamageSpec, overcharge: number): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[0];
  if (!item) return { kind: 'always' };
  if ((damage.kind === 'trait' || damage.kind === 'stateTrait') && item.targetTrait)
    return { kind: 'trait', scope: 'target', trait: item.targetTrait.name, present: true };
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
  const assumptionIssues = applyAssumptions(state, scenario.effectAssumptions);
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
    operations.push({
      operationId: `np:${attacker.id}:${damage.functionId}:damage`,
      order: operations.length,
      phase: 'npDamage',
      source: {
        origin: 'np',
        sourceInstanceId: `np:${attacker.id}`,
        sourceId: attacker.id,
        skillId: `np:${attacker.id}`,
        effectId: damage.functionId,
      },
      condition,
      decisionKey:
        condition.kind === 'always' ? null : `np:${attacker.id}:${damage.functionId}:condition`,
      enabledByDefault: condition.kind === 'always',
      evidence: { rawPath: damage.rawPath, functionId: damage.functionId, parameterKeys: [] },
      presentation: {
        label: damage.kind === 'targetRarity' ? 'レアリティ特攻宝具' : '特攻宝具',
        sourceName: attacker.name,
        skillName: np.name,
      },
      kind: 'executeNpDamage',
      damage,
      overcharge: baseInput.overcharge,
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
  const assumptions = new Map(
    scenario.effectAssumptions.map((assumption) => [assumption.decisionKey, assumption]),
  );
  const resolvedCompileProjections = compileProjections.map((projection) => {
    const choice = assumptions.get(projection.projectionKey);
    const enabled = choice?.enabled ?? projection.decision.state === 'enabled';
    return enabled
      ? projection
      : {
          ...projection,
          outcome: 'notApplied' as const,
          decision: { state: 'disabled' as const, decisionKey: projection.projectionKey },
          explanation: { ...projection.explanation, code: 'disabled' as const },
        };
  });
  const results: OperationResult[] = [];
  let input = baseInput;
  for (const operation of operations) {
    const choice = operation.decisionKey ? assumptions.get(operation.decisionKey) : undefined;
    const enabled = choice?.enabled ?? operation.enabledByDefault;
    const condition = evaluateCondition(operation.condition, state);
    let outcome: OperationResult['outcome'] = 'applied';
    let code: EffectProjection['explanation']['code'] = 'applied';
    let issue: ExecutionIssue | null = null;
    if (!enabled) {
      outcome = 'notApplied';
      code = 'disabled';
    } else if (
      operation.kind === 'addModifier' &&
      operation.card &&
      operation.card !== state.card
    ) {
      outcome = 'impossible';
      code = 'cardMismatch';
    } else if (condition === null) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsupportedCondition',
        operationId: operation.operationId,
        detail: 'quantity_missing',
      };
    } else if (!condition) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    }
    if (outcome === 'applied') {
      state = cloneState(state);
      if (operation.kind === 'addTrait')
        (state.traits[operation.scope] as Set<string>).add(operation.trait);
      else if (operation.kind === 'removeTrait')
        (state.traits[operation.scope] as Set<string>).delete(operation.trait);
      else if (operation.kind === 'addModifier')
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
      else input = applyNp(input, operation, state);
      state.evidence = [...state.evidence, operation.evidence];
    }
    if (issue) state.unresolved = [...state.unresolved, issue];
    results.push({
      operation,
      outcome,
      condition: condition === null ? 'unresolved' : condition ? 'satisfied' : 'unsatisfied',
      state: cloneState(state),
      projection: projectionFor(operation, outcome, code, enabled),
      issue,
    });
  }
  const issues = [
    ...assumptionIssues,
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
  const projections = [
    ...resolvedCompileProjections,
    ...results.map((result) => result.projection),
  ].filter(
    (projection, index, values) =>
      values.findIndex((candidate) => candidate.projectionKey === projection.projectionKey) ===
      index,
  );
  return {
    input: foldInput(input, state),
    state,
    operations: results,
    projections,
    precision: issues.length ? 'unsupported' : 'exact',
    issues,
  };
}

export function assumptionForProjection(
  projection: EffectProjection,
  enabled: boolean,
): ScenarioAssumption {
  return {
    decisionKey: projection.projectionKey,
    enabled,
    assertion:
      enabled && projection.explanation.condition
        ? firstAssertion(projection.explanation.condition)
        : null,
  };
}
