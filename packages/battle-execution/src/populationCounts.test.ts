import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet } from '@fgo-lab/schema';
import type { PopulationCountSelector } from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createConditionState } from './conditionState';
import { assertExternalInitialTrait, commitTraitFact } from './traitFactLayers';
import {
  populationInputIssue,
  readPopulationCount,
  type PopulationEvent,
} from './populationCounts';

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
  const state = createConditionState(
    {
      cardType: 'buster',
      attackerStateTraits: [],
      targetStateTraits: [],
      fieldTraits: [],
      stackStateCounts: { attackerState: { a: 0, b: 0 }, targetState: { a: 0, b: 0 }, field: {} },
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
  const proof = { kind: 'selectedInitialResource' as const, clock: state.conditionReadClock };
  for (const trait of selector.traits)
    state.traitFactLayers = assertExternalInitialTrait(
      state.traitFactLayers,
      'target',
      trait,
      false,
      proof,
    );

  return state;
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
    current.traitFactLayers = commitTraitFact(
      current.traitFactLayers,
      'attackerState',
      'a',
      true,
      2,
      { kind: 'selectedInitialResource', clock: current.conditionReadClock },
      [{ kind: 'selectedInitialResource', clock: current.conditionReadClock }],
    );

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

  it('applies includePassive only to buff-instance reads and keeps legality fail-closed', () => {
    const passiveGrant: PopulationEvent = {
      source,
      operation: {
        kind: 'populationMutation',
        basis: 'buffInstances',
        scope: 'enemies',
        mutation: 'grant',
        traits: ['a'],
        includePassive: true,
      },
    };
    const input = {
      selector: {
        ...selector,
        scope: 'enemies' as const,
        basis: 'buffInstances' as const,
        counting: 'individualities' as const,
        includePassive: false,
      },
      inputKey: 'initial',
      values: { 'population:enemies:additional': 2, initial: 1 },
      facts: facts(),
      events: [passiveGrant],
    };
    expect(readPopulationCount(input)).toBe(1);
    expect(
      readPopulationCount({
        ...input,
        selector: { ...input.selector, includePassive: true },
      }),
    ).toBe(4);

    const definition = {
      kind: 'populationCount' as const,
      selector,
      key: 'initial',
      owner: 'field' as const,
      label: 'count',
      description: 'count',
      minimum: 0,
      maximum: 4,
      step: 1,
      defaultValue: 0,
      defaultReason: 'none',
    };
    expect(populationInputIssue([definition], { initial: 1 })).toBe(definition);
    expect(
      populationInputIssue([definition], {
        'population:allies:additional': 1,
        initial: 1,
      }),
    ).toBe(null);
    expect(
      populationInputIssue([definition], {
        'population:allies:additional': 1,
        'population:enemies:additional': 1,
        initial: 3,
      }),
    ).toBe(definition);
  });

  it('refuses a matching mutation for an in-battle read', () => {
    const inBattleSelector: PopulationCountSelector = {
      scope: 'allActors',
      counting: 'actors',
      basis: 'inBattle',
      traits: ['a', 'b'],
      includePassive: true,
    };
    const event: PopulationEvent = {
      source,
      operation: {
        kind: 'populationMutation',
        basis: 'actorTraits',
        scope: 'allActors',
        mutation: 'grant',
        traits: ['a'],
        includePassive: false,
      },
    };
    expect(
      readPopulationCount({
        selector: inBattleSelector,
        inputKey: 'unused',
        values: { 'population:allies:additional': 1 },
        facts: facts(),
        events: [event],
      }),
    ).toBeNull();
  });
});
