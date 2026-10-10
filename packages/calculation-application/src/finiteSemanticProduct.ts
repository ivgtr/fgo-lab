export interface FiniteSemanticDimension<T> {
  key: string;
  values: readonly T[];
}

export interface FiniteSemanticProduct<T> {
  candidates: Iterable<Readonly<Record<string, T>>>;
  upperBound: number;
}

export type FiniteSemanticBound =
  { status: 'ready'; upperBound: number } | { status: 'limitExceeded'; upperBound: number };

/** Checks the complete Cartesian bound without allocating any candidate tuples. */
export function finiteSemanticProductBound<T>(
  dimensions: readonly FiniteSemanticDimension<T>[],
  limit: number,
): FiniteSemanticBound {
  let upperBound = 1;
  for (const dimension of dimensions) {
    if (dimension.values.length === 0) return { status: 'ready', upperBound: 0 };
    upperBound *= dimension.values.length;
    if (!Number.isSafeInteger(upperBound) || upperBound > limit)
      return { status: 'limitExceeded', upperBound };
  }
  return { status: 'ready', upperBound };
}

export function finiteSemanticProduct<T>(
  dimensions: readonly FiniteSemanticDimension<T>[],
  limit: number,
  limitCode: string,
): FiniteSemanticProduct<T> {
  const bound = finiteSemanticProductBound(dimensions, limit);
  if (bound.status === 'limitExceeded')
    throw new RangeError(`${limitCode}:${String(bound.upperBound)}`);
  const { upperBound } = bound;
  const candidates = {
    *[Symbol.iterator]() {
      function* visit(
        index: number,
        candidate: Readonly<Record<string, T>>,
      ): Generator<Readonly<Record<string, T>>> {
        const dimension = dimensions[index];
        if (!dimension) {
          yield candidate;
          return;
        }
        for (const value of dimension.values)
          yield* visit(index + 1, { ...candidate, [dimension.key]: value });
      }
      yield* visit(0, {});
    },
  };
  return { candidates, upperBound };
}
