import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { calculateRankingPolicyDetail } from './rankingProfileCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { auditProductionPreparationTransactionObservations } from './productionParityDiagnostics';

it('keeps the post-consumption NP gain in the ordered production receipt', () => {
  const master = masterSnapshotSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
        'utf8',
      ),
    ),
  );
  const servant = master.servants.find(({ id }) => id === '106500')!;
  const condition = {
    ...DEFAULT_RANKING_POLICY_CONDITIONS,
    npLevelBasis: { kind: 'specified' as const, npLevel: 3 as const },
    initialOvercharge: 2 as const,
    selfBuffs: 'excluded' as const,
    conditionalEffects: 'baseline' as const,
  };
  const detail = calculateRankingPolicyDetail(servant, master, { servantBuilds: {} }, condition, {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    engineVersion: ENGINE_VERSION,
    masterDataVersion: master.version,
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
  });
  expect(detail.status).toBe('calculated');
  if (detail.status !== 'calculated') return;
  const action = detail.detail.appliedPreparationActions.at(-1)!;
  expect(action.command.kind).toBe('executeAttackNoblePhantasm');
  expect(action.resourceBefore.gauge).toBe(20_000);
  expect(action.resourceTransaction.afterConsumption.gauge).toBe(0);
  expect(
    action.resourceTransaction.mutations.some(
      (mutation) => mutation.before.gauge === 0 && mutation.after.gauge === 2_000,
    ),
  ).toBe(true);
  expect(action.resourceAfter.gauge).toBe(2_000);
  expect(
    auditProductionPreparationTransactionObservations([
      {
        conditionKey: 'naturalLimit-excluded-baseline-np3-oc2',
        profileKey: detail.detail.entryId,
        commands: detail.detail.scenario.preNoblePhantasmPlan,
        actions: detail.detail.appliedPreparationActions,
      },
    ]).failures,
  ).toEqual([]);
});
