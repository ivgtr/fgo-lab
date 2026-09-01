// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickValuePresets } from './QuickValuePresets';

afterEach(cleanup);

describe('calculator quick value commands', () => {
  it('dispatches an explicit preset without changing sibling inputs', () => {
    const onChange = vi.fn();
    const view = render(
      <QuickValuePresets
        label="サーヴァントLvのクイック選択"
        value={90}
        controls={[
          { kind: 'preset', label: '100', value: 100 },
          { kind: 'preset', label: '120', value: 120 },
        ]}
        resetValue={90}
        onChange={onChange}
      />,
    );

    fireEvent.click(view.getByRole('button', { name: '120' }));
    // E2E-A029-LEVEL
    expect(onChange).toHaveBeenCalledWith(120);
    expect((view.getByRole('button', { name: 'リセット' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('dispatches bounded Fou increments and the canonical reset value', () => {
    const onChange = vi.fn();
    const view = render(
      <QuickValuePresets
        label="ATKフォウのクイック選択"
        value={2_000}
        controls={[{ kind: 'action', label: '+1,000', value: 3_000 }]}
        resetValue={0}
        onChange={onChange}
      />,
    );

    fireEvent.click(view.getByRole('button', { name: '+1,000' }));
    fireEvent.click(view.getByRole('button', { name: 'リセット' }));
    // E2E-A028-FOU
    expect(onChange.mock.calls).toEqual([[3_000], [0]]);
  });

  it('does not expose a disabled increment action as a pressed preset', () => {
    const view = render(
      <QuickValuePresets
        label="ATKフォウのクイック選択"
        value={3_000}
        controls={[{ kind: 'action', label: '+1,000', value: 3_000, disabled: true }]}
        resetValue={0}
        onChange={vi.fn()}
      />,
    );

    const increment = view.getByRole('button', { name: '+1,000' });
    expect(increment.getAttribute('aria-pressed')).toBeNull();
    expect((increment as HTMLButtonElement).disabled).toBe(true);
  });
});
