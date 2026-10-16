import type { CalculationScenario } from '@fgo-lab/schema';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

function isStatusAdjustmentKey(key: string): boolean {
  return key.endsWith(':statusApplicationAdjustment');
}

export function resetSavedStatusAdjustments(scenario: ResolvedScenario): ResolvedScenario {
  return {
    ...scenario,
    canonicalInputValues: Object.fromEntries(
      Object.entries(scenario.canonicalInputValues).filter(([key]) => !isStatusAdjustmentKey(key)),
    ),
  };
}

export function SavedStatusAdjustments({
  scenario,
  onReset,
}: {
  scenario: ResolvedScenario;
  onReset: () => void;
}) {
  const values = Object.entries(scenario.canonicalInputValues)
    .filter(([key, input]) => isStatusAdjustmentKey(key) && input.value !== 0)
    .map(([, input]) => `${input.value > 0 ? '+' : ''}${input.value}‰`);
  if (values.length === 0) return null;

  return (
    <div className="notice" role="status">
      <p>保存済みの成功率補正（{values.join('、')}）が計算に適用されています。</p>
      <button type="button" onClick={onReset}>
        成功率補正を既定値に戻す
      </button>
    </div>
  );
}
