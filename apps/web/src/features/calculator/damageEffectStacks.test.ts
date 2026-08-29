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

  it('preserves execution reasons when ranking policy includes the operation', () => {
    const stacks = collectDamageEffectStacks({
      effects: [
        projection({
          outcome: 'notApplied',
          explanation: { code: 'disabled', condition: null },
        }),
        projection({
          projectionKey: 'unresolved',
          operationId: 'unresolved',
          modifier: null,
          outcome: 'unsupported',
          executionSupport: 'unsupported',
          explanation: { code: 'unresolved', condition: null },
        }),
      ],
      servants: [],
      craftEssence: undefined,
      contributionState: () => 'included',
    });
    const labels = stacks.flatMap((stack) => stack.sources.map(damageEffectStateLabel));
    expect(labels).toEqual(['計算外', '未対応']);
  });

  it('renders an applied effect as excluded when the ranking contribution policy omits it', () => {
    const stacks = collectDamageEffectStacks({
      effects: [projection()],
      servants: [],
      craftEssence: undefined,
      contributionState: () => 'excludedByRankingPolicy',
    });
    const source = stacks[0]!.sources[0]!;
    expect(source).toMatchObject({ applied: false, contributionState: 'excludedByRankingPolicy' });
    expect(damageEffectStateLabel(source)).toBe('計算外');
  });

  it('aggregates a logical effect by semantic priority instead of operation order', () => {
    const inactive = projection({
      operationId: 'operation-a',
      outcome: 'notApplied',
      value: 0.1,
      explanation: { code: 'conditionNotMet', condition: null },
    });
    const active = projection({ operationId: 'operation-b', value: 0.3 });
    const collect = (effects: readonly EffectProjection[]) =>
      collectDamageEffectStacks({
        effects,
        servants: [],
        craftEssence: undefined,
        contributionState: () => 'included',
      })[0]!.sources[0]!;
    expect(collect([inactive, active])).toMatchObject({ applied: true, value: 0.3 });
    expect(collect([active, inactive])).toMatchObject({ applied: true, value: 0.3 });
  });
});
