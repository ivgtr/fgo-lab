import type { BattleOperation, ConditionExpression } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import type { RankingWorldCandidate } from './rankingWorldDomain';
import { compileRankingWorldObservationPlan } from './rankingWorldObservation';
import { quotientRankingWorldDomain } from './rankingWorldQuotient';

type PhysicalWorld = { initial: boolean; state: boolean; suppressed: boolean };

const combined: ConditionExpression = {
  kind: 'trait',
  scope: 'target',
  trait: 'oracleTrait',
  present: true,
};
const stateOnly: ConditionExpression = {
  kind: 'trait',
  scope: 'targetState',
  trait: 'oracleTrait',
  present: true,
};

function worlds(): RankingWorldCandidate[] {
  return Array.from({ length: 4 }, (_, mask) => ({
    key: `world:${mask}`,
    classId: 'saber' as const,
    attribute: 'man' as const,
    familyIds: [],
    traitFacts: [
      { scope: 'target' as const, trait: 'oracleTrait', present: (mask & 1) !== 0 },
      { scope: 'targetState' as const, trait: 'oracleTrait', present: (mask & 2) !== 0 },
    ],
  }));
}

function operation(kind: 'addTrait' | 'removeTrait' | 'suppressInitialTrait'): BattleOperation {
  return {
    kind,
    operationId: kind,
    order: 0,
    scope: kind === 'suppressInitialTrait' ? 'target' : 'targetState',
    trait: 'oracleTrait',
    condition: { kind: 'always' },
  } as BattleOperation;
}

// Deliberately independent of the planner's domain and observation implementation.
function bruteTrace(
  candidate: RankingWorldCandidate,
  operations: readonly BattleOperation[],
): string {
  const initial = candidate.traitFacts.find(({ scope }) => scope === 'target')!.present;
  const state = candidate.traitFacts.find(({ scope }) => scope === 'targetState')!.present;
  const world: PhysicalWorld = { initial, state, suppressed: false };
  for (const mutation of operations) {
    if (mutation.kind === 'addTrait') world.state = true;
    if (mutation.kind === 'removeTrait') world.state = false;
    if (mutation.kind === 'suppressInitialTrait') world.suppressed = true;
  }
  const combinedResult = world.state || (world.initial && !world.suppressed);
  return JSON.stringify({ combined: combinedResult, state: world.state });
}

describe('independent ranking world exhaustive oracle', () => {
  it.each([
    ['none', []],
    ['add', [operation('addTrait')]],
    ['remove', [operation('removeTrait')]],
    ['suppress', [operation('suppressInitialTrait')]],
    ['remove-then-add', [operation('removeTrait'), operation('addTrait')]],
  ] as const)('preserves the complete outcome set and maximum for %s', (_name, operations) => {
    const raw = worlds();
    const plan = compileRankingWorldObservationPlan(operations, [combined, stateOnly]);
    const representatives = quotientRankingWorldDomain(raw, plan).map(
      ({ representative }) => representative,
    );
    const outcomes = (candidates: readonly RankingWorldCandidate[]) =>
      new Set(candidates.map((candidate) => bruteTrace(candidate, operations)));
    const damage = (candidate: RankingWorldCandidate) => {
      const trace = JSON.parse(bruteTrace(candidate, operations)) as {
        combined: boolean;
        state: boolean;
      };
      return Number(trace.combined) * 100 + Number(trace.state) * 30;
    };

    expect(outcomes(representatives)).toEqual(outcomes(raw));
    expect(Math.max(...representatives.map(damage))).toBe(Math.max(...raw.map(damage)));
    expect(raw.some(({ key }) => key === 'world:0')).toBe(true);
  });
});
