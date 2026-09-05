import { liveInputQuantity } from './stackQuantities';
import type {
  ActorScope,
  ExecutableBattleState,
  CardType,
  ConditionConstraintConflict,
  ConditionExpression,
  ConstraintValidationIssue,
  WorldFactAssertion,
} from './contracts';
import {
  isQuantityFactValueInDomain,
  QUANTITY_FACT_DOMAINS,
  type QuantityFactName,
} from '@fgo-lab/schema';
import {
  canonicalExclusiveGroup,
  traitConditionConstraintScope,
  traitConstraintActorScope,
  traitConstraintLayer,
  traitConstraintPublicScope,
  traitFactConstraintScope,
  type TraitConstraintScope,
} from './conditionSemantics';
import { targetPredicateKey } from './targetPredicate';
import {
  activationChoiceGroupKey,
  activationOperationTriggerKey,
  activationSourceQuantityKey,
  type ActivationFact,
  type TargetPredicate,
} from '@fgo-lab/schema';

export const MAX_CONSTRAINT_ALTERNATIVES = 2_048;
export const MAX_CONSTRAINT_LITERALS = 128;

type FixedFact =
  | WorldFactAssertion['fact']
  | ActivationFact
  | { kind: 'inputQuantity'; inputKey: string; value: number }
  | { kind: 'card'; card: CardType }
  | {
      kind: 'targetPredicate';
      scope: ActorScope;
      predicate: TargetPredicate;
      present: boolean;
    };

export interface FixedConstraintFact {
  sourceKey: string;
  fact: FixedFact;
}

export interface SatisfiableConditionConstraint {
  sourceKey: string;
  expression: ConditionExpression;
}

export type ConstraintValidationResult =
  | { status: 'satisfied'; alternativeCount: number }
  | { status: 'conflict'; issue: ConstraintValidationIssue }
  | { status: 'unsupported'; issue: ConstraintValidationIssue };

type QuantityName = QuantityFactName;
type Literal =
  | {
      kind: 'targetPredicate';
      scope: ActorScope;
      predicate: TargetPredicate;
      present: boolean;
      sourceKey: string;
    }
  | {
      kind: 'trait';
      scope: TraitConstraintScope;
      trait: string;
      present: boolean;
      sourceKey: string;
    }
  | {
      kind: 'quantityRange';
      quantity: QuantityName;
      subjectId: string | null;
      min: number;
      max: number;
      sourceKey: string;
    }
  | { kind: 'card'; card: CardType; sourceKey: string }
  | { kind: 'choice'; group: string; candidate: string; sourceKey: string }
  | { kind: 'operationTrigger'; source: string; position: number; sourceKey: string }
  | {
      kind: 'sourceQuantityRange';
      ownerKey: string;
      quantity: 'battlePointRate';
      subjectId: string;
      min: number;
      max: number;
      sourceKey: string;
    }
  | {
      kind: 'inputQuantityRange';
      inputKey: string;
      min: number;
      max: number;
      sourceKey: string;
    };

type Alternatives = readonly (readonly Literal[])[];
type CompileResult =
  | { status: 'supported'; alternatives: Alternatives }
  | {
      status: 'unsupported';
      reason:
        'unsupportedCondition' | 'constraintComplexityExceeded' | 'unrepresentableQuantityRange';
    };

