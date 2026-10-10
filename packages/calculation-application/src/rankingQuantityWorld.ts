import type { ConditionExpression } from '@fgo-lab/battle-execution';
import { QUANTITY_FACT_DOMAINS } from '@fgo-lab/schema';
import type { EffectControlViewModel } from './effectControls';
import { finiteSemanticProduct } from './finiteSemanticProduct';
import type { ResolvedScenario } from './rankingPolicy';

export const MAX_RANKING_QUANTITY_CANDIDATES = 4_096;

type Quantity = Extract<ConditionExpression, { kind: 'quantity' }>['quantity'];

export interface RankingQuantityCandidate {
  key: string;
  values: Readonly<Partial<Record<Quantity, number>>>;
}

function leaves(
  condition: ConditionExpression | null,
): Extract<ConditionExpression, { kind: 'quantity' }>[] {
  if (!condition) return [];
  if (condition.kind === 'quantity') return condition.subjectId === undefined ? [condition] : [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(leaves);
  return condition.kind === 'not' ? leaves(condition.expression) : [];
}

function boundaryValues(
  condition: Extract<ConditionExpression, { kind: 'quantity' }>,
): readonly number[] {
  const { min, max } = QUANTITY_FACT_DOMAINS[condition.quantity];
  return [condition.value - 1, condition.value, condition.value + 1].filter(
    (value) => value >= min && value <= max,
  );
}

export function createRankingQuantityCandidates(
  controls: readonly EffectControlViewModel[],
  active: boolean,
): readonly RankingQuantityCandidate[] {
  return createRankingQuantityCandidatesForConditions(
    controls.map((control) => control.projection.explanation.condition),
    active,
  );
}

export function createRankingQuantityCandidatesForConditions(
  conditions: readonly (ConditionExpression | null)[],
  active: boolean,
  initialHpBoundaries: readonly number[] = [],
): readonly RankingQuantityCandidate[] {
  const baseline: RankingQuantityCandidate = { key: 'quantity:baseline', values: {} };
  if (!active) return [baseline];
  const byQuantity = new Map<Quantity, Set<number>>();
  for (const condition of conditions.flatMap(leaves)) {
    const domain = QUANTITY_FACT_DOMAINS[condition.quantity];
    const values =
      byQuantity.get(condition.quantity) ??
      new Set<number>([
        domain.min,
        ...(condition.quantity === 'attackerHpPermille' ? [1] : []),
        domain.max,
      ]);
    for (const value of boundaryValues(condition)) values.add(value);
    if (condition.quantity === 'attackerHpPermille')
      for (const value of initialHpBoundaries) values.add(value);
    byQuantity.set(condition.quantity, values);
  }
  if (byQuantity.size === 0) return [baseline];
  const combinations = finiteSemanticProduct(
    [...byQuantity].map(([key, values]) => ({
      key,
      values: [...values].sort((left, right) => left - right),
    })),
    MAX_RANKING_QUANTITY_CANDIDATES,
    'ranking_quantity_candidate_limit',
  ).candidates;
  const candidates = Array.from(combinations).map((values) => ({
    key: `quantity:${JSON.stringify(values)}`,
    values,
  }));
  return [
    ...new Map([baseline, ...candidates].map((candidate) => [candidate.key, candidate])).values(),
  ];
}

export function materializeRankingQuantity(
  scenario: ResolvedScenario,
  candidate: RankingQuantityCandidate,
): ResolvedScenario {
  const { attackerHpPermille, battlePointPhase, targetRarity } = candidate.values;
  return {
    ...scenario,
    attackerHpPermille: attackerHpPermille ?? scenario.attackerHpPermille,
    battleState: {
      ...scenario.battleState,
      battlePointPhase: battlePointPhase ?? scenario.battleState.battlePointPhase,
    },
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) => !decisionKey.startsWith('ranking:quantity:'),
      ),
      ...(targetRarity === undefined
        ? []
        : [
            {
              decisionKey: 'ranking:quantity:targetRarity',
              fact: {
                kind: 'quantity' as const,
                quantity: 'targetRarity' as const,
                value: targetRarity,
              },
            },
          ]),
    ],
  };
}
