import type { EffectProjection } from '@fgo-lab/calculation-application';
import { describe, expect, it } from 'vitest';
import {
  collectDamageEffectStacks,
  damageEffectStateLabel,
} from '../../presentation/damageEffectStacks';

function projection(patch: Partial<EffectProjection> = {}): EffectProjection {
  return {
    projectionKey: 'attack',
    operationId: 'attack',
    label: '攻撃力アップ',
    sourceName: 'source',
    skillName: 'skill',
    gameActivation: 'skillUse',
    sourceActive: true,
    proc: { kind: 'guaranteed' },
    procRatePermille: 1_000,
    valuePermille: 300,
    value: 0.3,
    requiredQuantity: null,
    requiredQuantityOwner: null,
    requiredInputs: [],
    selectionGroups: [],
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
    decision: {
      state: 'enabled',
      decisionKey: 'attack',
      kind: 'effect',
      plan: { activation: 'user', condition: 'evaluate' },
    },
    conditionDecision: 'none',
    explanation: { code: 'applied', condition: null },
    ...patch,
  };
}

describe('typed damage effect stacks', () => {
  it('groups projections by modifier without reason-string inference', () => {
    const stacks = collectDamageEffectStacks({
      effects: [projection(), projection({ projectionKey: 'attack-2', value: 0.2 })],
      servants: [],
      craftEssence: undefined,
    });
    expect(stacks).toMatchObject([{ kind: 'attackBuff', sources: [{ applied: true }, {}] }]);
  });

  it('maps typed explanations to display copy', () => {
    const stacks = collectDamageEffectStacks({
      effects: [
        projection({
          outcome: 'impossible',
          explanation: { code: 'cardMismatch', condition: null },
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });
    expect(damageEffectStateLabel(stacks[0]!.sources[0]!)).toBe('カード不一致');
  });
});
