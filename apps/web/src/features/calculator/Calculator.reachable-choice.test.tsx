// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { targetClassCandidates } from '@fgo-lab/calc-core';
import {
  calculateScenario,
  createCalculatorPortableRequest,
  createDefaultCalculatorScenario,
  createDefaultResolvedScenario,
  executePortableCalculation,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  type CalculationScenario,
} from '@fgo-lab/schema';
import { Calculator } from './Calculator';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../packages/test-fixtures/production-master/master.json',
      ),
      'utf8',
    ),
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

it('repairs a public ambiguous target result by selecting its attribute', () => {
  const servant = master.servants.find(({ id }) => id === '4000100')!;
  const initial = createDefaultResolvedScenario(master, undefined, servant);
  const ambiguous = calculateScenario(initial, master, versions);
  expect(ambiguous.status).toBe('executable');
  if (ambiguous.status !== 'executable') return;
  expect(ambiguous.result.status).toBe('inputRequired');

  const onScenarioChange = renderCalculator(initial);
  expect(screen.getByRole('alert').textContent).toContain('対象クラス・属性を指定し');
  fireEvent.change(screen.getAllByLabelText(/^属性相性/)[0]!, {
    target: { value: 'attribute:earth' },
  });
  const selected = onScenarioChange.mock.calls.at(-1)?.[0] as CalculationScenario;
  expect(selected.mode).toBe('resolved');
  if (selected.mode !== 'resolved') return;
  expect(selected.targetContext.attribute).toEqual({ kind: 'concrete', attribute: 'earth' });
  expect(calculateScenario(selected, master, versions).result.status).toBe('calculated');
  const saved = JSON.stringify(
    createCalculatorPortableRequest(selected, {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
    }),
  );
  const restored = portableCalculationRequestSchema.parse(JSON.parse(saved));
  expect(restored.scenario).toEqual(selected);
  const replay = executePortableCalculation(restored, master);
  expect(replay.status).toBe('executed');
  if (replay.status === 'executed') expect(replay.execution.result.status).toBe('calculated');

  cleanup();
  renderCalculator(selected);
  expect(screen.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeTruthy();
  expect(screen.getAllByLabelText<HTMLSelectElement>(/^属性相性/)[0]?.value).toBe(
    'attribute:earth',
  );
});

it('offers the target-family control when class and attribute leave NP damage ambiguous', () => {
  const servant = master.servants.find(({ id }) => id === '102900')!;
  const defaultScenario = createDefaultResolvedScenario(master, undefined, servant);
  const classId = targetClassCandidates(servant.classId, defaultScenario.targetContext.class)[0]!;
  const concrete = {
    ...defaultScenario,
    targetContext: {
      ...defaultScenario.targetContext,
      class: { kind: 'concrete' as const, classId },
      attribute: { kind: 'concrete' as const, attribute: 'earth' as const },
    },
  };
  expect(calculateScenario(concrete, master, versions).result.status).toBe('inputRequired');
  const onScenarioChange = renderCalculator(concrete);
  expect(screen.getByRole('alert').textContent).toContain(
    '対象特性の該当・非該当も選択してください',
  );
  const familyButton = screen.getByRole('button', { name: /対象特性 ビースト・特攻宝具/ });
  expect(familyButton.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(familyButton);
  const selected = onScenarioChange.mock.calls.at(-1)?.[0] as CalculationScenario;
  expect(selected.mode).toBe('resolved');
  if (selected.mode !== 'resolved') return;
  expect(selected.targetContext.families).toEqual([{ familyId: 'beast' }]);
  expect(calculateScenario(selected, master, versions).result.status).toBe('calculated');
  const saved = portableCalculationRequestSchema.parse(
    JSON.parse(
      JSON.stringify(
        createCalculatorPortableRequest(selected, {
          schemaVersion: SCHEMA_VERSION,
          masterDataVersion: master.version,
          engineVersion: ENGINE_VERSION,
        }),
      ),
    ),
  );
  expect(saved.scenario).toEqual(selected);
  const replay = executePortableCalculation(saved, master);
  expect(replay.status).toBe('executed');
  if (replay.status === 'executed') expect(replay.execution.result.status).toBe('calculated');

  cleanup();
  const onReset = renderCalculator(selected);
  const selectedButton = screen.getByRole('button', { name: /対象特性 ビースト・特攻宝具/ });
  expect(selectedButton.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(selectedButton);
  const reset = onReset.mock.calls.at(-1)?.[0] as CalculationScenario;
  expect(reset.mode).toBe('resolved');
  if (reset.mode !== 'resolved') return;
  expect(reset.targetContext.families).toEqual([]);
  expect(calculateScenario(reset, master, versions).result.status).toBe('inputRequired');

  cleanup();
  const onAbsent = renderCalculator(reset);
  fireEvent.change(screen.getByLabelText<HTMLSelectElement>('対象特性 ビースト'), {
    target: { value: 'absent' },
  });
  const absent = onAbsent.mock.calls.at(-1)?.[0] as CalculationScenario;
  expect(absent.mode).toBe('resolved');
  if (absent.mode !== 'resolved') return;
  expect(absent.targetContext.families).toEqual([]);
  expect(absent.targetContext.absentFamilies).toEqual([{ familyId: 'beast' }]);
  expect(calculateScenario(absent, master, versions).result.status).toBe('calculated');
  const savedAbsent = portableCalculationRequestSchema.parse(
    JSON.parse(
      JSON.stringify(
        createCalculatorPortableRequest(absent, {
          schemaVersion: SCHEMA_VERSION,
          masterDataVersion: master.version,
          engineVersion: ENGINE_VERSION,
        }),
      ),
    ),
  );
  expect(savedAbsent.scenario).toEqual(absent);
  const replayAbsent = executePortableCalculation(savedAbsent, master);
  expect(replayAbsent.status).toBe('executed');
  if (replayAbsent.status === 'executed')
    expect(replayAbsent.execution.result.status).toBe('calculated');
  cleanup();
  renderCalculator(absent);
  expect(screen.getByLabelText<HTMLSelectElement>('対象特性 ビースト').value).toBe('absent');
});
