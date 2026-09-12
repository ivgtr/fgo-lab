import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet } from '@fgo-lab/schema';
import type { PopulationCountSelector } from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createConditionState } from './conditionState';
import { readPopulationCount, type PopulationEvent } from './populationCounts';

const selector: PopulationCountSelector = {
  scope: 'allActors',
  counting: 'actors',
  basis: 'actorTraits',
  traits: ['a', 'b'],
  includePassive: true,
};
const activation = analyzeActivationFactSet([]);
if (activation.status !== 'valid') throw new Error('activation');
const variant =
  masterSnapshotSchema.parse(fixture).servants[0]!.noblePhantasmVariantGroups[0]!.variants[0]!;
function facts() {
  return createConditionState(
    {
      cardType: 'buster',
      attackerStateTraits: [],
      targetStateTraits: [],
      fieldTraits: [],
      target: { traits: [] },
      attackerHpPermille: 1000,
      targetRarity: null,
      battlePointPhase: null,
    },
    variant,
    ['a', 'b'],
    {},
    [],
    [],
    activation.status === 'valid'
      ? activation.factSet
      : (() => {
          throw new Error('activation');
        })(),
  );
}
const source = { origin: 'attacker' as const, sourceInstanceId: 'self' };
describe('live actor population count', () => {
  it('distinguishes matching actors from individualities and excludes the recipient independently of the gain route', () => {
    const input = {
      selector,
      inputKey: 'initial',
      values: { 'population:allies:additional': 2, initial: 2 },
      facts: facts(),
      events: [],
    };
    expect(readPopulationCount(input)).toBe(3);
    expect(
      readPopulationCount({ ...input, selector: { ...selector, counting: 'individualities' } }),
    ).toBe(4);
    expect(readPopulationCount({ ...input, selector: { ...selector, scope: 'otherActors' } })).toBe(
      2,
    );
  });
  it('updates cohort counts after a full grant, while refusing unknown partial overlap', () => {
    const event: PopulationEvent = {
      source,
      operation: {
        kind: 'populationMutation',
        basis: 'actorTraits',
        scope: 'otherActors',
        mutation: 'grant',
        traits: ['a'],
        includePassive: false,
      },
    };
    const input = {
      selector,
      inputKey: 'initial',
      values: { 'population:allies:additional': 2, 'population:enemies:additional': 1, initial: 0 },
      facts: facts(),
      events: [event],
    };
    expect(readPopulationCount(input)).toBe(4);
    expect(
      readPopulationCount({
        ...input,
        events: [{ ...event, operation: { ...event.operation, scope: 'allies' } }],
      }),
    ).toBeNull();
    expect(
      readPopulationCount({
        ...input,
        selector: { ...selector, counting: 'individualities' },
        events: [{ ...event, operation: { ...event.operation, scope: 'allies' } }],
      }),
    ).toBe(4);
  });
  it('suppresses only initial individuality and retains a later state grant', () => {
    const current = facts();
    current.initialTraitSuppressions.attacker = new Set(['a', 'b']);
    current.traitCounts.attackerState = { a: 2 };
    expect(
      readPopulationCount({
        selector: { ...selector, scope: 'recipient', counting: 'individualities' },
        inputKey: 'unused',
        values: {},
        facts: current,
        events: [],
      }),
    ).toBe(2);
  });
  it('counts enemy-wide buff grants once per target and clears them on removal', () => {
    const event: PopulationEvent = {
      source,
      operation: {
        kind: 'populationMutation',
        basis: 'buffInstances',
        scope: 'enemies',
        mutation: 'grant',
        traits: ['a'],
        includePassive: false,
      },
    };
    const input = {
      selector: {
        ...selector,
        scope: 'enemies' as const,
        basis: 'buffInstances' as const,
        counting: 'individualities' as const,
      },
      inputKey: 'initial',
      values: { 'population:enemies:additional': 2, initial: 1 },
      facts: facts(),
      events: [event, event],
    };
    expect(readPopulationCount(input)).toBe(7);
    expect(
      readPopulationCount({
        ...input,
        events: [
          ...input.events,
          { ...event, operation: { ...event.operation, mutation: 'remove' } },
        ],
      }),
    ).toBe(0);
    expect(
      readPopulationCount({
        ...input,
        events: [{ ...event, operation: { ...event.operation, mutation: 'unsupported' } }],
      }),
    ).toBeNull();
  });
});
