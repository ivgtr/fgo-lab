import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { conditionFactRequirements } from './conditionProvenance';
import { conditionAllowsEffectLocalDecision } from './effectControls';
import { DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './rankingContracts';
import { contributesToAttackerDamage, isSpecialAttack } from './rankingContribution';
import { compileRankingExecutionPlan, selectedKeysForScope } from './rankingScenario';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('production ranking condition provenance', () => {
  it('ratchets the former effect-local assumption inventory by canonical provenance', async () => {
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
    const inventory = master.servants.flatMap((servant) => {
      if (servant.noblePhantasms.length === 0) return [];
      const plan = compileRankingExecutionPlan(
        servant,
        master,
        profile,
        DEFAULT_RANKING_CONDITIONS,
        versions,
      );
      const selected = selectedKeysForScope(
        plan.baseline.effectControls,
        DEFAULT_RANKING_CONDITIONS,
        'ranking',
        null,
        master,
      );
      return plan.baseline.effectControls.flatMap((control) => {
        const decision = control.projection.decision;
        if (
          decision.state === 'none' ||
          decision.kind !== 'effect' ||
          decision.plan.condition !== 'userMayAssume' ||
          control.interaction === 'none' ||
          !selected.has(control.key) ||
          !conditionAllowsEffectLocalDecision(control.projection.explanation.condition) ||
          !contributesToAttackerDamage(control.projection) ||
          isSpecialAttack(control.projection)
        )
          return [];
        const requirements = conditionFactRequirements(control.projection.explanation.condition);
        return [
          {
            servantId: servant.id,
            name: servant.name,
            projectionKey: control.key,
            occurrenceId: control.projection.source.effectOccurrenceId,
            kinds: [...new Set(requirements.map(({ kind }) => kind))].sort(),
            fields: requirements.flatMap(({ kind, condition }) =>
              kind === 'derivedOrExternalField' &&
              condition.kind === 'trait' &&
              condition.scope === 'field'
                ? [condition.trait]
                : [],
            ),
          },
        ];
      });
    });
    const byKind = Object.fromEntries(
      (
        [
          'intrinsic',
          'derivedOrExternalField',
          'externalScenarioFact',
          'target',
          'procOrQuantity',
        ] as const
      ).map((kind) => [kind, inventory.filter(({ kinds }) => kinds.includes(kind)).length]),
    );
    const field = inventory.filter(({ fields }) => fields.length > 0);
    expect(inventory).toHaveLength(73);
    expect(byKind).toEqual({
      intrinsic: 42,
      derivedOrExternalField: 26,
      externalScenarioFact: 12,
      target: 5,
      procOrQuantity: 2,
    });
    expect(field).toHaveLength(26);
    expect(new Set(field.map(({ servantId }) => servantId)).size).toBe(24);
    expect(field.map(({ servantId, occurrenceId }) => `${servantId}:${occurrenceId}`).sort())
      .toMatchInlineSnapshot(`
        [
          "100500:3370:0",
          "100700:959:0",
          "105000:959:0",
          "105400:9148:0",
          "1100700:7905:0",
          "1102300:23580:0",
          "204600:8875:0",
          "2300500:8988:0",
          "2501300:21182:0",
          "2800900:22430:0",
          "2801000:22552:0",
          "305500:7616:0",
          "402400:9158:0",
          "403700:6010:0",
          "403700:6013:0",
          "403700:6022:0",
          "404500:7616:0",
          "405900:23569:0",
          "505100:8692:0",
          "505500:21680:0",
          "506000:23542:0",
          "601300:22390:0",
          "605000:21381:0",
          "702900:1622:0",
          "900400:984:0",
          "901400:9158:0",
        ]
      `);
  }, 120_000);
});
