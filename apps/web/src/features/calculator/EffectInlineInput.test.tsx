// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { EffectInputViewModel } from '@fgo-lab/calculation-application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectInlineInput } from './EffectInlineInput';

afterEach(cleanup);

function input(overrides: Partial<EffectInputViewModel> = {}): EffectInputViewModel {
  return {
    key: 'field:enemyCount',
    kind: 'matchingActorCount',
    owner: 'field',
    label: '敵の合計数',
    description: '宝具対象を含む生存中の敵数',
    control: 'segmented',
    minimum: 1,
    maximum: 3,
    step: 1,
    value: 1,
    defaultValue: 1,
    defaultReason: '現在の宝具対象1体',
    explicit: false,
    invalid: false,
    section: 'own',
    relatedProjectionKeys: ['effect:damage'],
    relatedEffectLabels: ['宝具威力アップ'],
    ...overrides,
  };
}

describe('effect inline canonical input', () => {
  it('renders a small population domain as one keyboard-operable segmented control', () => {
    const onChange = vi.fn();
    const view = render(<EffectInlineInput input={input()} onChange={onChange} />);

    const group = view.getByRole('group', { name: '敵の合計数' });
    const options = Array.from(group.querySelectorAll('button'));
    // E2E-A040-COMMAND
    expect(options.map((option) => option.textContent)).toEqual(['1', '2', '3']);
    expect(options[0]?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(options[2]!);
    expect(onChange).toHaveBeenCalledWith('field:enemyCount', 3);
  });

  it('does not clamp an invalid final total and exposes the typed error at the control', () => {
    const onChange = vi.fn();
    const view = render(
      <EffectInlineInput
        input={input({
          key: 'effect:king',
          label: '〔王〕一致数',
          control: 'stepper',
          maximum: 6,
          value: 0,
          explicit: true,
          invalid: true,
        })}
        onChange={onChange}
      />,
    );

    const field = view.getByRole('spinbutton', { name: '〔王〕一致数' });
    // E2E-A031-REQUIRED E2E-A039-TYPED-INPUT
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect((field as HTMLInputElement).value).toBe('0');
    expect(view.getByText('入力範囲を確認してください。')).toBeTruthy();
    fireEvent.change(field, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith('effect:king', 2);
  });

  it('converts percentage presentation to the canonical permille value', () => {
    const onChange = vi.fn();
    const view = render(
      <EffectInlineInput
        input={input({
          key: 'support:hp',
          kind: 'sourceHpPermille',
          owner: 'source',
          label: '支援元HP',
          control: 'percentage',
          minimum: 0,
          maximum: 1_000,
          step: 10,
          value: 500,
          defaultValue: null,
          defaultReason: null,
        })}
        onChange={onChange}
      />,
    );

    const field = view.getByRole('spinbutton', { name: '支援元HP' });
    expect((field as HTMLInputElement).value).toBe('50');
    fireEvent.change(field, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith('support:hp', 750);
  });
});
