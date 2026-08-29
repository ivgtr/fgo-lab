import type {
  EffectiveRankingContributionState,
  EffectProjection,
  ModifierKind,
} from '@fgo-lab/calculation-application';
import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import { effectSourceImage } from './effectSourcePresentation';

export type DamageEffectStackKind =
  ModifierKind | 'npSpecial' | 'npVariantSelection' | 'unresolved';

export interface DamageEffectSource {
  key: string;
  sourceName: string;
  effectName: string;
  effectLabel: string;
  imageKey: string | null;
  value: number | null;
  applied: boolean;
  contributionState: EffectiveRankingContributionState | null;
  explanation: EffectProjection['explanation']['code'];
  kind: DamageEffectStackKind;
}

export interface DamageEffectStack {
  kind: DamageEffectStackKind;
  label: string;
  sources: DamageEffectSource[];
}

const STACK_LABELS: Record<DamageEffectStackKind, string> = {
  attackBuff: '攻撃力',
  defenseBuff: '防御力',
  cardBuff: 'カード性能',
  cardResistance: 'カード耐性',
  npDamageBuff: '宝具威力',
  npResistance: '宝具耐性',
  ignoreDefense: '防御無視',
  ignoreDamageCut: 'ダメージカット貫通',
  eventDamageBuff: 'イベント特攻',
  specialDamageBuff: '特殊威力',
  powerMod: '特攻状態',
  flatDamage: '固定ダメージ',
  npSpecial: '特攻宝具',
  npVariantSelection: '宝具形態',
  unresolved: '未解決の火力効果',
};

const STACK_ORDER: DamageEffectStackKind[] = [
  'attackBuff',
  'defenseBuff',
  'cardBuff',
  'cardResistance',
  'npDamageBuff',
  'npResistance',
  'ignoreDefense',
  'ignoreDamageCut',
  'powerMod',
  'npSpecial',
  'npVariantSelection',
  'eventDamageBuff',
  'specialDamageBuff',
  'flatDamage',
  'unresolved',
];

function effectContributes(
  effect: EffectProjection,
  contributionState: EffectiveRankingContributionState | null,
): boolean {
  if (contributionState === null) return effect.outcome === 'applied';
  return contributionState === 'contributing';
}

export function collectDamageEffectStacks({
  effects,
  servants,
  craftEssence,
  contributionState,
}: {
  effects: readonly EffectProjection[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
  contributionState?: (effect: EffectProjection) => EffectiveRankingContributionState;
}): DamageEffectStack[] {
  const stacks = new Map<DamageEffectStackKind, DamageEffectStack>();
  for (const effect of effects) {
    const kind = effect.modifier ?? (effect.outcome === 'unsupported' ? 'unresolved' : null);
    if (!kind) continue;
    const stack = stacks.get(kind) ?? { kind, label: STACK_LABELS[kind], sources: [] };
    if (!stack.sources.some((source) => source.key === effect.projectionKey)) {
      const resolvedContribution = contributionState?.(effect) ?? null;
      stack.sources.push({
        key: effect.projectionKey,
        sourceName: effect.sourceName,
        effectName: effect.skillName,
        effectLabel: effect.label,
        imageKey: effectSourceImage(effect, servants, craftEssence),
        value: effect.value,
        applied: effectContributes(effect, resolvedContribution),
        contributionState: resolvedContribution,
        explanation: effect.explanation.code,
        kind,
      });
    }
    stacks.set(kind, stack);
  }
  return STACK_ORDER.flatMap((kind) => (stacks.has(kind) ? [stacks.get(kind)!] : []));
}

export function damageEffectValueLabel(source: DamageEffectSource): string {
  if (
    source.kind === 'ignoreDefense' ||
    source.kind === 'ignoreDamageCut' ||
    source.kind === 'npVariantSelection'
  )
    return '適用';
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
  if (source.contributionState === 'excludedByRankingPolicy') return '計算外';
  if (source.contributionState === 'conditionNotMet') return '条件不成立';
  if (source.contributionState === 'unsupported') return '未対応';
  if (source.applied) return damageEffectValueLabel(source);
  const labels: Record<DamageEffectSource['explanation'], string> = {
    applied: damageEffectValueLabel(source),
    disabled: '計算外',
    conditionNotMet: '条件未選択',
    cardMismatch: 'カード不一致',
    targetMismatch: '対象不一致',
    stateMutationOnly: '状態反映',
    unresolved: '未対応',
  };
  return labels[source.explanation];
}
