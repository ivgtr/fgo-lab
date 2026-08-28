import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { ActivationFact } from '@fgo-lab/schema';
import {
  analyzeActivationCondition,
  type ActivationRequirementOwner,
} from '@fgo-lab/battle-execution';
import { applyActivationFactSelection } from './activationContext';
import { createDefaultResolvedScenario } from './scenario';

const master = masterSnapshotSchema.parse(fixture);
const source = { origin: 'attacker' as const, sourceInstanceId: 'self', skillId: 'skill' };

function owner(decisionKey: string, fact: ActivationFact): ActivationRequirementOwner {
  return {
    operationId: `${decisionKey}:operation`,
    decisionKey,
    enabledByDefault: false,
    sourceEnabled: true,
    decisionPlan: { activation: 'user', condition: 'userMayAssume' },
    activation: { kind: 'sourceDefault' },
    condition: fact,
    facts: [fact],
  };
}

describe('activation fact materialization', () => {
  it('materializes the only activation-owned branch of a mixed OR condition', () => {
    const analysis = analyzeActivationCondition({
      kind: 'any',
      expressions: [
        { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: true },
        { kind: 'operationTrigger', source, position: 1 },
      ],
    });
    expect(analysis).toMatchObject({
      status: 'supported',
      materialization: {
        kind: 'deterministic',
        facts: [{ kind: 'operationTrigger', source, position: 1 }],
      },
    });
  });

  it('rejects an OR whose activation selection is not unique', () => {
    expect(
      analyzeActivationCondition({
        kind: 'any',
        expressions: [
          { kind: 'choice', source, family: 'mode', candidate: 'attack' },
          { kind: 'choice', source, family: 'mode', candidate: 'npDamage' },
        ],
      }),
    ).toMatchObject({ status: 'supported', materialization: { kind: 'ambiguous' } });
  });

  it('keeps a shared fact until the final selected operation stops referencing it', () => {
    const fact = { kind: 'choice' as const, source, family: 'mode', candidate: '2' };
    const base = createDefaultResolvedScenario(master, undefined);
    const owners = [owner('effect:attack', fact), owner('effect:npDamage', fact)];
    const both = {
      ...base,
      effectDecisions: [
        {
          decisionKey: 'effect:attack',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
        {
          decisionKey: 'effect:npDamage',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
    };
    const selected = applyActivationFactSelection(both, [fact], true, owners);
    const one = {
      ...selected,
      effectDecisions: selected.effectDecisions.map((decision) =>
        decision.decisionKey === 'effect:attack'
          ? { ...decision, operationEnabled: false }
          : decision,
      ),
    };
    expect(applyActivationFactSelection(one, [fact], false, owners).activationFacts).toEqual([
      fact,
    ]);
    const none = {
      ...one,
      effectDecisions: one.effectDecisions.map((decision) => ({
        ...decision,
        operationEnabled: false,
      })),
    };
    expect(applyActivationFactSelection(none, [fact], false, owners).activationFacts).toEqual([]);
  });

  it('retains a fact referenced only by a selected linked hidden operation', () => {
    const fact = { kind: 'choice' as const, source, family: 'mode', candidate: 'hidden' };
    const base = createDefaultResolvedScenario(master, undefined);
    const hiddenOwner: ActivationRequirementOwner = {
      ...owner('hidden:mutation', fact),
      decisionKey: null,
      activation: {
        kind: 'linkedDecisions',
        links: [
          {
            decisionKey: 'effect:terminal',
            reason: 'traitPrerequisite',
            selection: 'operationEnabled',
          },
        ],
      },
    };
    const scenario = {
      ...base,
      effectDecisions: [
        {
          decisionKey: 'effect:terminal',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
    };
    expect(
      applyActivationFactSelection(scenario, [fact], true, [hiddenOwner]).activationFacts,
    ).toEqual([fact]);
  });

  it('does not synthesize a choice for a hidden operation that only follows a satisfied consumer', () => {
    const fact = { kind: 'choice' as const, source, family: 'mode', candidate: 'moon' };
    const base = createDefaultResolvedScenario(master, undefined);
    const hiddenOwner: ActivationRequirementOwner = {
      ...owner('hidden:mutation', fact),
      decisionKey: null,
      activation: {
        kind: 'linkedDecisions',
        links: [
          {
            decisionKey: 'effect:consumer',
            reason: 'traitPrerequisite',
            selection: 'conditionSatisfied',
          },
        ],
      },
    };
    const scenario = {
      ...base,
      effectDecisions: [
        {
          decisionKey: 'effect:consumer',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
    };
    expect(
      applyActivationFactSelection(scenario, [fact], false, [hiddenOwner]).activationFacts,
    ).toEqual([]);
  });
});
