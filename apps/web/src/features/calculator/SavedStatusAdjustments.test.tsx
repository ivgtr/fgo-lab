// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createDefaultResolvedScenario } from '@fgo-lab/calculation-application';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { SavedStatusAdjustments, resetSavedStatusAdjustments } from './SavedStatusAdjustments';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(fixture);

describe('saved status adjustments', () => {
  it('shows a nonzero saved adjustment and resets only its canonical input', () => {
    const scenario = {
      ...createDefaultResolvedScenario(master, undefined),
      canonicalInputValues: {
        'source:attacker:1:2:3:statusApplicationAdjustment': {
          kind: 'integer' as const,
          value: 120,
        },
        'source:attacker:1:2:3:otherInput': { kind: 'integer' as const, value: 4 },
      },
    };
    const onReset = vi.fn();
    const { getByRole } = render(<SavedStatusAdjustments scenario={scenario} onReset={onReset} />);

    expect(getByRole('status').textContent).toContain('+120‰');
    fireEvent.click(getByRole('button', { name: '成功率補正を既定値に戻す' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(resetSavedStatusAdjustments(scenario).canonicalInputValues).toEqual({
      'source:attacker:1:2:3:otherInput': { kind: 'integer', value: 4 },
    });
  });

  it('does not show a notice for the default adjustment', () => {
    const scenario = {
      ...createDefaultResolvedScenario(master, undefined),
      canonicalInputValues: {
        'source:attacker:1:2:3:statusApplicationAdjustment': {
          kind: 'integer' as const,
          value: 0,
        },
      },
    };
    const { queryByRole } = render(
      <SavedStatusAdjustments scenario={scenario} onReset={vi.fn()} />,
    );
    expect(queryByRole('status')).toBeNull();
  });
});
