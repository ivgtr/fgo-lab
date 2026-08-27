import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario } from './scenario';
import { calculateRanking, DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './ranking';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('production canonical ranking', () => {
  it('keeps every attacking NP on the calculator execution path', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const ranking = calculateRanking(master, profile, DEFAULT_RANKING_CONDITIONS, versions);

    expect(ranking.failures).toEqual([]);
    expect(ranking.rows).toHaveLength(420);
    for (const row of ranking.rows) {
      const detail = ranking.details[row.servantId]!;
      const calculator = calculateScenario(detail.scenario, master, versions);
      expect(calculator.input).toEqual(detail.input);
      expect(calculator.result).toEqual(detail.result);
      expect(calculator.effects).toEqual(detail.effects);
    }

    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          ranking.rows
            .map((row) => ({
              servantId: row.servantId,
              minimum: row.minimum,
              average: row.average,
              maximum: row.maximum,
              appliedEffectCount: row.appliedEffectCount,
            }))
            .sort((left, right) => left.servantId.localeCompare(right.servantId)),
        ),
      )
      .digest('hex');
    expect(digest).toMatchInlineSnapshot(
      `"6bf7e1358ce7f120d3e29b6490d0946f38d39b8d0a0f682360a88299d178988f"`,
    );
  }, 30_000);
});
