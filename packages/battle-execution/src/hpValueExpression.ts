import type { ModifierValueExpression } from '@fgo-lab/master-data';

type HpValueExpression = Extract<
  ModifierValueExpression,
  { kind: 'inverseHpLinear' | 'hpRangeLinear' }
>;
export function evaluateHpValueExpression(expression: HpValueExpression, hp: number): number {
  if (expression.kind === 'inverseHpLinear')
    return (
      expression.basePermille +
      Math.trunc((expression.bonusAtZeroHpPermille * (1_000 - hp)) / 1_000)
    );
  const clampedHp = Math.min(
    expression.maximumHpPermille,
    Math.max(expression.minimumHpPermille, hp),
  );
  return (
    expression.basePermille +
    expression.valueAtMinimumHpPermille +
    Math.trunc(
      ((expression.valueAtMaximumHpPermille - expression.valueAtMinimumHpPermille) *
        (clampedHp - expression.minimumHpPermille)) /
        (expression.maximumHpPermille - expression.minimumHpPermille),
    )
  );
}
