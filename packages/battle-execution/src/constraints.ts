import type {
  ActorScope,
  BattleState,
  CardType,
  ConditionConstraintConflict,
  ConditionExpression,
  ConstraintValidationIssue,
  WorldFactAssertion,
} from './index';
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

export const MAX_CONSTRAINT_ALTERNATIVES = 2_048;
export const MAX_CONSTRAINT_LITERALS = 128;

type FixedFact = WorldFactAssertion['fact'] | { kind: 'card'; card: CardType };

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
      kind: 'trait';
      scope: TraitConstraintScope;
      trait: string;
      present: boolean;
      sourceKey: string;
    }
  | {
      kind: 'quantityRange';
      quantity: QuantityName;
      min: number;
      max: number;
      sourceKey: string;
    }
  | { kind: 'card'; card: CardType; sourceKey: string };

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
            ...range,
            sourceKey,
          },
        ]),
      };
    }
    case 'partialTrait':
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
  const groups = new Map<string, Extract<Literal, { kind: 'trait' }>>();
  const actorTraits = new Map<
    string,
    Partial<Record<'initial' | 'state' | 'combined', Extract<Literal, { kind: 'trait' }>>>
  >();
  const quantities = new Map<
    QuantityName,
    { min: number; max: number; sourceKeys: readonly string[] }
  >();
  let card: Extract<Literal, { kind: 'card' }> | undefined;
  for (const literal of literals) {
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
      const prior = quantities.get(literal.quantity);
      if (!prior) {
        quantities.set(literal.quantity, {
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
      quantities.set(literal.quantity, { min, max, sourceKeys });
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
    : literal.kind === 'card'
      ? `card:${literal.card}`
      : `quantity:${literal.quantity}:${String(literal.min)}:${String(literal.max)}`;
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
  return [
    {
      kind: 'quantityRange',
      quantity: item.fact.quantity,
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
  state: BattleState,
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
              quantity: quantity as keyof BattleState['quantities'],
              value,
            },
          },
        ],
  );
  return [
    ...traits,
    ...quantities,
    { sourceKey: `${sourcePrefix}:card`, fact: { kind: 'card' as const, card: state.card } },
  ];
}
