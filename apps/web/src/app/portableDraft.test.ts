import { expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { startPortableDraft } from './portableDraft';

it.each(['draft', 'history'] as const)(
  'does not publish a new %s session/workspace when durable storage fails',
  async (source) => {
    const master = masterSnapshotSchema.parse(fixture);
    const request = createDefaultCalculatorPortableRequest(master, undefined);
    const outcome = executePortableCalculation(request, master);
    if (outcome.status !== 'executed') throw new Error(outcome.status);
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const updateActiveProfile = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(
      startPortableDraft({
        request,
        result: outcome.execution.result,
        source,
        setCalculation,
        setCalculationSessionId,
        updateActiveProfile,
      }),
    ).rejects.toThrow('storage unavailable');
    expect(updateActiveProfile).toHaveBeenCalledOnce();
    expect(setCalculation).not.toHaveBeenCalled();
    expect(setCalculationSessionId).not.toHaveBeenCalled();
  },
);
