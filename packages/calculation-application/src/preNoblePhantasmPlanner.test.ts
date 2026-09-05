import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type CanonicalNpResourceSemantics } from '@fgo-lab/master-data';
import {
  preNoblePhantasmSemanticStateKey,
  planPreNoblePhantasmCandidates,
} from './preNoblePhantasmPlanner';

describe('pre-NP planner cache identity', () => {
  it('does not reuse a plan across canonical resource semantics', () => {
    const master = masterSnapshotSchema.parse(fixture);
    const servant = master.servants[0]!;
    const expanded = {
      ...master.npResourceSemantics,
      capacityByNpLevel: [20_000, 20_000, 20_000, 20_000, 30_000],
    } as unknown as CanonicalNpResourceSemantics;

    const canonical = planPreNoblePhantasmCandidates(
      servant,
      master.npResourceSemantics,
      1,
      1,
      10_000,
    );
    const changed = planPreNoblePhantasmCandidates(servant, expanded, 1, 1, 10_000);

    expect(changed).not.toBe(canonical);
    expect(canonical.candidates[0]?.terminalState.npResource.capacity).toBe(10_000);
    expect(changed.candidates[0]?.terminalState.npResource.capacity).toBe(20_000);
  });

  it('does not reuse a plan across selected NP levels', () => {
    const master = masterSnapshotSchema.parse(fixture);
    const servant = master.servants[0]!;
    const np1 = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1);
    const np2 = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 2, 1);

    expect(np2).not.toBe(np1);
    expect(np1.candidates[0]?.terminalState.npResource.npLevel).toBe(1);
    expect(np2.candidates[0]?.terminalState.npResource.npLevel).toBe(2);
  });
});

// Counts are state, even when their boolean presence and action history agree.
it('keeps initial stack counts in preparation and semantic plan identity', async () => {
  const { master, servant, source } = await import('./stackQuantityFixture');
  const one = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1, 10_000, {
    [source.key]: 1,
  });
  const maximum = planPreNoblePhantasmCandidates(
    servant,
    master.npResourceSemantics,
    1,
    1,
    10_000,
    { [source.key]: 4 },
  );
  const a = one.candidates[0]!.terminalState;
  const b = maximum.candidates[0]!.terminalState;
  expect(a.stateTraits).toEqual(b.stateTraits);
  expect(b.stackCounts.attackerState[source.quantitySource.trait]).toBe(4);
  expect(preNoblePhantasmSemanticStateKey(a)).not.toBe(preNoblePhantasmSemanticStateKey(b));
});
