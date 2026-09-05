import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import { createRankingWorkerRuntime } from './rankingWorkerRuntime';

// One small canonical calculation supplies all response corruption counterexamples.
export function rankingResponseFixture() {
  const master = masterSnapshotSchema.parse(fixture);
  const profile = { servantBuilds: {} };
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const runtime = createRankingWorkerRuntime();
  const ready = runtime.handle({
    kind: 'initialize',
    requestId: 'initialize',
    contextId: 'context',
    master,
    profile,
    versions,
  });
  const summary = runtime.handle({
    kind: 'calculate',
    requestId: 'calculate',
    contextId: 'context',
    conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
  });
  if (summary.kind !== 'result' || !summary.rows[0]) throw new Error('fixture summary required');
  const detail = runtime.handle({
    kind: 'detail',
    requestId: 'detail',
    contextId: 'context',
    fingerprint: summary.fingerprint,
    entryId: summary.rows[0].entryId,
  });
  if (detail.kind !== 'detail') throw new Error('fixture detail required');
  return { master, profile, versions, ready, summary, detail };
}
