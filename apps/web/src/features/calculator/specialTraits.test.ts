import { describe, expect, it } from 'vitest';
import type { ResolvedSupportEffect } from '@fgo-lab/effect-resolver';
import { collectSpecialTraitCandidates } from './specialTraits';

function resolvedEffect(patch: Partial<ResolvedSupportEffect> = {}): ResolvedSupportEffect {
  return {
    origin: 'attacker',
    sourceId: 'servant-1',
    sourceName: '攻撃役',
    skillId: 'skill-1',
    skillName: '竜特攻付与',
    effectId: 'dragon-power',
    label: '威力アップ・対竜',
    value: 0.3,
    kind: 'powerMod',
    damageTraitCondition: {
      kind: 'powerMod',
      condition: { anyOf: ['dragon'], noneOf: [] },
    },
    requiredFieldTraits: [],
    applied: false,
    reason: 'target_trait_mismatch',
    ...patch,
  };
}

describe('special trait candidates', () => {
  it('collects resolved damage conditions without reinterpreting selections or levels', () => {
    const candidates = collectSpecialTraitCandidates({
      effects: [
        resolvedEffect(),
        resolvedEffect(),
        resolvedEffect({
          effectId: 'internal',
          damageTraitCondition: {
            kind: 'powerMod',
            condition: { anyOf: ['trait:internal'], noneOf: [] },
          },
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      trait: 'dragon',
      matchesWhenPresent: true,
      sources: [
        {
          key: 'attacker:servant-1:skill-1:dragon-power',
          origin: 'attacker',
          sourceName: '攻撃役',
          effectName: '竜特攻付与',
          imageKey: null,
          effectLabel: '威力アップ・対竜',
          value: 0.3,
          modifierKind: 'powerMod',
        },
      ],
    });
    expect(candidates[1]).toMatchObject({ trait: 'trait:internal', matchesWhenPresent: true });
  });

  it('exposes every alternative trait from a multi-trait damage condition', () => {
    const candidates = collectSpecialTraitCandidates({
      effects: [
        resolvedEffect({
          damageTraitCondition: {
            kind: 'powerMod',
            condition: { anyOf: ['classSaber', 'classArcher'], noneOf: [] },
          },
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });

    expect(candidates.map((candidate) => candidate.trait)).toEqual(['classSaber', 'classArcher']);
  });

  it('exposes an excluded trait as a condition that matches when absent', () => {
    const candidates = collectSpecialTraitCandidates({
      effects: [
        resolvedEffect({
          damageTraitCondition: {
            kind: 'powerMod',
            condition: { anyOf: [], noneOf: ['superGiant'] },
          },
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });

    expect(candidates[0]).toMatchObject({ trait: 'superGiant', matchesWhenPresent: false });
  });

  it('omits a condition when its buff cannot affect the selected attacker', () => {
    const candidates = collectSpecialTraitCandidates({
      effects: [resolvedEffect({ reason: 'attacker_trait_mismatch' })],
      servants: [],
      craftEssence: undefined,
    });

    expect(candidates).toEqual([]);
  });
});
