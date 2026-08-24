export type TraitExpression =
  | { type: 'trait'; trait: string }
  | { type: 'and'; items: readonly TraitExpression[] }
  | { type: 'or'; items: readonly TraitExpression[] };

export interface TraitMatch {
  matches: boolean;
  matchedTraits: string[];
  reason: string;
}

export function matchTraits(
  targetTraits: readonly string[],
  expression: TraitExpression,
): TraitMatch {
  const target = new Set(targetTraits);
  if (expression.type === 'trait') {
    const matches = target.has(expression.trait);
    return {
      matches,
      matchedTraits: matches ? [expression.trait] : [],
      reason: matches ? 'trait_matched' : 'trait_missing',
    };
  }
  const children = expression.items.map((item) => matchTraits(targetTraits, item));
  const matches =
    expression.type === 'and'
      ? children.every((child) => child.matches)
      : children.some((child) => child.matches);
  return {
    matches,
    matchedTraits: [...new Set(children.flatMap((child) => child.matchedTraits))],
    reason: `${expression.type}_${matches ? 'matched' : 'not_matched'}`,
  };
}
