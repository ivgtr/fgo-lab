import type {
  CanonicalTargetPolicy,
  EffectExecutionOperation,
  ModifierValueExpression,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';

type ValueSets = [
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
];
type ExpressionSets = [
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
];

const nonDamageBuffs = new Set([
  'changeCommandCardType',
  'downTolerance',
  'upCriticaldamage',
  'upExtraattack',
  'upTolerance',
  'upToleranceSubstate',
  'subIndividuality',
]);
const possiblyDamageBuffs = new Set([
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
  'subSelfdamage',
  'tdTypeChange',
  'tdTypeChangeArts',
  'tdTypeChangeBuster',
  'tdTypeChangeQuick',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
const attackReductionBuffs = new Set(['downAtk', 'downCommandall', 'downNpdamage']);
const defensiveBuffs = new Set([
  'subSelfdamage',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);

type DamageRoute = Pick<
  Extract<EffectExecutionOperation, { kind: 'damageModifier' }>,
  'modifier' | 'sign' | 'card'
> & { expectedRecipient: 'attacker' | 'target' };

export function normalizeTargetPolicy(
  target: string,
  targetTeam: string | undefined = undefined,
): CanonicalTargetPolicy {
  if (targetTeam === 'enemy' && (target === 'self' || target.startsWith('pt'))) return 'enemy';
  if (target.startsWith('enemy')) return 'enemy';
  if (target === 'self') return 'sourceSelf';
  if (target === 'ptOther' || target === 'ptOtherFull') return 'partyOther';
  if (target === 'ptOne' || target === 'ptAll' || target === 'ptFull') return 'partyMember';
  return 'unresolved';
}

function routeDamageModifier(buffTypes: readonly string[], cardTypes: readonly string[]) {
  if (buffTypes.some((type) => nonDamageBuffs.has(type))) return null;
  const expectedRecipient = buffTypes.some((type) =>
    [
      'downDefence',
      'upDefence',
      'downDefencecommandall',
      'upDefencecommandall',
      'downDefenceNpdamage',
      'upDefenceNpdamage',
    ].includes(type),
  )
    ? ('target' as const)
    : ('attacker' as const);
  const route = (
    modifier: DamageRoute['modifier'],
    sign: DamageRoute['sign'],
    card: DamageRoute['card'] = null,
  ): DamageRoute => ({ modifier, sign, card, expectedRecipient });
  if (buffTypes.includes('addDamage')) return route('flatDamage', 1);
  if (
    buffTypes.some((type) =>
      ['upDamage', 'upDamageIndividuality', 'upDamageIndividualityActiveonly'].includes(type),
    )
  )
    return route('powerMod', 1);
  if (buffTypes.includes('upAtk')) return route('attackBuff', 1);
  if (buffTypes.includes('downAtk')) return route('attackBuff', -1);
  if (buffTypes.includes('downDefence')) return route('attackBuff', 1);
  if (buffTypes.includes('upDefence')) return route('defenseBuff', 1);
  if (buffTypes.includes('upNpdamage')) return route('npDamageBuff', 1);
  if (buffTypes.includes('downNpdamage')) return route('npDamageBuff', -1);
  if (buffTypes.includes('downDefenceNpdamage')) return route('npDamageBuff', 1);
  if (buffTypes.includes('upDefenceNpdamage')) return route('npResistance', 1);
  const card = (cardTypes[0] as DamageRoute['card'] | undefined) ?? null;
  if (card && buffTypes.some((type) => ['upCommandall', 'upCommandatk'].includes(type)))
    return route('cardBuff', 1, card);
  if (card && buffTypes.includes('downCommandall')) return route('cardBuff', -1, card);
  if (card && buffTypes.includes('downDefencecommandall')) return route('cardBuff', 1, card);
  if (card && buffTypes.includes('upDefencecommandall')) return route('cardResistance', 1, card);
  return null;
}

function modifierValues(parameterSets: readonly (readonly AtlasFunctionValue[])[]): ValueSets {
  return parameterSets.map((set) =>
    set.map((parameter) => (typeof parameter.Value === 'number' ? parameter.Value : null)),
  ) as ValueSets;
}

function isPotentiallyDamageRelevant(target: string, buffTypes: readonly string[]): boolean {
  return (
    !(target.startsWith('enemy') && buffTypes.some((type) => attackReductionBuffs.has(type))) &&
    !(!target.startsWith('enemy') && buffTypes.some((type) => defensiveBuffs.has(type))) &&
    buffTypes.some((type) => possiblyDamageBuffs.has(type))
  );
}

export function normalizeExecutionSemantics(input: {
  fn: AtlasFunction;
  parameterSets: readonly (readonly AtlasFunctionValue[])[];
  valueExpressions: ExpressionSets;
  cardTypes: readonly ('buster' | 'arts' | 'quick')[];
  cardTypeMutation: { card: 'buster' | 'arts' | 'quick'; stateTraits: string[] } | null;
  contextChanges: {
    addedFieldTraits: string[];
    removedFieldTraits: string[];
    addedRecipientTraits: string[];
    removedRecipientTraits: string[];
  };
  quantityApplicationTiming: 'duringExecution' | 'representedByCurrentInput';
}): EffectExecutionOperation[] {
  const target = input.fn.funcTargetType ?? 'unknown';
  const policy = normalizeTargetPolicy(target, input.fn.funcTargetTeam);
  const buffTypes = (input.fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : []));
  const potentiallyDamageRelevant = isPotentiallyDamageRelevant(target, buffTypes);
  const targetMismatch = potentiallyDamageRelevant ? ('unsupported' as const) : ('ignore' as const);
  const operations: EffectExecutionOperation[] = [];

  if (input.fn.funcType === 'addBattlePoint') {
    const values = input.parameterSets.flatMap((set) => set);
    const quantities = [
      ...new Set(
        values.flatMap((value) =>
          typeof value.BattlePointValue === 'number' ? [value.BattlePointValue] : [],
        ),
      ),
    ];
    const subjectIds = [
      ...new Set(
        values.flatMap((value) =>
          typeof value.BattlePointId === 'number' ? [String(value.BattlePointId)] : [],
        ),
      ),
    ];
    if (quantities.length !== 1 || subjectIds.length !== 1)
      return [
        {
          kind: 'unresolved',
          targetPolicy: policy,
          reason: 'operationSemantics',
          damageRelevant: true,
        },
      ];
    return [
      {
        kind: 'contextMutation',
        mutation: 'addQuantity',
        quantity: 'battlePointPhase',
        subjectId: subjectIds[0]!,
        amount: quantities[0]!,
        applicationTiming: input.quantityApplicationTiming,
        damageRelevant: true,
      },
    ];
  }

  for (const trait of input.contextChanges.addedFieldTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'addTrait',
      scope: 'field',
      targetPolicy: policy,
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.removedFieldTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'removeTrait',
      scope: 'field',
      targetPolicy: policy,
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.addedRecipientTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'addTrait',
      scope: 'recipientState',
      targetPolicy: policy,
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.removedRecipientTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'suppressInitialTrait',
      scope: 'recipientState',
      targetPolicy: policy,
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });

  if (input.cardTypeMutation && (target === 'self' || target === 'commandTypeSelfTreasureDevice'))
    operations.push({
      kind: 'cardTypeMutation',
      targetPolicy: 'attackerNpCard',
      card: input.cardTypeMutation.card,
      stateTraits: input.cardTypeMutation.stateTraits,
      semanticSupport: 'supported',
    });

  const common = {
    targetPolicy: policy,
    expectedRecipient: 'attacker' as const,
    targetMismatch,
    semanticSupport: 'supported' as const,
  };
  if (buffTypes.includes('pierceDefence')) operations.push({ kind: 'ignoreDefense', ...common });
  else if (buffTypes.includes('pierceSubdamage'))
    operations.push({ kind: 'ignoreDamageCut', ...common });
  else if (
    buffTypes.includes('buffRate') &&
    input.fn.buffs?.some((buff) =>
      buff.script?.UpBuffRateBuffIndiv?.some((trait) => trait.name === 'buffNpDamageUp'),
    )
  )
    operations.push({
      kind: 'modifierRateChange',
      modifier: 'npDamageBuff',
      ...common,
      values: modifierValues(input.parameterSets),
      valueExpressions: input.valueExpressions,
    });
  else {
    const route = routeDamageModifier(buffTypes, input.cardTypes);
    if (route)
      operations.push({
        kind: 'damageModifier',
        targetPolicy: policy,
        expectedRecipient: route.expectedRecipient,
        targetMismatch,
        semanticSupport: 'supported',
        modifier: route.modifier,
        sign: route.sign,
        card: route.card,
        values: modifierValues(input.parameterSets),
        valueExpressions: input.valueExpressions,
      });
    else if (potentiallyDamageRelevant && operations.length === 0)
      operations.push({
        kind: 'unresolved',
        targetPolicy: policy,
        reason: policy === 'unresolved' ? 'targetPolicy' : 'operationSemantics',
        damageRelevant: true,
      });
  }

  if (
    operations.length === 0 &&
    buffTypes.includes('addIndividuality') &&
    input.parameterSets.some((set) => set.some((parameter) => typeof parameter.Value === 'number'))
  )
    operations.push({
      kind: 'unresolved',
      targetPolicy: policy,
      reason: 'contextReference',
      damageRelevant: false,
    });

  if (operations.length === 0) operations.push({ kind: 'nonDamage' });
  return operations;
}
