// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModifierChip } from './ModifierChip';

afterEach(cleanup);

describe('modifier chip', () => {
  it('exposes an interactive condition as a pressed-state button', () => {
    const onToggle = vi.fn();
    const view = render(
      <ul>
        <ModifierChip active={false} label="混沌特攻" detail="対象外・200%" onToggle={onToggle} />
      </ul>,
    );

    const button = view.getByRole('button', { name: /混沌特攻/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders a calculated modifier as non-interactive content', () => {
    const view = render(
      <ul>
        <ModifierChip active label="カード性能" detail="クイックアップ +12%" />
      </ul>,
    );

    expect(view.queryByRole('button')).toBeNull();
    expect(view.getByText('カード性能')).toBeTruthy();
  });
});
