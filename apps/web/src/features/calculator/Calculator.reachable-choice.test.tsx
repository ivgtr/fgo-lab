// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateScenario,
  createCalculatorPortableRequest,
  createDefaultCalculatorScenario,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
} from '@fgo-lab/schema';
import { Calculator } from './Calculator';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../public/master/master.json'), 'utf8'),
  ),
);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;

function renderCalculator(scenario: CalculationScenario, onScenarioChange = vi.fn()) {
  const calculation = requireExecutableCalculation(calculateScenario(scenario, master, versions));
  render(
    <Calculator
      master={master}
      resolvedInput={calculation.input}
      scenarioInput={calculation.input}
      resolvedEffects={calculation.effects}
      appliedPreparationActions={calculation.appliedPreparationActions}
      effectControls={calculation.effectControls}
      effectWarnings={calculation.effectWarnings}
      effectInputs={calculation.effectInputs}
      activationRequirements={calculation.activationRequirements}
      result={calculation.result}
      request={createCalculatorPortableRequest(scenario, {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: master.version,
        engineVersion: ENGINE_VERSION,
      })}
      scenario={scenario}
      servants={master.servants}
      builds={{}}
      craftEssenceCopies={[]}
      craftEssences={master.craftEssences}
      supportTemplates={[]}
      history={[]}
      selectedSupport={undefined}
      onScenarioChange={onScenarioChange}
      onSupportSelect={vi.fn()}
      onSupportSave={vi.fn()}
      onFinalize={vi.fn()}
      onHistorySelect={vi.fn()}
      onRegenerateHistory={vi.fn()}
      onResetPortableRequest={vi.fn()}
    />,
  );
  return onScenarioChange;
}

it('shows the selected preparation choice and sends its own command', () => {
  const servant = master.servants.find(({ id }) => id === '2301100')!;
  const initial = createDefaultCalculatorScenario(master, undefined, servant);
  const onScenarioChange = renderCalculator(initial);
  expect(screen.getAllByRole('radio', { name: /月下/ })[0]?.getAttribute('aria-checked')).toBe(
    'false',
  );
  fireEvent.click(screen.getAllByRole('radio', { name: /月下/ })[0]!);
  const selected = onScenarioChange.mock.calls.at(-1)?.[0] as CalculationScenario;
  expect(selected.mode).toBe('resolved');
  if (selected.mode !== 'resolved') return;
  expect(selected.preNoblePhantasmPlan).toContainEqual(
    expect.objectContaining({
      kind: 'useSkillSlot',
      slot: 2,
      choice: { groupKey: 'player-choice:1', candidateKey: '0' },
    }),
  );
  expect(selected.effectDecisions.length).toBeGreaterThan(0);
  expect(
    selected.effectDecisions.every(
      ({ operationEnabled, conditionSatisfaction }) =>
        !operationEnabled && conditionSatisfaction === 'evaluate',
    ),
  ).toBe(true);
  expect(selected.worldFactAssertions).toEqual([]);
  cleanup();
  renderCalculator(selected);
  expect(screen.getAllByRole('radio', { name: /月下/ })[0]?.getAttribute('aria-checked')).toBe(
    'true',
  );
  expect(screen.getAllByRole('radio', { name: /日輪/ })[0]?.getAttribute('aria-checked')).toBe(
    'false',
  );
});
