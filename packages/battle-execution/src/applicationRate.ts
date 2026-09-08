/** A rate adjusted by live state cannot use the raw proc's guaranteed/default outcome. */
export function resolveApplicationRateOutcome(
  effectiveRate: number,
  witness: number | undefined,
): 'success' | 'failure' | 'inputRequired' | 'invalid' {
  if (!Number.isInteger(effectiveRate) || effectiveRate < 0 || effectiveRate > 1000)
    return 'invalid';
  if (effectiveRate === 0) return 'failure';
  if (effectiveRate === 1000) return 'success';
  if (witness === undefined) return 'inputRequired';
  if (witness !== 0 && witness !== 1) return 'invalid';
  return witness === 1 ? 'success' : 'failure';
}
