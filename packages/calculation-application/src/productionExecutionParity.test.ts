import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type {
  EffectDecision,
  EffectProjection,
  WorldFactAssertion,
} from '@fgo-lab/battle-execution';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION, type CalculationScenario } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { applyEffectConditionDecision, applyEffectProjectionDecision } from './effectDecision';
import { createEffectControlViewModels } from './effectControls';
import { setEffectSourceEnabled } from './scenarioCommands';

const root = resolve(import.meta.dirname, '../../..');

function selectProjectionAlone(
  scenario: ReturnType<typeof createDefaultResolvedScenario>,
  projection: EffectProjection,
  peers: readonly EffectProjection[],
) {
  const sourceEnabled = setEffectSourceEnabled(scenario, projection, true);
  const withoutSiblings = createEffectControlViewModels(peers)
    .map((control) => control.projection)
    .filter(
      (peer) =>
        peer.projectionKey !== projection.projectionKey &&
        peer.source.origin === projection.source.origin &&
        peer.source.sourceInstanceId === projection.source.sourceInstanceId &&
        peer.source.skillId === projection.source.skillId &&
        peer.controllability === 'user',
    )
    .reduce((current, peer) => applyEffectProjectionDecision(current, peer, false), sourceEnabled);
  return withoutSiblings;
}

describe('production execution parity ratchet', () => {
  it('maps the 1,504 pre-migration inputs into the current explicit source contract', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const fixture = JSON.parse(
      gunzipSync(
        await readFile(
          resolve(
            root,
            'packages/test-fixtures/golden/pre-existing-calculated-scenarios-v1.json.gz',
          ),
        ),
      ).toString('utf8'),
    ) as {
      version: 1;
      cases: Array<{
        key: string;
        attackerId: string;
        effectDecisions: EffectDecision[];
        worldFactAssertions: WorldFactAssertion[];
      }>;
    };
    const records = fixture.cases.map((testCase) => {
      const servant = master.servants.find((candidate) => candidate.id === testCase.attackerId)!;
      let scenario: Extract<CalculationScenario, { mode: 'resolved' }> = {
        ...createDefaultResolvedScenario(master, undefined, servant),
        attackerHpPermille: null,
        battleState: { battlePointPhase: null },
        canonicalInputValues: {},
        effectDecisions: [],
        worldFactAssertions: testCase.worldFactAssertions,
      };
      for (const oldDecision of testCase.effectDecisions) {
        const before = calculateScenario(scenario, master, versions);
        const oldOccurrenceId = oldDecision.decisionKey.split(':').slice(-2).join(':');
        const projection =
          before.effects.find(
            (effect) =>
              effect.decision.state !== 'none' &&
              effect.decision.kind === 'effect' &&
              effect.decision.decisionKey === oldDecision.decisionKey,
          ) ??
          before.effects.find(
            (effect) =>
              effect.source.effectOccurrenceId === oldOccurrenceId &&
              effect.decision.state !== 'none' &&
              effect.decision.kind === 'effect' &&
              effect.decision.decisionKey.includes(':interaction:'),
          );
        if (!projection) throw new Error(`projection_missing:${testCase.key}`);
        scenario = selectProjectionAlone(scenario, projection, before.effects);
        const sourceEnabled = calculateScenario(scenario, master, versions);
        const current = sourceEnabled.effects.find(
          (effect) => effect.projectionKey === projection.projectionKey,
        )!;
        scenario = applyEffectProjectionDecision(scenario, current, oldDecision.operationEnabled);
        if (
          oldDecision.conditionSatisfaction === 'assumeSatisfied' &&
          projection.decision.state !== 'none' &&
          projection.decision.kind === 'effect' &&
          projection.decision.decisionKey === oldDecision.decisionKey
        )
          scenario = applyEffectConditionDecision(scenario, current, true, sourceEnabled.effects);
      }
      const calculation = calculateScenario(scenario, master, versions);
      expect(calculation.result.status, testCase.key).toBe('calculated');
      if (calculation.result.status !== 'calculated') throw new Error('exact result required');
      return { key: testCase.key, input: calculation.input, rows: calculation.result.rows };
    });

    expect(records).toHaveLength(1_504);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      'f2cd026c4b29bf83da41ffd9d343ead0ae8464b4badf335ad2501edbcb7b129d',
    );
  }, 120_000);

  it('reproduces every default attacking-NP scenario under the current decision contract', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const records = master.servants
      .filter((servant) => servant.noblePhantasms.some((np) => np.damage.length > 0))
      .map((servant) => {
        const calculation = calculateScenario(
          createDefaultResolvedScenario(master, undefined, servant),
          master,
          versions,
        );
        expect(calculation.result.status, `${servant.id}:${servant.name}`).toBe('calculated');
        if (calculation.result.status !== 'calculated') throw new Error('exact result required');
        return {
          attackerId: servant.id,
          input: calculation.input,
          rows: calculation.result.rows,
        };
      });

    expect(records).toHaveLength(420);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      '9d67d4d84b715e3f2eda8f5ed317496c1df69d175982f25c09e732280f7a3603',
    );
  }, 60_000);
});
