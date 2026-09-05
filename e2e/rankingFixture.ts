import fixture from '../packages/test-fixtures/master/fixture.json' with { type: 'json' };
import {
  createStaticAttackProfiles,
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingRowSummary,
} from '../packages/calculation-application/src/index';
import { masterSnapshotSchema } from '../packages/master-data/src/index';
import {
  rankingConditionsFingerprint,
  type RankingWorkerResponse,
} from '../apps/web/src/features/ranking/rankingWorkerProtocol';

const master = masterSnapshotSchema.parse(fixture);
const servant = master.servants[0]!;
const attackProfile = createStaticAttackProfiles(servant)[0]!;
const noblePhantasm = servant.noblePhantasmVariantGroups
  .flatMap(({ variants }) => variants)
  .find(({ canonicalId }) => canonicalId === attackProfile.noblePhantasmVariantCanonicalId)!;

const rows = Array.from({ length: 12 }, (_, index) => {
  const row = {
    entryId: `${servant.id}:${attackProfile.noblePhantasmVariantCanonicalId}:${String(index)}`,
    servantId: servant.id,
    name: index === 0 ? servant.name : `${servant.name} ${String(index + 1)}`,
    imageKey: null,
    classId: servant.classId,
    rarity: servant.rarity,
    npCard: attackProfile.cardType,
    npTarget: attackProfile.targetScope,
    noblePhantasmVariant: attackProfile.noblePhantasmVariant,
    noblePhantasmName: noblePhantasm.name,
    attackProfile,
    minimum: 10_000 - index * 100,
    average: 12_000 - index * 100,
    maximum: 14_000 - index * 100,
    precision: 'exact',
    appliedEffectCount: index % 4,
    supportEffectCount: 0,
    supportSourceCount: 0,
    specialDamageApplied: false,
    level: 90,
    npLevel: 1,
    owned: false,
  } satisfies RankingRowSummary;
  return row;
});

export const rankingFixtureResult = {
  kind: 'result',
  requestId: 'fixture-request',
  contextId: 'fixture-context',
  fingerprint: rankingConditionsFingerprint(DEFAULT_RANKING_POLICY_CONDITIONS),
  rows,
  exclusions: [],
} satisfies RankingWorkerResponse;
