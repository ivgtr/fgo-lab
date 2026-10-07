import { expect, it } from 'vitest';
import type { CountedBuffInstance } from './buffInstances';
import { applyBuffInstanceChanges, changedBuffInstances } from './preparationPhysicalTransition';

const passive: CountedBuffInstance = {
  identity: 'passive:marker',
  actor: 'attacker',
  traits: ['shore'],
  lifetime: 'constant',
  count: 1,
};
const ce: CountedBuffInstance = {
  identity: 'ce:marker',
  actor: 'attacker',
  traits: ['imaginary-space'],
  lifetime: 'constant',
  count: 1,
};

it('replays native marker additions without importing earlier native instances', () => {
  const ceTransition = changedBuffInstances([passive], [passive, ce]);
  const passiveTransition = changedBuffInstances([], [passive]);
  const afterCe = applyBuffInstanceChanges([], ceTransition);
  expect(afterCe.map((instance) => instance.identity)).toEqual(['ce:marker']);
  expect(applyBuffInstanceChanges(afterCe, passiveTransition)).toEqual([ce, passive]);
});

it('updates known absence and does not resurrect a skipped earlier marker', () => {
  const removed = { ...passive, count: 0 };
  const removal = changedBuffInstances([passive, ce], [removed, ce]);
  expect(applyBuffInstanceChanges([ce, passive], removal)).toEqual([ce, removed]);
  expect(applyBuffInstanceChanges([ce], removal)).toEqual([ce]);
});
