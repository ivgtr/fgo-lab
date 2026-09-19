import {
  executeHpOperation,
  isHpOperation,
  hpPermille,
  hpAlive,
  seedHp,
  type HpState,
  type SourceEffect,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
/** Initial inputs are integers. Partition them by every ordered HP read and survival boundary.
 * Operations use the executor's arithmetic. Conditional branches over-approximate worlds; the
 * application still executes each candidate in its own legal world and rejects impossible paths.
 */
export function rankingHpInitialBoundaries(
  maximum: number,
  sources: readonly SourceEffect[],
  conditions: readonly ConditionExpression[],
  inverseNpRatio = false,
): readonly number[] {
  const slopes = new Set<number>(inverseNpRatio ? [-1] : []);
  for (const source of sources)
    for (const op of source.effect.execution) {
      if (op.kind !== 'damageModifier' && op.kind !== 'modifierRateChange') continue;
      for (const row of op.valueExpressions)
        for (const expression of row) {
          const slope =
            expression?.kind === 'inverseHpLinear'
              ? -expression.bonusAtZeroHpPermille
              : expression?.kind === 'hpRangeLinear'
                ? expression.valueAtMaximumHpPermille - expression.valueAtMinimumHpPermille
                : 0;
          const damageDirection =
            op.kind === 'damageModifier' &&
            [
              'defenseBuff',
              'cardResistance',
              'npResistance',
              'specialResistance',
              'damageCut',
            ].includes(op.modifier)
              ? -1
              : 1;
          if (slope)
            slopes.add(
              Math.sign(slope * damageDirection * (op.kind === 'damageModifier' ? op.sign : 1)),
            );
        }
    }
  // Opposing continuous factors can peak inside a threshold interval. Preserve the entire
  // legal finite initial domain; the ordinary candidate product cap remains unchanged.
  if (slopes.size > 1) return Array.from({ length: 1000 }, (_, index) => index + 1);
  const thresholds = new Set<number>();
  const visit = (c: ConditionExpression): void => {
    if (c.kind === 'quantity' && c.quantity === 'attackerHpPermille')
      for (const n of [c.value - 1, c.value, c.value + 1]) thresholds.add(n);
    else if (c.kind === 'all' || c.kind === 'any') c.expressions.forEach(visit);
    else if (c.kind === 'not') visit(c.expression);
  };
  conditions.forEach(visit);
  if (!thresholds.size) return [];
  const writers = sources.flatMap((source) =>
    source.effect.execution.filter(isHpOperation).map((operation) => ({ source, operation })),
  );
  if (!writers.length) return [1];
  // Transfer depends on other initial actor inputs. Keep every initial HP instead of
  // claiming a boundary computed with one donor value represents the whole product.
  if (
    writers.some(
      ({ operation }) =>
        operation.kind === 'resourceMutation' && operation.amount.kind === 'hpTransfer',
    )
  )
    return Array.from({ length: 1000 }, (_, index) => index + 1);
  const candidates = new Set([1, 1000]);
  let previous: string | null = null;
  for (let initial = 1; initial <= 1000; initial++) {
    let states: HpState[] = [{ actors: { attacker: seedHp(maximum, initial) }, receipts: [] }];
    const signatures: string[] = [];
    const signature = (state: HpState) => {
      const q = hpPermille(state.actors.attacker);
      return JSON.stringify([
        hpAlive(state.actors.attacker),
        ...[...thresholds].map((n) => (q === null ? 'missing' : q < n ? -1 : q > n ? 1 : 0)),
      ]);
    };
    signatures.push(signature(states[0]!));
    for (const { source, operation } of writers) {
      const next: HpState[] = [];
      for (const state of states) {
        if (source.effect.requirement.expression.kind !== 'always') next.push(state);
        const result = executeHpOperation({
          state,
          source,
          operation,
          values: {},
          actionId: 'boundary',
          valueSetIndex: source.valueSetIndex,
        });
        if (result.status !== 'applied')
          return Array.from({ length: 1000 }, (_, index) => index + 1);
        next.push({ ...result.state, receipts: [] });
      }
      states = [...new Map(next.map((state) => [JSON.stringify(state), state])).values()];
      if (states.length > 4096) throw new TypeError('hp_boundary_branch_limit');
      signatures.push(JSON.stringify(states.map(signature).sort()));
    }
    const key = JSON.stringify(signatures);
    if (previous !== null && previous !== key) {
      candidates.add(initial - 1);
      candidates.add(initial);
    }
    previous = key;
  }
  return [...candidates].sort((a, b) => a - b);
}
