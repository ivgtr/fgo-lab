// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type {
  EffectControlViewModel,
  EffectInputViewModel,
  EffectProjection,
  EffectPresentationState,
} from '@fgo-lab/calculation-application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppliedEffects } from './AppliedEffects';

afterEach(cleanup);

function projection(overrides: Partial<EffectProjection> = {}): EffectProjection {
  return {
    projectionKey: 'effect',
    operationId: 'operation',
    label: '攻撃力アップ',
    sourceName: '攻撃役',
    skillName: 'スキル',
    gameActivation: 'npBeforeDamage',
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
      origin: 'np',
      sourceInstanceId: 'np:1',
      sourceId: '1',
      skillId: 'np:1',
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
    ...overrides,
  };
}

function control(
  state: EffectPresentationState,
  projectionOverrides: Partial<EffectProjection> = {},
  active = state === 'applied',
): EffectControlViewModel {
  return {
    key: 'effect',
    operationIds: ['operation'],
    interaction: 'toggle',
    active,
    valueDisplay: 'single',
    presentationState: state,
    projection: projection(projectionOverrides),
  };
}

function procInput(value: number): EffectInputViewModel {
  return {
    key: 'proc',
    kind: 'procSuccessCount',
    owner: 'source',
    label: '確率効果の成功回数',
    description: 'test',
    control: 'stepper',
    minimum: 0,
    maximum: 5,
    step: 1,
    value,
    defaultValue: 5,
    defaultReason: 'test',
    explicit: value !== 5,
    invalid: false,
    section: 'own',
    relatedProjectionKeys: ['effect'],
    relatedEffectLabels: ['攻撃力アップ'],
  };
}

function renderControl(effect: EffectControlViewModel, inputs: EffectInputViewModel[] = []) {
  render(
    <AppliedEffects
      title="自身の適用内容"
      effects={[effect]}
      inputs={inputs}
      servants={[]}
      craftEssence={undefined}
      onToggle={vi.fn()}
      onInputChange={vi.fn()}
    />,
  );
  return screen.getByRole('button', { name: /攻撃力アップ/ });
}

describe('effect accessible state semantics', () => {
  it('distinguishes guaranteed inclusion and manual comparison exclusion', () => {
    const applied = renderControl(control('applied'));
    expect(applied.getAttribute('aria-label')).toMatch(/確定/);
    expect(applied.getAttribute('aria-label')).not.toMatch(/条件不成立/);
    cleanup();

    const excluded = renderControl(
      control('manuallyExcluded', {
        outcome: 'notApplied',
        decision: {
          state: 'disabled',
          decisionKey: 'effect',
          kind: 'effect',
          plan: { activation: 'user', condition: 'evaluate' },
        },
        explanation: { code: 'disabled', condition: null },
      }),
    );
    expect(excluded.getAttribute('aria-label')).toMatch(/比較のため除外/);
    expect(excluded.getAttribute('aria-label')).not.toMatch(/条件不成立/);
  });

  it('distinguishes a single proc success and failure', () => {
    const proc: EffectProjection['proc'] = {
      kind: 'singleRoll' as const,
      ratePermille: [[600], [600], [600], [600], [600]],
    };
    const success = renderControl(
      control('applied', { proc, procRatePermille: 600, outcome: 'applied' }),
    );
    expect(success.getAttribute('aria-label')).toMatch(/成功時・60%/);
    cleanup();

    const failure = renderControl(
      control('procFailed', {
        proc,
        procRatePermille: 600,
        outcome: 'notApplied',
        decision: {
          state: 'disabled',
          decisionKey: 'effect',
          kind: 'effect',
          plan: { activation: 'user', condition: 'evaluate' },
        },
        explanation: { code: 'disabled', condition: null },
      }),
    );
    expect(failure.getAttribute('aria-label')).toMatch(/失敗扱い・60%/);
    expect(failure.getAttribute('aria-label')).not.toMatch(/条件不成立/);
  });

  it.each([
    [0, 'procFailed' as const, /失敗・成功0\/5/],
    [2, 'applied' as const, /成功2\/5/],
  ])('describes chained success count %i without a condition reason', (value, state, name) => {
    const chip = renderControl(
      control(
        state,
        {
          proc: {
            kind: 'chainedRolls',
            ratePermille: [[800], [800], [800], [800], [800]],
            seriesKey: 'proc',
            index: 0,
            maximumSuccesses: 5,
          },
          procRatePermille: 800,
          outcome: value === 0 ? 'notApplied' : 'applied',
        },
        value > 0,
      ),
      [procInput(value)],
    );
    expect(chip.getAttribute('aria-label')).toMatch(name);
    expect(chip.getAttribute('aria-label')).not.toMatch(/条件不成立/);
  });

  it('distinguishes an evaluated HP condition from an unselected trait condition', () => {
    const hp = renderControl(
      control('conditionUnsatisfied', {
        outcome: 'notApplied',
        explanation: {
          code: 'conditionNotMet',
          condition: {
            kind: 'quantity',
            quantity: 'attackerHpPermille',
            comparison: 'atMost',
            value: 500,
          },
        },
      }),
    );
    expect(hp.getAttribute('aria-label')).toMatch(/条件不成立/);
    cleanup();

    const trait = renderControl(
      control('conditionUnselected', {
        outcome: 'notApplied',
        conditionDecision: 'evaluate',
        explanation: {
          code: 'conditionNotMet',
          condition: { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
        },
      }),
    );
    expect(trait.getAttribute('aria-label')).toMatch(/条件未選択/);
    expect(trait.getAttribute('aria-label')).not.toMatch(/条件不成立/);
  });

  it.each([
    ['sourceInactive' as const, 'スキル未使用'],
    ['unsupported' as const, '未対応'],
  ])('reports %s without rewriting it as a condition failure', (state, label) => {
    const chip = renderControl(
      control(state, {
        sourceActive: state !== 'sourceInactive',
        outcome: state === 'unsupported' ? 'unsupported' : 'notApplied',
        explanation: {
          code: state === 'unsupported' ? 'unresolved' : 'disabled',
          condition: null,
        },
      }),
    );
    expect(chip.getAttribute('aria-label')).toMatch(new RegExp(label));
    expect(chip.getAttribute('aria-label')).not.toMatch(/条件不成立/);
  });
});
