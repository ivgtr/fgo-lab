import type { CanonicalInputDefinition, EffectProc } from '@fgo-lab/master-data';
import type { ResolvedCanonicalInputSet } from './executionTypes';

export function statusAdjustmentInputState(
  proc: EffectProc,
  definitions: readonly CanonicalInputDefinition[],
  inputs: ResolvedCanonicalInputSet,
): { status: 'ready' } | { status: 'missing'; key: string } | { status: 'invalid' } {
  if (proc.kind === 'guaranteed' || !proc.netAdjustmentInputKey) return { status: 'ready' };
  const matching = definitions.filter((item) => item.kind === 'statusApplicationAdjustment');
  if (matching.length !== 1) return { status: 'invalid' };
  const key = matching[0]!.key;
  if (inputs.missingDefinitions.some((item) => item.key === key)) return { status: 'missing', key };
  const value = inputs.values[key];
  return value !== undefined && Number.isInteger(value) && value >= -5000 && value <= 5000
    ? { status: 'ready' }
    : { status: 'invalid' };
}

/** Atlas compares an integer roll in [0, 1000) with the unrounded status rate. */
export function effectiveProcRate(
  proc: EffectProc,
  baseRate: number,
  adjustment: number | null,
): number {
  if (!Number.isInteger(baseRate) || baseRate < 0 || baseRate > 5000)
    throw new TypeError('invalid_source_proc_cell');
  if (proc.kind === 'guaranteed') return 1000;
  if (!proc.netAdjustmentInputKey) {
    if (baseRate > 1000) throw new TypeError('invalid_source_proc_cell');
    return baseRate;
  }
  if (
    adjustment === null ||
    !Number.isInteger(adjustment) ||
    adjustment < -5000 ||
    adjustment > 5000
  )
    throw new TypeError('invalid_status_application_adjustment');
  return Math.max(0, Math.min(1000, baseRate + adjustment + 1));
}