interface ConflictDetail {
  conflict: ConditionConstraintConflict;
  sourceKeys: readonly string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function quantityRanges(
  quantity: QuantityName,
  comparison: Extract<ConditionExpression, { kind: 'quantity' }>['comparison'],
  value: number,
  negated: boolean,
): readonly { min: number; max: number }[] | null {
  if (!Number.isFinite(value)) return null;
  const domain = QUANTITY_FACT_DOMAINS[quantity];
  const effectiveComparison = negated
    ? comparison === 'lessThan'
      ? 'atLeast'
      : comparison === 'atMost'
        ? 'greaterThan'
        : comparison === 'atLeast'
          ? 'lessThan'
          : comparison === 'greaterThan'
            ? 'atMost'
            : 'notEqual'
    : comparison;
  const ranges =
    effectiveComparison === 'lessThan'
      ? [{ min: domain.min, max: Math.ceil(value) - 1 }]
      : effectiveComparison === 'atMost'
        ? [{ min: domain.min, max: Math.floor(value) }]
        : effectiveComparison === 'equal'
          ? Number.isInteger(value)
            ? [{ min: value, max: value }]
            : []
          : effectiveComparison === 'atLeast'
            ? [{ min: Math.ceil(value), max: domain.max }]
            : effectiveComparison === 'greaterThan'
              ? [{ min: Math.floor(value) + 1, max: domain.max }]
              : [
                  { min: domain.min, max: Math.ceil(value) - 1 },
                  { min: Math.floor(value) + 1, max: domain.max },
                ];
  return ranges
    .map((range) => ({
      min: Math.max(domain.min, range.min),
      max: Math.min(domain.max, range.max),
    }))
    .filter((range) => range.min <= range.max);
}

function compileExpression(
  expression: ConditionExpression,
  sourceKey: string,
  negated = false,
): CompileResult {
  switch (expression.kind) {
    case 'always':
      return { status: 'supported', alternatives: negated ? [] : [[]] };
    case 'unsupported':
      return { status: 'unsupported', reason: 'unsupportedCondition' };
    case 'trait':
      return {
        status: 'supported',
        alternatives: [
          [
            {
              kind: 'trait',
              scope: traitConditionConstraintScope(expression.scope),
              trait: expression.trait,
              present: negated ? !expression.present : expression.present,
              sourceKey,
            },
          ],
        ],
      };
    case 'targetPredicate':
      return {
        status: 'supported',
        alternatives: [
          [
            {
              kind: 'targetPredicate',
              scope: expression.scope,
              predicate: expression.predicate,
              present: negated ? !expression.present : expression.present,
              sourceKey,
            },
          ],
        ],
      };
    case 'card': {
      const cards: readonly CardType[] = ['buster', 'arts', 'quick'];
      return {
        status: 'supported',
        alternatives: (negated
          ? cards.filter((card) => card !== expression.card)
          : [expression.card]
        ).map((card) => [{ kind: 'card' as const, card, sourceKey }]),
      };
    }
    case 'noblePhantasmVariant':
      return negated
        ? { status: 'unsupported', reason: 'unsupportedCondition' }
        : { status: 'supported', alternatives: [[]] };
    case 'choice':
      return negated
        ? { status: 'unsupported', reason: 'unsupportedCondition' }
        : {
            status: 'supported',
            alternatives: [
              [
                {
                  kind: 'choice',
                  group: activationChoiceGroupKey(expression.source, expression.family),
                  candidate: expression.candidate,
                  sourceKey,
                },
              ],
            ],
          };
    case 'operationTrigger':
      return negated
        ? { status: 'unsupported', reason: 'unsupportedCondition' }
        : {
            status: 'supported',
            alternatives: [
              [
                {
                  kind: 'operationTrigger',
                  source: activationOperationTriggerKey(expression.source, expression.position),
                  position: expression.position,
                  sourceKey,
                },
              ],
            ],
          };
    case 'sourceQuantity': {
      const comparison = negated
        ? expression.comparison === 'atMost'
          ? 'atLeast'
          : 'atMost'
        : expression.comparison;
      const value = negated
        ? expression.comparison === 'atMost'
          ? expression.value + 1
          : expression.value - 1
        : expression.value;
      if (!Number.isSafeInteger(value))
        return { status: 'unsupported', reason: 'unrepresentableQuantityRange' };
      return {
        status: 'supported',
        alternatives: [
          [
            {
              kind: 'sourceQuantityRange',
              ownerKey: activationSourceQuantityKey(
                expression.source,
                expression.quantity,
                expression.subjectId,
              ),
              quantity: expression.quantity,
              subjectId: expression.subjectId,
              min: comparison === 'atLeast' ? value : Number.MIN_SAFE_INTEGER,
              max: comparison === 'atMost' ? value : Number.MAX_SAFE_INTEGER,
              sourceKey,
            },
          ],
        ],
      };
    }
    case 'quantity': {
      const ranges = quantityRanges(
        expression.quantity,
        expression.comparison,
        expression.value,
        negated,
      );
      if (ranges === null) return { status: 'unsupported', reason: 'unrepresentableQuantityRange' };
      return {
        status: 'supported',
        alternatives: ranges.map((range) => [
          {
            kind: 'quantityRange' as const,
            quantity: expression.quantity,
            subjectId: expression.subjectId ?? null,
            ...range,
            sourceKey,
          },
        ]),
      };
    }
    case 'inputQuantity': {
      if (!Number.isSafeInteger(expression.value))
        return { status: 'unsupported', reason: 'unrepresentableQuantityRange' };
      const comparison = negated
        ? expression.comparison === 'lessThan'
          ? 'atLeast'
          : expression.comparison === 'atMost'
            ? 'greaterThan'
            : expression.comparison === 'atLeast'
              ? 'lessThan'
              : expression.comparison === 'greaterThan'
                ? 'atMost'
                : 'notEqual'
        : expression.comparison;
      const ranges =
        comparison === 'lessThan'
          ? [{ min: Number.MIN_SAFE_INTEGER, max: expression.value - 1 }]
          : comparison === 'atMost'
            ? [{ min: Number.MIN_SAFE_INTEGER, max: expression.value }]
            : comparison === 'equal'
              ? [{ min: expression.value, max: expression.value }]
              : comparison === 'atLeast'
                ? [{ min: expression.value, max: Number.MAX_SAFE_INTEGER }]
                : comparison === 'greaterThan'
                  ? [{ min: expression.value + 1, max: Number.MAX_SAFE_INTEGER }]
                  : [
                      { min: Number.MIN_SAFE_INTEGER, max: expression.value - 1 },
                      { min: expression.value + 1, max: Number.MAX_SAFE_INTEGER },
                    ];
      return {
        status: 'supported',
        alternatives: ranges.map((range) => [
          {
            kind: 'inputQuantityRange' as const,
            inputKey: expression.inputKey,
            ...range,
            sourceKey,
          },
        ]),
      };
    }
    case 'traitCount':
      return { status: 'unsupported', reason: 'unsupportedCondition' };
    case 'not':
      return compileExpression(expression.expression, sourceKey, !negated);
    case 'all':
    case 'any': {
      const conjunction = (expression.kind === 'all') !== negated;
      const children = expression.expressions.map((child) =>
        compileExpression(child, sourceKey, negated),
      );
      const unsupported = children.find((child) => child.status === 'unsupported');
      if (unsupported?.status === 'unsupported') return unsupported;
      if (!conjunction) {
        const alternatives = children.flatMap((child) =>
          child.status === 'supported' ? child.alternatives : [],
        );
        return alternatives.length > MAX_CONSTRAINT_ALTERNATIVES
          ? { status: 'unsupported', reason: 'constraintComplexityExceeded' }
          : { status: 'supported', alternatives };
      }
      let combined: Alternatives = [[]];
      for (const child of children) {
        if (child.status !== 'supported') return child;
        const next: Literal[][] = [];
        for (const left of combined)
          for (const right of child.alternatives) {
            const candidate = [...left, ...right];
            if (candidate.length > MAX_CONSTRAINT_LITERALS)
              return { status: 'unsupported', reason: 'constraintComplexityExceeded' };
            if (analyzeLiterals(candidate).length === 0) next.push(candidate);
            if (next.length > MAX_CONSTRAINT_ALTERNATIVES)
              return { status: 'unsupported', reason: 'constraintComplexityExceeded' };
          }
        combined = deduplicate(next);
      }
      return { status: 'supported', alternatives: combined };
    }
  }
}

function analyzeLiterals(literals: readonly Literal[]): ConflictDetail[] {
  const conflicts: ConflictDetail[] = [];
  const traits = new Map<string, Extract<Literal, { kind: 'trait' }>>();
  const targetPredicates = new Map<string, Extract<Literal, { kind: 'targetPredicate' }>>();
  const targetClasses = new Map<ActorScope, Extract<Literal, { kind: 'targetPredicate' }>>();
  const targetAttributes = new Map<ActorScope, Extract<Literal, { kind: 'targetPredicate' }>>();
  const groups = new Map<string, Extract<Literal, { kind: 'trait' }>>();
  const actorTraits = new Map<
    string,
    Partial<Record<'initial' | 'state' | 'combined', Extract<Literal, { kind: 'trait' }>>>
  >();
  const quantities = new Map<string, { min: number; max: number; sourceKeys: readonly string[] }>();
  const choices = new Map<string, Extract<Literal, { kind: 'choice' }>>();
  let card: Extract<Literal, { kind: 'card' }> | undefined;
  for (const literal of literals) {
    if (literal.kind === 'operationTrigger') continue;
    if (literal.kind === 'targetPredicate') {
      const key = `${literal.scope}:${targetPredicateKey(literal.predicate)}`;
      const prior = targetPredicates.get(key);
      if (prior && prior.present !== literal.present)
        conflicts.push({
          conflict: { kind: 'targetPredicatePolarity', predicate: literal.predicate },
          sourceKeys: unique([prior.sourceKey, literal.sourceKey]),
        });
      targetPredicates.set(key, literal);
      if (!literal.present) continue;
      if (literal.predicate.kind === 'classIdentity') {
        const targetClass = targetClasses.get(literal.scope);
        if (
          targetClass?.predicate.kind === 'classIdentity' &&
          targetClass.predicate.classId !== literal.predicate.classId
        )
          conflicts.push({
            conflict: {
              kind: 'targetIdentityConflict',
              axis: 'class',
              values: [targetClass.predicate.classId, literal.predicate.classId],
            },
            sourceKeys: unique([targetClass.sourceKey, literal.sourceKey]),
          });
        targetClasses.set(literal.scope, literal);
      } else if (literal.predicate.kind === 'attributeIdentity') {
        const targetAttribute = targetAttributes.get(literal.scope);
        if (
          targetAttribute?.predicate.kind === 'attributeIdentity' &&
          targetAttribute.predicate.attribute !== literal.predicate.attribute
        )
          conflicts.push({
            conflict: {
              kind: 'targetIdentityConflict',
              axis: 'attribute',
              values: [targetAttribute.predicate.attribute, literal.predicate.attribute],
            },
            sourceKeys: unique([targetAttribute.sourceKey, literal.sourceKey]),
          });
        targetAttributes.set(literal.scope, literal);
      }
      continue;
    }
    if (literal.kind === 'sourceQuantityRange' || literal.kind === 'inputQuantityRange') {
      const quantityKey =
        literal.kind === 'sourceQuantityRange' ? literal.ownerKey : `input:${literal.inputKey}`;
      const prior = quantities.get(quantityKey);
      if (!prior) {
        quantities.set(quantityKey, {
          min: literal.min,
          max: literal.max,
          sourceKeys: [literal.sourceKey],
        });
        continue;
      }
      const min = Math.max(prior.min, literal.min);
      const max = Math.min(prior.max, literal.max);
      const sourceKeys = unique([...prior.sourceKeys, literal.sourceKey]);
      if (min > max)
        conflicts.push({
          conflict: {
            kind: 'quantityRange',
            quantity:
              literal.kind === 'sourceQuantityRange'
                ? literal.quantity
                : (`input:${literal.inputKey}` as const),
            ranges: [
              { min: prior.min, max: prior.max },
              { min: literal.min, max: literal.max },
            ],
          },
          sourceKeys,
        });
      quantities.set(quantityKey, { min, max, sourceKeys });
      continue;
    }
    if (literal.kind === 'choice') {
      const prior = choices.get(literal.group);
      if (prior && prior.candidate !== literal.candidate)
        conflicts.push({
          conflict: {
            kind: 'choiceConflict',
            group: literal.group,
            candidates: [prior.candidate, literal.candidate],
          },
          sourceKeys: unique([prior.sourceKey, literal.sourceKey]),
        });
      choices.set(literal.group, literal);
      continue;
    }
    if (literal.kind === 'card') {
      if (card && card.card !== literal.card)
        conflicts.push({
          conflict: { kind: 'cardMismatch', cards: [card.card, literal.card] },
          sourceKeys: unique([card.sourceKey, literal.sourceKey]),
        });
      card = literal;
      continue;
    }
    if (literal.kind === 'quantityRange') {
      const quantityKey = `${literal.quantity}:${literal.subjectId ?? 'attacker'}`;
      const prior = quantities.get(quantityKey);
      if (!prior) {
        quantities.set(quantityKey, {
          min: literal.min,
          max: literal.max,
          sourceKeys: [literal.sourceKey],
        });
        continue;
      }
      const min = Math.max(prior.min, literal.min);
      const max = Math.min(prior.max, literal.max);
      const sourceKeys = unique([...prior.sourceKeys, literal.sourceKey]);
      if (min > max)
        conflicts.push({
          conflict:
            prior.min === prior.max && literal.min === literal.max
              ? {
                  kind: 'quantityEquality',
                  quantity: literal.quantity,
                  values: [prior.min, literal.min],
                }
              : {
                  kind: 'quantityRange',
                  quantity: literal.quantity,
                  ranges: [
                    { min: prior.min, max: prior.max },
                    { min: literal.min, max: literal.max },
                  ],
                },
          sourceKeys,
        });
      quantities.set(quantityKey, { min, max, sourceKeys });
      continue;
    }
    const traitKey = `${literal.scope}:${literal.trait}`;
    const prior = traits.get(traitKey);
    if (prior && prior.present !== literal.present)
      conflicts.push({
        conflict: {
          kind: 'traitPolarity',
          scope: traitConstraintPublicScope(literal.scope),
          trait: literal.trait,
        },
        sourceKeys: unique([prior.sourceKey, literal.sourceKey]),
      });
    traits.set(traitKey, literal);
    const actorScope = traitConstraintActorScope(literal.scope);
    const layer = traitConstraintLayer(literal.scope);
    if (actorScope !== 'field' && layer !== 'field') {
      const actorTraitKey = `${actorScope}:${literal.trait}`;
      const layers = actorTraits.get(actorTraitKey) ?? {};
      layers[layer] = literal;
      actorTraits.set(actorTraitKey, layers);
    }
    if (!literal.present) continue;
    const group = canonicalExclusiveGroup(actorScope, literal.trait);
    if (!group) continue;
    const groupKey = `${actorScope}:${group}`;
    const priorGroup = groups.get(groupKey);
    if (priorGroup && priorGroup.trait !== literal.trait)
      conflicts.push({
        conflict: {
          kind: 'exclusiveTrait',
          scope: actorScope,
          group,
          traits: [priorGroup.trait, literal.trait],
        },
        sourceKeys: unique([priorGroup.sourceKey, literal.sourceKey]),
      });
    groups.set(groupKey, literal);
  }
  for (const [actorTraitKey, layers] of actorTraits) {
    const separator = actorTraitKey.indexOf(':');
    const actor = actorTraitKey.slice(0, separator) as ActorScope;
    const trait = actorTraitKey.slice(separator + 1);
    const positiveParts = [layers.initial, layers.state].filter(
      (literal): literal is Extract<Literal, { kind: 'trait' }> => literal?.present === true,
    );
    if (layers.combined?.present === false)
      for (const positive of positiveParts)
        conflicts.push({
          conflict: { kind: 'traitPolarity', scope: actor, trait },
          sourceKeys: unique([layers.combined.sourceKey, positive.sourceKey]),
        });
    if (
      layers.combined?.present === true &&
      layers.initial?.present === false &&
      layers.state?.present === false
    )
      conflicts.push({
        conflict: { kind: 'traitPolarity', scope: actor, trait },
        sourceKeys: unique([
          layers.combined.sourceKey,
          layers.initial.sourceKey,
          layers.state.sourceKey,
        ]),
      });
  }
  return conflicts;
}

function literalKey(literal: Literal): string {
  return literal.kind === 'trait'
    ? `trait:${literal.scope}:${literal.trait}:${String(literal.present)}`
    : literal.kind === 'targetPredicate'
      ? `target-predicate:${literal.scope}:${targetPredicateKey(literal.predicate)}:${String(literal.present)}`
      : literal.kind === 'card'
        ? `card:${literal.card}`
        : literal.kind === 'choice'
          ? `choice:${literal.group}:${literal.candidate}`
          : literal.kind === 'operationTrigger'
            ? `operation-trigger:${literal.source}:${String(literal.position)}`
            : literal.kind === 'sourceQuantityRange'
              ? `source-quantity:${literal.ownerKey}:${String(literal.min)}:${String(literal.max)}`
              : literal.kind === 'inputQuantityRange'
                ? `context-quantity:${literal.inputKey}:${String(literal.min)}:${String(literal.max)}`
                : `quantity:${literal.quantity}:${literal.subjectId ?? 'attacker'}:${String(literal.min)}:${String(literal.max)}`;
}

function deduplicate(alternatives: Alternatives): Alternatives {
  const seen = new Set<string>();
  return alternatives.filter((alternative) => {
    const key = [...alternative].map(literalKey).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fixedLiterals(item: FixedConstraintFact): Literal[] {
  if (item.fact.kind === 'inputQuantity')
    return [
      {
        kind: 'inputQuantityRange',
        inputKey: item.fact.inputKey,
        min: item.fact.value,
        max: item.fact.value,
        sourceKey: item.sourceKey,
      },
    ];
  if (item.fact.kind === 'trait') {
    return [
      {
        kind: 'trait',
        scope: traitFactConstraintScope(item.fact.scope),
        trait: item.fact.trait,
        present: item.fact.present,
        sourceKey: item.sourceKey,
      },
    ];
  }
  if (item.fact.kind === 'card') return [{ ...item.fact, sourceKey: item.sourceKey }];
  if (item.fact.kind === 'targetPredicate') return [{ ...item.fact, sourceKey: item.sourceKey }];
  if (item.fact.kind === 'choice')
    return [
      {
        kind: 'choice',
        group: activationChoiceGroupKey(item.fact.source, item.fact.family),
        candidate: item.fact.candidate,
        sourceKey: item.sourceKey,
      },
    ];
  if (item.fact.kind === 'operationTrigger')
    return [
      {
        kind: 'operationTrigger',
        source: activationOperationTriggerKey(item.fact.source, item.fact.position),
        position: item.fact.position,
        sourceKey: item.sourceKey,
      },
    ];
  if (item.fact.kind === 'sourceQuantity')
    return [
      {
        kind: 'sourceQuantityRange',
        ownerKey: activationSourceQuantityKey(
          item.fact.source,
          item.fact.quantity,
          item.fact.subjectId,
        ),
        quantity: item.fact.quantity,
        subjectId: item.fact.subjectId,
        min: item.fact.comparison === 'atLeast' ? item.fact.value : Number.MIN_SAFE_INTEGER,
        max: item.fact.comparison === 'atMost' ? item.fact.value : Number.MAX_SAFE_INTEGER,
        sourceKey: item.sourceKey,
      },
    ];
  return [
    {
      kind: 'quantityRange',
      quantity: item.fact.quantity,
      subjectId: null,
      min: item.fact.value,
      max: item.fact.value,
      sourceKey: item.sourceKey,
    },
  ];
}

function conflictIssue(
  details: readonly ConflictDetail[],
  expressionSourceKeys: readonly string[] = [],
): ConstraintValidationIssue {
  const uniqueDetails = [
    ...details.reduce((byConflict, detail) => {
      const key = JSON.stringify(detail.conflict);
      const prior = byConflict.get(key);
      byConflict.set(
        key,
        prior
          ? {
              conflict: prior.conflict,
              sourceKeys: unique([...prior.sourceKeys, ...detail.sourceKeys]),
            }
          : detail,
      );
      return byConflict;
    }, new Map<string, ConflictDetail>()),
  ].map(([, detail]) => detail);
  return {
    kind: 'constraintConflict',
    sourceKeys: unique([
      ...uniqueDetails.flatMap((detail) => detail.sourceKeys),
      ...expressionSourceKeys,
    ]),
    conflicts: uniqueDetails.map((detail) => detail.conflict),
  };
}

export function validateConstraintSet({
  fixedFacts,
  expressions,
}: {
  fixedFacts: readonly FixedConstraintFact[];
  expressions: readonly SatisfiableConditionConstraint[];
}): ConstraintValidationResult {
  const expressionSourceKeys = expressions.map((expression) => expression.sourceKey);
  const invalidQuantityFacts = fixedFacts.filter(
    (item) =>
      item.fact.kind === 'quantity' &&
      !isQuantityFactValueInDomain(item.fact.quantity, item.fact.value),
  );
  if (invalidQuantityFacts.length > 0)
    return {
      status: 'unsupported',
      issue: {
        kind: 'constraintValidationUnsupported',
        sourceKeys: unique([
          ...invalidQuantityFacts.map((fact) => fact.sourceKey),
          ...expressionSourceKeys,
        ]),
        reason: 'quantityFactOutOfDomain',
      },
    };
  const fixed = fixedFacts.flatMap(fixedLiterals);
  if (fixed.length > MAX_CONSTRAINT_LITERALS)
    return {
      status: 'unsupported',
      issue: {
        kind: 'constraintValidationUnsupported',
        sourceKeys: fixedFacts.map((fact) => fact.sourceKey),
        reason: 'constraintComplexityExceeded',
      },
    };
  const fixedConflicts = analyzeLiterals(fixed);
  if (fixedConflicts.length)
    return {
      status: 'conflict',
      issue: conflictIssue(fixedConflicts, expressionSourceKeys),
    };

  let candidates: Alternatives = [fixed];
  const activeSourceKeys = fixedFacts.map((fact) => fact.sourceKey);
  for (const expression of expressions) {
    activeSourceKeys.push(expression.sourceKey);
    const compiled = compileExpression(expression.expression, expression.sourceKey);
    if (compiled.status === 'unsupported')
      return {
        status: 'unsupported',
        issue: {
          kind: 'constraintValidationUnsupported',
          sourceKeys: unique(activeSourceKeys),
          reason: compiled.reason,
        },
      };
    const next: Literal[][] = [];
    const conflicts: ConflictDetail[] = [];
    for (const left of candidates)
      for (const right of compiled.alternatives) {
        const candidate = [...left, ...right];
        if (candidate.length > MAX_CONSTRAINT_LITERALS)
          return {
            status: 'unsupported',
            issue: {
              kind: 'constraintValidationUnsupported',
              sourceKeys: unique(activeSourceKeys),
              reason: 'constraintComplexityExceeded',
            },
          };
        const candidateConflicts = analyzeLiterals(candidate);
        if (candidateConflicts.length) conflicts.push(...candidateConflicts);
        else next.push(candidate);
        if (next.length > MAX_CONSTRAINT_ALTERNATIVES)
          return {
            status: 'unsupported',
            issue: {
              kind: 'constraintValidationUnsupported',
              sourceKeys: unique(activeSourceKeys),
              reason: 'constraintComplexityExceeded',
            },
          };
      }
    candidates = deduplicate(next);
    if (candidates.length === 0)
      return {
        status: 'conflict',
        issue:
          conflicts.length > 0
            ? conflictIssue(conflicts, expressionSourceKeys)
            : {
                kind: 'constraintConflict',
                sourceKeys: unique([...activeSourceKeys, ...expressionSourceKeys]),
                conflicts: [{ kind: 'unsatisfiableExpression' }],
              },
      };
  }
  return { status: 'satisfied', alternativeCount: candidates.length };
}

export function fixedConstraintFactsFromState(
  state: ExecutableBattleState,
  sourcePrefix = 'battle-state',
): FixedConstraintFact[] {
  const traits = (['attacker', 'attackerState', 'target', 'targetState', 'field'] as const).flatMap(
    (scope) =>
      [...state.traits[scope]].map(([trait, present]) => ({
        sourceKey: `${sourcePrefix}:trait:${scope}:${trait}`,
        fact: { kind: 'trait' as const, scope, trait, present },
      })),
  );
  const quantities = Object.entries(state.quantities).flatMap(([quantity, value]) =>
    value === null
      ? []
      : [
          {
            sourceKey: `${sourcePrefix}:quantity:${quantity}`,
            fact: {
              kind: 'quantity' as const,
              quantity: quantity as keyof ExecutableBattleState['quantities'],
              value,
            },
          },
        ],
  );
  const actorPredicates = (['attacker', 'target'] as const).flatMap((scope) =>
    [...state.actorPredicates[scope]].map(([key, { predicate, present }]) => ({
      sourceKey: `${sourcePrefix}:predicate:${scope}:${key}`,
      fact: { kind: 'targetPredicate' as const, scope, predicate, present },
    })),
  );
  return [
    ...traits,
    ...actorPredicates,
    ...quantities,
    ...Object.keys(state.stackQuantitySources).map((key) => ({
      sourceKey: `${sourcePrefix}:input:${key}`,
      fact: {
        kind: 'inputQuantity' as const,
        inputKey: key,
        value: liveInputQuantity(state, key)!,
      },
    })),
    ...state.activationContext.facts.map((fact, index) => ({
      sourceKey: `${sourcePrefix}:activation:${String(index)}`,
      fact,
    })),
    { sourceKey: `${sourcePrefix}:card`, fact: { kind: 'card' as const, card: state.card } },
  ];
}
