import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet, type ActivationFact } from '@fgo-lab/schema';
import { analyzeActivationCondition, evaluateActivationRequirement } from './activationCondition';

const source = {
  origin: 'attacker' as const,
  sourceInstanceId: 'attacker:self',
  skillId: 'skill:1',
};
const choice: ActivationFact = { kind: 'choice', source, family: 'mode', candidate: 'attack' };
const trigger: ActivationFact = { kind: 'operationTrigger', source, position: 2 };
const field = {
  kind: 'trait' as const,
  scope: 'field' as const,
  trait: 'fieldSunlight',
  present: true,
};

function factSet(facts: readonly ActivationFact[]) {
  const result = analyzeActivationFactSet(facts);
  if (result.status !== 'valid') throw new Error('expected valid fact set');
  return result.factSet;
}

describe('canonical activation condition analysis', () => {
  it('reports no activation materialization for an activation-free condition', () => {
    expect(analyzeActivationCondition(field)).toEqual({
      status: 'supported',
      atoms: [],
      materialization: { kind: 'none' },
    });
  });

  it('materializes one atom and every atom in an all-expression', () => {
    expect(analyzeActivationCondition(choice)).toMatchObject({
      status: 'supported',
      materialization: { kind: 'deterministic', facts: [choice] },
    });
    expect(
      analyzeActivationCondition({ kind: 'all', expressions: [choice, field, trigger] }),
    ).toMatchObject({
      status: 'supported',
      atoms: [choice, trigger],
      materialization: { kind: 'deterministic', facts: [choice, trigger] },
    });
  });

  it('materializes the only activation-bearing branch of a mixed any-expression', () => {
    expect(
      analyzeActivationCondition({ kind: 'any', expressions: [field, trigger] }),
    ).toMatchObject({
      status: 'supported',
      materialization: { kind: 'deterministic', facts: [trigger] },
    });
  });

  it('marks multiple activation-bearing any branches as ambiguous', () => {
    expect(
      analyzeActivationCondition({ kind: 'any', expressions: [choice, trigger] }),
    ).toMatchObject({ status: 'supported', materialization: { kind: 'ambiguous' } });
  });

  it('rejects activation requirements below not', () => {
    expect(analyzeActivationCondition({ kind: 'not', expression: choice })).toEqual({
      status: 'unsupported',
      reason: 'negatedActivationRequirement',
    });
  });

  it('uses the same rules through nested all and any expressions', () => {
    expect(
      analyzeActivationCondition({
        kind: 'all',
        expressions: [field, { kind: 'any', expressions: [field, trigger] }, choice],
      }),
    ).toMatchObject({
      status: 'supported',
      atoms: [trigger, choice],
      materialization: { kind: 'deterministic', facts: [trigger, choice] },
    });
  });

  it('distinguishes a different selected choice from no selection', () => {
    const sibling = { ...choice, candidate: 'npDamage' };
    expect(evaluateActivationRequirement(choice, factSet([sibling]))).toBe(false);
    expect(evaluateActivationRequirement(choice, factSet([]))).toBeNull();
  });
});
