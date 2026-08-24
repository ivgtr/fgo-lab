import { describe, expect, it } from 'vitest';
import {
  specialTraitLabel,
  specialTraitSourceLabel,
  specialTraitValueLabel,
  traitLabel,
} from './specialTraitPresentation';
import type { SpecialTraitSource } from './specialTraits';

const source: SpecialTraitSource = {
  key: 'source',
  origin: 'attacker',
  sourceName: '攻撃役',
  effectName: '効果元',
  imageKey: null,
  value: 0.3,
  modifierKind: 'powerMod',
};

describe('special trait presentation', () => {
  it('uses the maintained label before the external effect wording', () => {
    expect(
      specialTraitLabel({ trait: 'dragon', matchesWhenPresent: true, sources: [source] }),
    ).toBe('竜');
    expect(
      specialTraitLabel({ trait: 'classSaber', matchesWhenPresent: true, sources: [source] }),
    ).toBe('セイバー');
  });

  it('does not infer a condition name from mutable external wording', () => {
    expect(
      specialTraitLabel({
        trait: 'newTrait',
        matchesWhenPresent: true,
        sources: [source],
      }),
    ).toBe('未登録条件');
    expect(traitLabel('trait:unregistered')).toBe('未登録条件');
  });

  it('labels an excluded trait without parsing effect text', () => {
    expect(
      specialTraitLabel({ trait: 'superGiant', matchesWhenPresent: false, sources: [source] }),
    ).toBe('非超巨大');
  });

  it('formats additive and NP multipliers according to their semantics', () => {
    expect(specialTraitValueLabel(source)).toBe('+30%');
    expect(specialTraitValueLabel({ ...source, modifierKind: 'npSpecial', value: 1.875 })).toBe(
      '187.5%',
    );
    expect(specialTraitValueLabel({ ...source, value: null })).toBe('倍率不明');
  });

  it('builds source labels at the presentation boundary', () => {
    expect(specialTraitSourceLabel(source)).toBe('効果元');
    expect(
      specialTraitSourceLabel({
        ...source,
        origin: 'support',
        sourceName: '支援役',
        effectName: '支援スキル',
      }),
    ).toBe('支援役・支援スキル');
    expect(specialTraitSourceLabel({ ...source, modifierKind: 'npSpecial' })).toBe('特攻宝具');
  });
});
