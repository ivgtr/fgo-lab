import type { SpecialTraitCandidate, SpecialTraitSource } from './specialTraits';
import traitLabels from './specialTraitLabels.ja.json';

const TRAIT_LABELS: Readonly<Record<string, string>> = traitLabels;

const percentageFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

function labelFromEffect(effectLabel: string): string | null {
  const simplified = effectLabel
    .replace(/^威力アップ(?:・対|・|・対\s*|対\s*)/, '')
    .replace(/^威力アップ[〔［]/, '')
    .replace(/[〕］]$/, '')
    .trim();
  return simplified && simplified !== effectLabel ? simplified : null;
}

export function specialTraitLabel(candidate: SpecialTraitCandidate): string {
  const label =
    TRAIT_LABELS[candidate.trait] ??
    candidate.sources.map((source) => labelFromEffect(source.effectLabel)).find(Boolean) ??
    '未登録条件';
  return candidate.matchesWhenPresent ? label : `非${label}`;
}

export function traitLabel(trait: string): string {
  return TRAIT_LABELS[trait] ?? '未登録条件';
}

export function specialTraitValueLabel(source: SpecialTraitSource): string {
  if (source.value === null) return '倍率不明';
  const percentage = percentageFormatter.format(source.value * 100);
  return source.modifierKind === 'powerMod' ? `+${percentage}%` : `${percentage}%`;
}

export function specialTraitSourceLabel(source: SpecialTraitSource): string {
  if (source.modifierKind === 'npSpecial') return '特攻宝具';
  return source.origin === 'support'
    ? `${source.sourceName}・${source.effectName}`
    : source.effectName;
}
