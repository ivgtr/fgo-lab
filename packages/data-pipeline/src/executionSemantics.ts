import type {
  CanonicalEffectContributionScope,
  CanonicalEffectRoute,
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

const nonModifierBuffs = new Set([
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

const typedResourceFamilies = new Map<
  string,
  {
    resource: 'npGauge' | 'hp' | 'criticalStars' | 'battlePoint';
    direction: 'gain' | 'loss';
    unit: 'fixed' | 'percent';
  }
>([
  ['gainNp', { resource: 'npGauge', direction: 'gain', unit: 'fixed' }],
  ['lossNp', { resource: 'npGauge', direction: 'loss', unit: 'fixed' }],
  ['gainStar', { resource: 'criticalStars', direction: 'gain', unit: 'fixed' }],
  ['lossStar', { resource: 'criticalStars', direction: 'loss', unit: 'fixed' }],
  ['gainHp', { resource: 'hp', direction: 'gain', unit: 'fixed' }],
  ['gainHpPer', { resource: 'hp', direction: 'gain', unit: 'percent' }],
  ['lossHpSafe', { resource: 'hp', direction: 'loss', unit: 'fixed' }],
  ['lossHp', { resource: 'hp', direction: 'loss', unit: 'fixed' }],
  ['lossHpPerSafe', { resource: 'hp', direction: 'loss', unit: 'percent' }],
  ['subBattlePoint', { resource: 'battlePoint', direction: 'loss', unit: 'fixed' }],
]);

const typedStateFamilies = new Map<
  string,
  'add' | 'remove' | 'move' | 'extendDuration' | 'shortenCount'
>([
  ['addStateShort', 'add'],
  ['addState', 'add'],
  ['addStateShortToField', 'add'],
  ['addStateToField', 'add'],
  ['subState', 'remove'],
  ['moveState', 'move'],
  ['extendBuffturn', 'extendDuration'],
  ['shortenBuffcount', 'shortenCount'],
]);

const unsupportedOperationFamilies = new Map<
  string,
  Extract<EffectExecutionOperation, { kind: 'unsupported' }>['reason']
>([
  ['gainHpFromTargets', 'dependentResourceAmount'],
  ['replaceMember', 'partyCompositionMutation'],
  ['moveToLastSubmember', 'partyCompositionMutation'],
]);

const dependentNpResourceFamilies = new Map<
  string,
  'currentGaugeMultiplier' | 'matchingTargetCount' | 'matchingBuffCount' | 'dependentTargetResult'
>([
  ['gainNpBuffIndividualSum', 'matchingBuffCount'],
  ['gainNpFromTargets', 'dependentTargetResult'],
  ['gainNpIndividualSum', 'matchingTargetCount'],
  ['gainNpTargetSum', 'matchingTargetCount'],
  ['gainMultiplyNp', 'currentGaugeMultiplier'],
]);

const boundedProofByFamily = new Map<
  string,
  Extract<EffectExecutionOperation, { kind: 'boundedPhaseIrrelevant' }>['proof']
>([
  ['friendPointUpDuplicate', 'accountOrDropOnly'],
  ['userEquipExpUp', 'accountOrDropOnly'],
  ['eventDropUp', 'accountOrDropOnly'],
  ['expUp', 'accountOrDropOnly'],
  ['servantFriendshipUp', 'accountOrDropOnly'],
  ['eventDropRateUp', 'accountOrDropOnly'],
  ['qpDropUp', 'accountOrDropOnly'],
  ['enemyEncountCopyRateUp', 'accountOrDropOnly'],
  ['qpUp', 'accountOrDropOnly'],
  ['classDropUp', 'accountOrDropOnly'],
  ['enemyEncountRateUp', 'accountOrDropOnly'],
  ['eventPointUp', 'accountOrDropOnly'],
  ['friendPointUp', 'accountOrDropOnly'],
  ['shortenSkill', 'cooldownWithoutReuse'],
  ['extendUserEquipSkill', 'cooldownWithoutReuse'],
  ['cardReset', 'commandCardOutsideTerminalNp'],
  ['fixCommandcard', 'commandCardOutsideTerminalNp'],
  ['hastenNpturn', 'enemyChargeOutsideDamage'],
  ['delayNpturn', 'enemyChargeOutsideDamage'],
  ['absorbNpturn', 'enemyChargeOutsideDamage'],
  ['instantDeath', 'postTerminalDamageOnly'],
  ['forceInstantDeath', 'postTerminalDamageOnly'],
  ['displayBuffstring', 'presentationOnly'],
  ['none', 'noBattleStateChange'],
]);

type DamageRoute = Pick<
  Extract<EffectExecutionOperation, { kind: 'damageModifier' }>,
  'modifier' | 'sign' | 'card'
> & { expectedRecipient: 'attacker' | 'target' };

export function normalizeTargetPolicy(target: string, targetTeam?: string): CanonicalTargetPolicy {
  if (targetTeam === 'enemy' && (target === 'self' || target.startsWith('pt'))) return 'enemy';
  if (target.startsWith('enemy')) return 'enemy';
  if (target === 'self') return 'sourceSelf';
  if (target === 'ptOther' || target === 'ptOtherFull') return 'partyOther';
  if (target === 'ptOne' || target === 'ptAll' || target === 'ptFull') return 'partyMember';
  return 'unresolved';
}

export function normalizeContributionScope(
  target: string,
  targetTeam?: string,
): CanonicalEffectContributionScope | null {
  if (targetTeam === 'enemy' || target.startsWith('enemy')) return 'enemyApplied';
  if (
    target === 'self' ||
    target === 'commandTypeSelfTreasureDevice' ||
    target === 'ptOne' ||
    target === 'ptOneHpLowestRate' ||
    target === 'ptRandom'
  )
    return 'personal';
  if (target === 'ptAll' || target === 'ptFull') return 'partyWide';
  if (
    target === 'ptOther' ||
    target === 'ptOtherFull' ||
    target === 'ptSelfAnotherFirst' ||
    target === 'ptOneOther' ||
    target === 'ptselectOneSub' ||
    target === 'fieldOther'
  )
    return 'partyOther';
  return null;
}

function routeDamageModifier(buffTypes: readonly string[], cardTypes: readonly string[]) {
  if (buffTypes.some((type) => nonModifierBuffs.has(type))) return null;
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

export function functionReachesDamageModifier(fn: AtlasFunction): boolean {
  const buffTypes = (fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : []));
  if (
    buffTypes.includes('buffRate') &&
    fn.buffs?.some((buff) =>
      buff.script?.UpBuffRateBuffIndiv?.some((trait) => trait.name === 'buffNpDamageUp'),
    )
  )
    return true;
  return routeDamageModifier(buffTypes, ['buster']) !== null;
}

function coalesceDamageRelevantContextMutations(
  operations: readonly EffectExecutionOperation[],
): EffectExecutionOperation[] {
  const result: EffectExecutionOperation[] = [];
  const mutationIndex = new Map<string, number>();
  for (const operation of operations) {
    if (
      operation.kind !== 'contextMutation' ||
      (operation.mutation !== 'addTrait' && operation.mutation !== 'removeTrait')
    ) {
      result.push(operation);
      continue;
    }
    const key = [
      operation.mutation,
      operation.scope,
      operation.route.target,
      operation.route.contributionScope,
      operation.route.eligibility.kind,
      operation.route.eligibility.kind === 'requiredRecipient'
        ? operation.route.eligibility.recipient
        : 'any',
      operation.trait,
    ].join(':');
    const priorIndex = mutationIndex.get(key);
    const prior = priorIndex === undefined ? undefined : result[priorIndex];
    if (
      prior?.kind === 'contextMutation' &&
      (prior.mutation === 'addTrait' || prior.mutation === 'removeTrait') &&
      prior.damageRelevant !== operation.damageRelevant
    ) {
      result[priorIndex!] = { ...operation, damageRelevant: true };
      continue;
    }
    mutationIndex.set(key, result.length);
    result.push(operation);
  }
  return result;
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
  canonicalOperations: readonly EffectExecutionOperation[];
  contextChanges: {
    addedFieldTraits: string[];
    removedFieldTraits: string[];
    addedRecipientTraits: string[];
    addedRecipientStateTraits: string[];
    removedRecipientTraits: string[];
    removedRecipientStateTraits: string[];
  };
  quantityApplicationTiming: 'duringExecution' | 'representedByCurrentInput';
}): EffectExecutionOperation[] {
  const target = input.fn.funcTargetType ?? 'unknown';
  const policy = normalizeTargetPolicy(target, input.fn.funcTargetTeam);
  const contributionScope = normalizeContributionScope(target, input.fn.funcTargetTeam);
  const buffTypes = (input.fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : []));
  const potentiallyDamageRelevant = isPotentiallyDamageRelevant(target, buffTypes);
  const targetMismatch = potentiallyDamageRelevant ? ('unsupported' as const) : ('ignore' as const);
  const operations: EffectExecutionOperation[] = [...input.canonicalOperations];

  const canonicalRoute = (
    recipient: 'attacker' | 'target' | null,
    mismatch: 'ignore' | 'unsupported',
  ): CanonicalEffectRoute => {
    if (contributionScope === null)
      throw new TypeError(
        `canonical_effect_route_unresolved:${target}:${policy}:${String(contributionScope)}`,
      );
    return {
      target: policy,
      contributionScope,
      eligibility:
        recipient === null
          ? { kind: 'anyRecipient', onMissing: mismatch }
          : { kind: 'requiredRecipient', recipient, onMissing: 'ignore', onMismatch: mismatch },
    };
  };
  const unresolvedRoute = (): CanonicalEffectRoute => ({
    target: 'unresolved',
    contributionScope: 'personal',
    eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
  });

  if (
    contributionScope === null &&
    (potentiallyDamageRelevant ||
      input.canonicalOperations.length > 0 ||
      Object.values(input.contextChanges).some((traits) => traits.length > 0))
  )
    return [
      {
        kind: 'unsupported',
        route: unresolvedRoute(),
        reason: 'unresolvedTarget',
        damageRelevant: potentiallyDamageRelevant,
      },
    ];

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
          kind: 'unsupported',
          route:
            contributionScope === null ? unresolvedRoute() : canonicalRoute(null, 'unsupported'),
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
      route: canonicalRoute(null, targetMismatch),
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.removedFieldTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'removeTrait',
      scope: 'field',
      route: canonicalRoute(null, targetMismatch),
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.addedRecipientTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'addTrait',
      scope: 'recipientState',
      route: canonicalRoute(null, targetMismatch),
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.addedRecipientStateTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'addTrait',
      scope: 'recipientState',
      route: canonicalRoute(null, 'unsupported'),
      trait,
      damageRelevant: true,
    });
  for (const trait of input.contextChanges.removedRecipientTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'suppressInitialTrait',
      scope: 'recipientState',
      route: canonicalRoute(null, targetMismatch),
      trait,
      damageRelevant: potentiallyDamageRelevant,
    });
  for (const trait of input.contextChanges.removedRecipientStateTraits)
    operations.push({
      kind: 'contextMutation',
      mutation: 'removeTrait',
      scope: 'recipientState',
      route: canonicalRoute(null, 'unsupported'),
      trait,
      damageRelevant: true,
    });

  const common = () => ({
    route: canonicalRoute('attacker', targetMismatch),
    semanticSupport: 'supported' as const,
  });
  if (buffTypes.includes('pierceDefence')) operations.push({ kind: 'ignoreDefense', ...common() });
  else if (buffTypes.includes('pierceSubdamage'))
    operations.push({ kind: 'ignoreDamageCut', ...common() });
  else if (
    buffTypes.includes('buffRate') &&
    input.fn.buffs?.some((buff) =>
      buff.script?.UpBuffRateBuffIndiv?.some((trait) => trait.name === 'buffNpDamageUp'),
    )
  )
    operations.push({
      kind: 'modifierRateChange',
      modifier: 'npDamageBuff',
      ...common(),
      values: modifierValues(input.parameterSets),
      valueExpressions: input.valueExpressions,
    });
  else {
    const route = routeDamageModifier(buffTypes, input.cardTypes);
    if (route && contributionScope !== null)
      operations.push({
        kind: 'damageModifier',
        route: canonicalRoute(route.expectedRecipient, targetMismatch),
        semanticSupport: 'supported',
        modifier: route.modifier,
        sign: route.sign,
        card: route.card,
        values: modifierValues(input.parameterSets),
        valueExpressions: input.valueExpressions,
      });
    else if (potentiallyDamageRelevant && operations.length === 0)
      operations.push({
        kind: 'unsupported',
        route: policy === 'unresolved' ? unresolvedRoute() : canonicalRoute(null, 'unsupported'),
        reason: policy === 'unresolved' ? 'unresolvedTarget' : 'operationSemantics',
        damageRelevant: true,
      });
  }

  if (
    operations.length === 0 &&
    buffTypes.includes('addIndividuality') &&
    input.parameterSets.some((set) => set.some((parameter) => typeof parameter.Value === 'number'))
  )
    operations.push({
      kind: 'unsupported',
      route: policy === 'unresolved' ? unresolvedRoute() : canonicalRoute(null, 'ignore'),
      reason: 'contextReference',
      damageRelevant: false,
    });

  if (operations.length === 0) {
    const family = input.fn.funcType ?? 'unknown';
    const resource = typedResourceFamilies.get(family);
    const stateMutation = typedStateFamilies.get(family);
    const unsupported = unsupportedOperationFamilies.get(family);
    const dependentNp = dependentNpResourceFamilies.get(family);
    const boundedProof = boundedProofByFamily.get(family);
    if (resource) {
      const subjectIds = [
        ...new Set(
          input.parameterSets.flatMap((set) =>
            set.flatMap((parameter) =>
              typeof parameter.BattlePointId === 'number' ? [String(parameter.BattlePointId)] : [],
            ),
          ),
        ),
      ];
      operations.push({
        kind: 'resourceMutation',
        ...resource,
        recipient: policy,
        amount: { kind: 'fixed', values: modifierValues(input.parameterSets) },
        subjectId: subjectIds.length === 1 ? subjectIds[0]! : null,
      });
    } else if (dependentNp)
      operations.push({
        kind: 'unsupported',
        route: policy === 'unresolved' ? unresolvedRoute() : canonicalRoute(null, 'unsupported'),
        reason: 'dependentResourceAmount',
        damageRelevant: true,
      });
    else if (stateMutation)
      operations.push({
        kind: 'stateMutation',
        mutation: stateMutation,
        recipient: policy,
        polarity: 'unknown',
      });
    else if (unsupported)
      operations.push({
        kind: 'unsupported',
        route: policy === 'unresolved' ? unresolvedRoute() : canonicalRoute(null, 'unsupported'),
        reason: unsupported,
        damageRelevant: true,
      });
    else if (boundedProof) operations.push({ kind: 'boundedPhaseIrrelevant', proof: boundedProof });
    else throw new TypeError(`unclassified_canonical_operation:${family}`);
  }
  return coalesceDamageRelevantContextMutations(operations);
}
