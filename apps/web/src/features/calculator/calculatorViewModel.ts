import type { EffectProjection } from '@fgo-lab/calculation-application';
import type { CraftEssenceMaster, NpDamageSpec, ServantMaster } from '@fgo-lab/master-data';
import type { DamageResolutionInput, SupportComposition, SupportTemplate } from '@fgo-lab/schema';
import { collectDamageEffectStacks } from '../../presentation/damageEffectStacks';

export function createCalculatorViewModel({
  input,
  effects,
  servants,
  attackerDamage,
  selectedCraftEssence,
  craftEssenceSelection,
  selectedSupport,
  supportComposition,
}: {
  input: DamageResolutionInput;
  effects: readonly EffectProjection[];
  servants: readonly ServantMaster[];
  attackerDamage: NpDamageSpec | null | undefined;
  selectedCraftEssence: CraftEssenceMaster | undefined;
  craftEssenceSelection: { level: number } | null;
  selectedSupport: SupportTemplate | undefined;
  supportComposition: SupportComposition | undefined;
}) {
  const ownEffects = effects.filter((effect) => effect.source.origin !== 'support');
  const supportEffects = effects.filter((effect) => effect.source.origin === 'support');
  const supportSources = supportComposition?.sources ?? [];
  const excludedSupportEffectCount = supportComposition?.effectInclusions.length ?? 0;
  const classSituationLabel =
    input.classAffinity === 2
      ? '有利'
      : input.classAffinity === 1.5
        ? '攻撃有利'
        : input.classAffinity === 0.5
          ? '不利'
          : input.classAffinity === 1
            ? '等倍'
            : '直接入力';
  const attributeSituationLabel =
    input.attributeAffinity === 1.1
      ? '有利'
      : input.attributeAffinity === 0.9
        ? '不利'
        : input.attributeAffinity === 1
          ? '等倍'
          : '直接入力';
  return {
    ownEffects,
    supportEffects,
    requiresAttackerHp:
      attackerDamage?.kind === 'hpRatioLow' ||
      effects.some(
        (effect) =>
          effect.requiredQuantity === 'attackerHpPermille' &&
          effect.requiredQuantityOwner === 'attacker',
      ),
    supportSources,
    excludedSupportEffectCount,
    supportModified: Boolean(
      selectedSupport &&
      supportComposition &&
      JSON.stringify(selectedSupport.composition) !== JSON.stringify(supportComposition),
    ),
    damageEffectStacks: collectDamageEffectStacks({
      effects,
      servants,
      craftEssence: selectedCraftEssence,
    }),
    enabledAttackerSkillCount: new Set(
      effects
        .filter((effect) => effect.source.origin === 'attacker' && effect.outcome === 'applied')
        .map((effect) => effect.source.skillId),
    ).size,
    targetSummary: `クラス${classSituationLabel}（${input.classAffinity.toFixed(2)}倍）・属性${attributeSituationLabel}（${input.attributeAffinity.toFixed(2)}倍）`,
    craftEssenceSummary:
      selectedCraftEssence && craftEssenceSelection
        ? `${selectedCraftEssence.name} Lv.${craftEssenceSelection.level}`
        : '礼装なし',
    supportSummary: selectedSupport
      ? `${selectedSupport.name}（除外${excludedSupportEffectCount}効果）`
      : supportSources.length
        ? `未保存の支援構成（除外${excludedSupportEffectCount}効果）`
        : '支援なし',
  };
}
