import type { ConditionExpression } from './contracts';

/** A structural search must retain both unresolved preparation outcomes. These branches are never execution proof. */
export class UnresolvedPreparationPlanningRead extends Error {
  constructor(readonly key: string) {
    super('unresolved_structural_preparation_read');
  }
}
export function projectPlanningHpCondition(
  condition: ConditionExpression,
  clock: string,
  choices: ReadonlyMap<string, boolean>,
): ConditionExpression {
  if (
    condition.kind === 'quantity' &&
    condition.quantity === 'attackerHpPermille' &&
    condition.subjectId === undefined
  ) {
    const key = JSON.stringify([clock, condition]);
    const outcome = choices.get(key);
    if (outcome === undefined) throw new UnresolvedPreparationPlanningRead(key);
    return outcome ? { kind: 'always' } : { kind: 'not', expression: { kind: 'always' } };
  }
  if (condition.kind === 'all' || condition.kind === 'any')
    return {
      ...condition,
      expressions: condition.expressions.map((child) =>
        projectPlanningHpCondition(child, clock, choices),
      ),
    };
  if (condition.kind === 'not')
    return {
      ...condition,
      expression: projectPlanningHpCondition(condition.expression, clock, choices),
    };
  return condition;
}
