import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { ResolvedBuffKind, ResolvedEffect } from '@fgo-lab/effect-resolver';
import { effectSourceImage } from './effectSourcePresentation';
import { traitLabel } from './traitPresentation';

export type DamageEffectStackKind = ResolvedBuffKind | 'npSpecial' | 'unresolved';

export interface DamageEffectSource {
  key: string;
  sourceName: string;
  effectName: string;
  effectLabel: string;
  imageKey: string | null;
  value: number | null;
  applied: boolean;
  reason: string;
  kind: DamageEffectStackKind;
}

export interface DamageEffectStack {
  kind: DamageEffectStackKind;
  label: string;
  sources: DamageEffectSource[];
}

const STACK_LABELS: Record<DamageEffectStackKind, string> = {
  attackBuff: '攻撃力',
  cardBuff: 'カード性能',
  npDamageBuff: '宝具威力',
  eventDamageBuff: 'イベント特攻',
  specialDamageBuff: '特殊威力',
  powerMod: '特攻状態',
  flatDamage: '固定ダメージ',
  npSpecial: '特攻宝具',
  unresolved: '未解決の火力効果',
};

const STACK_ORDER: DamageEffectStackKind[] = [
  'attackBuff',
  'cardBuff',
  'npDamageBuff',
  'powerMod',
  'npSpecial',
  'eventDamageBuff',
  'specialDamageBuff',
  'flatDamage',
  'unresolved',
];

function stackKind(effect: ResolvedEffect): DamageEffectStackKind | null {
  if (effect.damageTraitCondition?.kind === 'npSpecial') return 'npSpecial';
  if (effect.kind) return effect.kind;
  return effect.reason === 'damage_effect_not_supported' ? 'unresolved' : null;
}

function effectLabel(effect: ResolvedEffect): string {
  const condition = effect.damageTraitCondition?.condition;
  if (!condition) return effect.label;
  const traits = [
    ...condition.anyOf.map(traitLabel),
    ...condition.noneOf.map((trait) => `非${traitLabel(trait)}`),
  ];
  return traits.length ? `${traits.join('・')}特攻` : effect.label;
}

export function collectDamageEffectStacks({
  effects,
  servants,
  craftEssence,
}: {
  effects: readonly ResolvedEffect[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
}): DamageEffectStack[] {
  const stacks = new Map<DamageEffectStackKind, DamageEffectStack>();

  for (const effect of effects) {
    const kind = stackKind(effect);
    if (!kind) continue;
    const stack = stacks.get(kind) ?? { kind, label: STACK_LABELS[kind], sources: [] };
    const key = effect.effectKey;
    if (!stack.sources.some((source) => source.key === key)) {
      stack.sources.push({
        key,
        sourceName: effect.sourceName,
        effectName: effect.skillName,
        effectLabel: effectLabel(effect),
        imageKey: effectSourceImage(effect, servants, craftEssence),
        value: effect.value,
        applied: effect.state === 'applied',
        reason: effect.reason,
        kind,
      });
    }
    stacks.set(kind, stack);
  }

  return STACK_ORDER.flatMap((kind) => {
    const stack = stacks.get(kind);
    return stack ? [stack] : [];
  });
}

export function damageEffectValueLabel(source: DamageEffectSource): string {
  if (source.value === null) return '倍率不明';
  if (source.kind === 'flatDamage') return `+${source.value.toLocaleString('ja-JP')}`;
  if (source.kind === 'npSpecial') return `${source.value.toFixed(2)}倍`;
  return source.value.toLocaleString('ja-JP', {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 1,
  });
}

export function damageEffectStateLabel(source: DamageEffectSource): string {
  if (source.applied) return damageEffectValueLabel(source);
  if (source.reason === 'card_type_mismatch') return 'カード不一致';
  if (source.reason === 'attacker_trait_mismatch') return '攻撃役の特性不一致';
  if (source.reason === 'target_trait_mismatch') return '対象特性なし';
  if (source.reason === 'field_trait_mismatch') return 'フィールド不一致';
  return '未対応';
}
