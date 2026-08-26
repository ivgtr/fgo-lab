// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EffectControlViewModel } from '@fgo-lab/calculation-application';
import { AppliedEffects } from './AppliedEffects';

afterEach(cleanup);

describe('applied effect interaction rendering', () => {
  it('puts the selected state on the styled list item', () => {
    const control: EffectControlViewModel = {
      key: 'effect',
      operationIds: ['operation'],
      control: 'toggle',
      conditionControl: 'none',
      valueDisplay: 'single',
      projection: {
        projectionKey: 'effect',
        operationId: 'operation',
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
    const { getByRole } = render(
      <AppliedEffects
        title="自身の適用内容"
        effects={[control]}
        inputs={[]}
        servants={[]}
        craftEssence={undefined}
        onToggle={vi.fn()}
        onConditionChange={vi.fn()}
        onInputChange={vi.fn()}
      />,
    );

    expect(
      getByRole('button', { name: /攻撃力アップ/ })
        .closest('li')
        ?.getAttribute('data-active'),
    ).toBe('true');
  });
});
