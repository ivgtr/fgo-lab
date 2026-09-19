import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  auditProductionClosure,
  productionClosureConditionKey,
  productionClosureConditions,
} from './productionClosureAudit';

it('constructs exactly the 80 legal production conditions and reuses one supplied inventory', async () => {
  const conditions = productionClosureConditions();
  expect(conditions).toHaveLength(80);
  expect(new Set(conditions.map(productionClosureConditionKey)).size).toBe(80);
  for (const condition of conditions) {
    if (condition.npLevelBasis.kind !== 'specified') throw new Error('specified NP required');
    const legalMaximum =
      condition.npLevelBasis.npLevel === 1 ? 1 : condition.npLevelBasis.npLevel === 5 ? 3 : 2;
    expect(condition.initialOvercharge).toBeLessThanOrEqual(legalMaximum);
  }

  const master = masterSnapshotSchema.parse(fixture);
  const audit = await auditProductionClosure(
    master,
    { servantBuilds: {} },
    {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      masterDataVersion: master.version,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    },
    undefined,
    conditions.slice(0, 1),
  );
  expect(audit).toMatchObject({
    conditionCount: 1,
    outcomeCount: audit.attackProfileCount,
    outcomes: { invalid: 0, unsupported: 0, inputRequired: 0 },
    parityFailures: [],
  });
  expect(audit.parityCount).toBe(audit.outcomes.calculated);
});
