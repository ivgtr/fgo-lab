import { recoverPortableCalculation } from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CalculationShareSnapshot } from '@fgo-lab/schema';

export function validateCalculationShareSnapshot(
  snapshot: CalculationShareSnapshot,
  master: MasterDataSnapshot,
): CalculationShareSnapshot {
  const recovery = recoverPortableCalculation(snapshot.request, snapshot.result, master);
  if (recovery.status === 'invalid') throw new TypeError(`share_${recovery.reason}`);
  return snapshot;
}
