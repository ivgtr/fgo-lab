import type {
  EffectProjection,
  ModifierKind,
  RankingContributionPolicyState,
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
  contributionState: RankingContributionPolicyState | null;
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

const NON_APPLIED_REASON_PRIORITY: Record<EffectProjection['explanation']['code'], number> = {
  unresolved: 0,
  disabled: 1,
  cardMismatch: 2,
  targetMismatch: 3,
  conditionNotMet: 4,
  stateMutationOnly: 5,
  applied: 6,
};

interface EffectPresentationCandidate {
  effect: EffectProjection;
  contributionState: RankingContributionPolicyState | null;
}

function stableCandidateOrder(
  left: EffectPresentationCandidate,
  right: EffectPresentationCandidate,
): number {
  const byReason =
    NON_APPLIED_REASON_PRIORITY[left.effect.explanation.code] -
    NON_APPLIED_REASON_PRIORITY[right.effect.explanation.code];
  if (byReason !== 0) return byReason;
  return left.effect.operationId.localeCompare(right.effect.operationId);
}

function selectEffectPresentation(
  candidates: readonly EffectPresentationCandidate[],
): EffectPresentationCandidate {
  const applied = candidates
    .filter(
      ({ effect, contributionState }) =>
        effect.outcome === 'applied' && contributionState !== 'excludedByRankingPolicy',
    )
    .sort(stableCandidateOrder)[0];
  if (applied) return applied;
  const excluded = candidates
    .filter(
      ({ effect, contributionState }) =>
        effect.outcome === 'applied' && contributionState === 'excludedByRankingPolicy',
    )
    .sort(stableCandidateOrder)[0];
  if (excluded) return excluded;
  const fallback = [...candidates].sort(stableCandidateOrder)[0];
  if (!fallback) throw new TypeError('empty_effect_presentation_group');
  return fallback;
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
  contributionState?: (effect: EffectProjection) => RankingContributionPolicyState;
}): DamageEffectStack[] {
  const groups = new Map<DamageEffectStackKind, Map<string, EffectProjection[]>>();
  for (const effect of effects) {
    const kind = effect.modifier ?? (effect.outcome === 'unsupported' ? 'unresolved' : null);
    if (!kind) continue;
    const byProjection = groups.get(kind) ?? new Map<string, EffectProjection[]>();
    byProjection.set(effect.projectionKey, [
      ...(byProjection.get(effect.projectionKey) ?? []),
      effect,
    ]);
    groups.set(kind, byProjection);
  }
  return STACK_ORDER.flatMap((kind) => {
    const byProjection = groups.get(kind);
    if (!byProjection) return [];
    return [
      {
        kind,
        label: STACK_LABELS[kind],
        sources: [...byProjection.values()].map((group) => {
          const selected = selectEffectPresentation(
            group.map((effect) => ({
              effect,
              contributionState: contributionState?.(effect) ?? null,
            })),
          );
          const { effect, contributionState: selectedContribution } = selected;
          return {
            key: effect.projectionKey,
            sourceName: effect.sourceName,
            effectName: effect.skillName,
            effectLabel: effect.label,
            imageKey: effectSourceImage(effect, servants, craftEssence),
            value: effect.value,
            applied:
              effect.outcome === 'applied' && selectedContribution !== 'excludedByRankingPolicy',
            contributionState: selectedContribution,
            explanation: effect.explanation.code,
            kind,
          };
        }),
      },
    ];
  });
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
