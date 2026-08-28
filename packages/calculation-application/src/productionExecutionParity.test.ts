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
import {
  applyEffectConditionDecision,
  applyEffectControlPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
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
    const legacyClassByTrait = {
      classAlterEgo: 'alterEgo',
      classMoonCancer: 'moonCancer',
    } as const;
    const legacyAttributeByTrait = {
      attributeHuman: 'man',
      attributeStar: 'star',
    } as const;
    const legacySemanticTraits = new Set([
      ...Object.keys(legacyClassByTrait),
      ...Object.keys(legacyAttributeByTrait),
    ]);
    const records = fixture.cases.map((testCase) => {
      const servant = master.servants.find((candidate) => candidate.id === testCase.attackerId)!;
      const classIdentity = testCase.worldFactAssertions
        .filter(({ fact }) => fact.kind === 'trait' && fact.scope === 'target' && fact.present)
        .flatMap(({ fact }) =>
          fact.kind === 'trait'
            ? [legacyClassByTrait[fact.trait as keyof typeof legacyClassByTrait]].filter(Boolean)
            : [],
        )[0];
      const attributeIdentity = testCase.worldFactAssertions
        .filter(({ fact }) => fact.kind === 'trait' && fact.scope === 'target' && fact.present)
        .flatMap(({ fact }) =>
          fact.kind === 'trait'
            ? [legacyAttributeByTrait[fact.trait as keyof typeof legacyAttributeByTrait]].filter(
                Boolean,
              )
            : [],
        )[0];
      const initial = createDefaultResolvedScenario(master, undefined, servant);
      let scenario: Extract<CalculationScenario, { mode: 'resolved' }> = {
        ...initial,
        targetContext: {
          ...initial.targetContext,
          class: classIdentity
            ? { kind: 'concrete', classId: classIdentity }
            : initial.targetContext.class,
          attribute: attributeIdentity
            ? { kind: 'concrete', attribute: attributeIdentity }
            : initial.targetContext.attribute,
        },
        attackerHpPermille: null,
        battleState: { battlePointPhase: null },
        canonicalInputValues: {},
        effectDecisions: [],
        worldFactAssertions: testCase.worldFactAssertions.filter(
          ({ fact }) =>
            fact.kind !== 'trait' ||
            fact.scope !== 'target' ||
            !legacySemanticTraits.has(fact.trait),
        ),
      };
      for (const oldDecision of testCase.effectDecisions) {
        const before = calculateScenario(scenario, master, versions);
        const oldOccurrenceId = oldDecision.decisionKey.split(':').slice(-2).join(':');
        const projection =
          before.effects.find(
            (effect) =>
              effect.decision.state !== 'none' &&
              effect.decision.decisionKey === oldDecision.decisionKey,
          ) ??
          before.effects.find(
            (effect) =>
              effect.source.effectOccurrenceId === oldOccurrenceId &&
              effect.decision.state !== 'none' &&
              effect.decision.decisionKey.includes(':interaction:'),
          );
        if (!projection) throw new Error(`projection_missing:${testCase.key}`);
        if (projection.proc.kind === 'chainedRolls') {
          const control = before.effectControls.find(
            (candidate) => candidate.projection.projectionKey === projection.projectionKey,
          );
          if (!control) throw new Error(`chained_control_missing:${testCase.key}`);
          scenario = applyEffectControlPresentationDecision(
            scenario,
            control,
            oldDecision.operationEnabled,
            before.activationRequirements,
            before.effects,
            before.effectInputs,
          );
          continue;
        }
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
          scenario = applyEffectConditionDecision(
            scenario,
            current,
            true,
            sourceEnabled.activationRequirements,
            sourceEnabled.effects,
          );
      }
      const calculation = calculateScenario(scenario, master, versions);
      if (calculation.result.status === 'calculated')
        return { key: testCase.key, input: calculation.input, rows: calculation.result.rows };
      expect(calculation.effectWarnings, testCase.key).toEqual(
        expect.arrayContaining([expect.stringContaining('invalidTargetContext:')]),
      );
      return {
        key: testCase.key,
        status: calculation.result.status,
        targetIssues: calculation.effectWarnings.filter((warning) =>
          warning.startsWith('invalidTargetContext:'),
        ),
      };
    });

    expect(records).toHaveLength(1_504);
    expect(records.filter((record) => 'status' in record)).toEqual([]);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      'e754617b09edeacf9661fb95d7b814bfd178e07c1827d0df16224cd02ce33b77',
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
      'a469ff71f5c4a6171a7e4d20dcb4f8f77475a38fbb08f236e4e691214e94e5e9',
    );
  }, 60_000);
});
