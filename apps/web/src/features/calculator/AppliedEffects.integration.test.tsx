// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EffectControlViewModel } from '@fgo-lab/calculation-application';
import { AppliedEffects } from './AppliedEffects';

afterEach(cleanup);

describe('applied effect interaction rendering', () => {
  it('dispatches a single-choice command and puts the selected state on the styled list item', () => {
    const control: EffectControlViewModel = {
      key: 'effect',
      operationIds: ['operation'],
      interaction: 'singleChoice',
      active: true,
      valueDisplay: 'single',
      presentationState: 'applied',
      projection: {
        projectionKey: 'effect',
        operationId: 'operation',
        contributionId: 'operation:modifier',
        label: '攻撃力アップ',
        sourceName: 'source',
        skillName: 'skill',
        gameActivation: 'skillUse',
        sourceActive: true,
        proc: { kind: 'guaranteed' },
        procRatePermille: 1_000,
        valuePermille: 200,
        value: 0.2,
        requiredQuantity: null,
        requiredQuantityOwner: null,
        requiredInputs: [],
        modifier: 'attackBuff',
        source: {
          origin: 'attacker',
          sourceInstanceId: 'source',
          sourceId: 'source',
          skillId: 'skill',
          effectId: 'effect',
          effectOccurrenceId: 'effect:0',
        },
        contributionScope: 'personal',
        contributionControl: 'operation',
        activationSources: [],
        executionSupport: 'supported',
        outcome: 'applied',
        visibility: 'visible',
        controllability: 'user',
        selectionGroups: [],
        decision: {
          state: 'enabled',
          decisionKey: 'effect',
          kind: 'effect',
          plan: { activation: 'user', condition: 'evaluate' },
        },
        conditionDecision: 'none',
        explanation: { code: 'applied', condition: null },
      },
    };
    const onToggle = vi.fn();
    const { getByRole } = render(
      <AppliedEffects
        title="自身の適用内容"
        effects={[control]}
        inputs={[]}
        servants={[]}
        craftEssence={undefined}
        onToggle={onToggle}
        onInputChange={vi.fn()}
      />,
    );

    // E2E-A030-SELECTION E2E-A036-COMMAND
    expect(
      getByRole('radio', { name: /攻撃力アップ/ })
        .closest('li')
        ?.getAttribute('data-active'),
    ).toBe('true');
    const chip = getByRole('radio', { name: /攻撃力アップ、\+20%.*確定/ });
    expect(chip.getAttribute('aria-label')).not.toContain('条件成立');
    expect(chip.textContent).toContain('+20%・スキル');
    expect(chip.textContent).not.toContain('計算中');
    expect(chip.textContent).not.toContain('スキル使用中');
    expect(chip.textContent).not.toContain('確定');
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith(control, false);
  });
});
