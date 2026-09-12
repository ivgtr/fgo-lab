import { describe, it, expect } from 'vitest';
import { applyPopulationFunction, type PopulationFunction } from './populationFunctions';
import type { PopulationEvent } from './populationCounts';
const keys = ['a', 'b', 'c'] as [string, string, string];
const presence = ['p', 'q', 'r'] as [string, string, string];
const remove = (position: number): PopulationFunction => ({
  kind: 'populationFunction',
  scope: 'enemies',
  position,
  action: { kind: 'removeOne', trait: 'beneficial', inputKeys: keys },
});
const grant = (position: number, condition = false): PopulationFunction => ({
  kind: 'populationFunction',
  scope: 'enemies',
  position,
  action: {
    kind: 'grant',
    traits: [condition ? 'counter' : 'marker'],
    previousSuccess: !condition,
    condition: condition ? { trait: 'marker', inputKeys: presence } : null,
  },
});
const source = { origin: 'attacker' as const, sourceInstanceId: 'self' };
function execute(
  values: Record<string, number>,
  steps = [remove(0), grant(1), remove(2), grant(3), grant(4, true)],
) {
  const events: PopulationEvent[] = [];
  for (const operation of steps) {
    const result = applyPopulationFunction(operation, events, values, 'action');
    events.push({
      operation: {
        kind: 'populationMutation',
        mutation: 'grant',
        scope: 'enemies',
        basis: 'buffInstances',
        traits: operation.action.kind === 'grant' ? operation.action.traits : [],
        includePassive: false,
      },
      source,
      affectedCount: result.granted.reduce((a, b) => a + b, 0),
      targetState: result.state,
    });
  }
  return events;
}
describe('target-specific removal and marker results', () => {
  it('keeps the 0/1/2-buff enemies distinct through both removals and counts each marked actor once', () => {
    const events = execute({ 'population:enemies:additional': 2, a: 0, b: 1, c: 2 });
    expect(events.map((e) => e.targetState!.succeeded)).toEqual([
      [false, true, true],
      [false, true, true],
      [false, false, true],
      [false, false, true],
      [false, true, true],
    ]);
    expect(events[4]!.affectedCount).toBe(2);
    expect(events[4]!.targetState!.traits.map((t) => t.counter ?? 0)).toEqual([0, 1, 1]);
  });
  it('matches an independent exhaustive oracle for initial buffs and marker presence', () => {
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        for (let c = 0; c < 3; c++)
          for (let mask = 0; mask < 8; mask++) {
            const before = {
              a,
              b,
              c,
              p: mask & 1,
              q: (mask >> 1) & 1,
              r: (mask >> 2) & 1,
              'population:enemies:additional': 2,
            };
            const events = execute(before);
            expect(events[4]!.affectedCount).toBe(
              [a, b, c].filter((n, i) => n > 0 || (mask & (1 << i)) !== 0).length,
            );
            expect(before).toEqual({
              a,
              b,
              c,
              p: mask & 1,
              q: (mask >> 1) & 1,
              r: (mask >> 2) & 1,
              'population:enemies:additional': 2,
            });
          }
  });
  it('requires the immediate previous function in the same action, and ignores absent enemies', () => {
    const events = execute({ a: 1, b: 2, c: 2 }, [remove(0), grant(2)]);
    expect(events[1]!.affectedCount).toBe(0);
    expect(events[0]!.targetState!.succeeded).toEqual([true]);
    expect(
      applyPopulationFunction(grant(1), [events[0]!], { a: 1 }, 'different-action').granted,
    ).toEqual([0]);
  });
});
