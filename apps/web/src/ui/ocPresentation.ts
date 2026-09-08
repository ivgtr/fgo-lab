import type { AppliedPreparationAction } from '@fgo-lab/calculation-application';

type Receipt = NonNullable<AppliedPreparationAction['ocUse']>;
export function ocUseSummary(receipt: Receipt): string {
  return `発動時OC ${receipt.effectiveOc}（NP由来 ${receipt.baseOc}・効果加算 +${receipt.boostTotal}）`;
}
export function ocBoostUseSummary(use: Receipt['boostUses'][number]): string {
  return `${use.sourceName}・${use.skillName}：${use.label} OC+${use.stages}${use.included ? '' : '（比較条件により数値へ不算入）'}${use.usesBefore.kind === 'finite' ? `・残り${use.usesBefore.remaining}回から1回使用` : ''}`;
}
