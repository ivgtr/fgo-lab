import {
  deriveNpSpecialMultiplier,
  type CraftEssenceMaster,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalcInput, CalculationSelection, SupportTemplate } from '@fgo-lab/schema';

const TRAIT_LABELS: Readonly<Record<string, string>> = {
  alignmentChaotic: '混沌',
  alignmentEvil: '悪',
  alignmentGood: '善',
  alignmentLawful: '秩序',
  arthur: 'アーサー',
  attributeEarth: '地の力',
  attributeHuman: '人の力',
  attributeSky: '天の力',
  attributeStar: '星の力',
  brynhildsBeloved: 'ブリュンヒルデの愛する者',
  classBeast: 'ビースト',
  classRider: 'ライダー',
  demonic: '魔性',
  divine: '神性',
  dragon: '竜',
  genderFemale: '女性',
  genderMale: '男性',
  giant: '巨人',
  king: '王',
  oni: '鬼',
  riding: '騎乗',
  saberClassServant: 'セイバークラスのサーヴァント',
  saberface: 'セイバー顔',
  skyOrEarthServant: '天または地の力を持つサーヴァント',
  standardClassServant: '通常クラスのサーヴァント',
  superGiant: '超巨大',
  threatToHumanity: '人類の脅威',
  weakToEnumaElish: 'エヌマ・エリシュ特攻対象',
};

interface SpecialTraitSource {
  key: string;
  name: string;
  imageKey: string | null;
  valueLabel: string;
}

interface SpecialTraitCandidate {
  trait: string;
  label: string;
  sources: SpecialTraitSource[];
}

function traitLabel(trait: string, effectLabel?: string): string {
  if (effectLabel) {
    const simplified = effectLabel
      .replace(/^威力アップ(?:・対|・|・対\s*|対\s*)/, '')
      .replace(/^威力アップ[〔［]/, '')
      .replace(/[〕］]$/, '')
      .trim();
    if (simplified && simplified !== effectLabel) return simplified;
  }
  return TRAIT_LABELS[trait] ?? (trait.startsWith('trait:') ? '特殊条件' : trait);
}

export function collectSpecialTraitCandidates({
  input,
  attacker,
  craftEssence,
  selection,
  support,
  servants,
}: {
  input: CalcInput;
  attacker: ServantMaster | undefined;
  craftEssence: CraftEssenceMaster | undefined;
  selection: CalculationSelection;
  support: SupportTemplate | undefined;
  servants: readonly ServantMaster[];
}): SpecialTraitCandidate[] {
  const candidates = new Map<string, SpecialTraitCandidate>();
  const add = (trait: string, label: string, source: SpecialTraitSource) => {
    if (trait.startsWith('trait:')) return;
    const candidate = candidates.get(trait) ?? { trait, label, sources: [] };
    if (!candidate.sources.some((item) => item.key === source.key)) candidate.sources.push(source);
    candidates.set(trait, candidate);
  };
  const addEffects = (
    effects: readonly MasterEffect[],
    source: Omit<SpecialTraitSource, 'key' | 'valueLabel'> & { key: string },
    valueIndex: number,
  ) => {
    for (const effect of effects) {
      if (
        effect.targetTraits?.length !== 1 ||
        !(effect.buffTypes ?? []).some((type) => type.toLowerCase().startsWith('updamage'))
      )
        continue;
      const trait = effect.targetTraits[0]!;
      const value = effect.values[valueIndex];
      add(trait, traitLabel(trait, effect.label), {
        ...source,
        key: `${source.key}:${effect.id}`,
        valueLabel: value === undefined ? '倍率不明' : `+${(value / 10).toLocaleString('ja-JP')}%`,
      });
    }
  };
  for (const selectedSkill of selection.attackerSkills ?? []) {
    if (!selectedSkill.enabled) continue;
    const skill = attacker?.skills.find((candidate) => candidate.id === selectedSkill.skillId);
    if (skill)
      addEffects(
        skill.effects,
        { key: `attacker:${skill.id}`, name: skill.name, imageKey: skill.imageKey },
        selectedSkill.skillLevel - 1,
      );
  }
  for (const passive of attacker?.passives ?? [])
    addEffects(
      passive.effects,
      { key: `passive:${passive.id}`, name: passive.name, imageKey: passive.imageKey },
      0,
    );
  addEffects(
    (attacker?.npEffects ?? []).filter((effect) => effect.timing === 'beforeDamage'),
    {
      key: `np:${attacker?.id ?? 'none'}`,
      name: '宝具前効果',
      imageKey: attacker?.imageKey ?? null,
    },
    input.overcharge - 1,
  );
  if (attacker?.npSpecialAttack)
    for (const trait of attacker.npSpecialAttack.targetTraits)
      add(trait, traitLabel(trait), {
        key: `np-special:${attacker.id}:${trait}`,
        name: '特攻宝具',
        imageKey: attacker.imageKey,
        valueLabel: `${(deriveNpSpecialMultiplier(attacker, input.npLevel, input.overcharge) * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%`,
      });
  if (craftEssence)
    addEffects(
      craftEssence.effects,
      { key: `ce:${craftEssence.id}`, name: craftEssence.name, imageKey: craftEssence.imageKey },
      selection.craftEssence?.limitBreak === 4 ? 1 : 0,
    );
  for (const selectedEffect of support?.effects ?? []) {
    if (!selectedEffect.enabled) continue;
    const source = servants.find((candidate) => candidate.id === selectedEffect.sourceId);
    const skill = source?.skills.find((candidate) => candidate.id === selectedEffect.effectId);
    if (source && skill)
      addEffects(
        skill.effects,
        {
          key: `support:${source.id}:${skill.id}`,
          name: `${source.name}・${skill.name}`,
          imageKey: skill.imageKey,
        },
        selectedEffect.skillLevel - 1,
      );
  }
  return [...candidates.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'ja'),
  );
}
