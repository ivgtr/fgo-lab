import traitLabels from './specialTraitLabels.ja.json';

const TRAIT_LABELS: Readonly<Record<string, string>> = traitLabels;

export function traitLabel(trait: string): string {
  return TRAIT_LABELS[trait] ?? '未登録条件';
}
