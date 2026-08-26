import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import { applyEffectProjectionDecision } from './effectDecision';
import { createDefaultResolvedScenario } from './scenario';

const master = masterSnapshotSchema.parse(fixture);

describe('effect decision application command', () => {
  it('updates the support decision and its saved selection reference atomically', () => {
    const base = createDefaultResolvedScenario(master, undefined);
    const scenario = {
      ...base,
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support:1',
              servantId: '2',
              skills: [{ skillId: '20', skillLevel: 10 }],
            },
          ],
          selectedEffects: [],
        },
      },
    };
    const projection: EffectProjection = {
      projectionKey: 'support:1:20:200:0',
      operationId: 'support:1:20:200:0:modifier',
      label: '攻撃力アップ',
      sourceName: 'support',
      skillName: 'skill',
      valuePermille: 200,
      value: 0.2,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      modifier: 'attackBuff',
      source: {
        origin: 'support',
        sourceInstanceId: 'support:1',
        sourceId: '2',
        skillId: '20',
        effectId: '200',
        effectOccurrenceId: '200:0',
      },
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      decision: {
        state: 'disabled',
        decisionKey: 'support:1:20:200:0',
        kind: 'effect',
        plan: { activation: 'user', condition: 'evaluate' },
      },
      explanation: { code: 'disabled', condition: null },
    };

    const enabled = applyEffectProjectionDecision(scenario, projection, true);
    const enabledAgain = applyEffectProjectionDecision(enabled, projection, true);
    const disabled = applyEffectProjectionDecision(enabledAgain, projection, false);

    expect(enabled.effectDecisions).toEqual([
      {
        decisionKey: projection.projectionKey,
        operationEnabled: true,
        conditionSatisfaction: 'evaluate',
      },
    ]);
    expect(enabledAgain.support?.composition.selectedEffects).toEqual([
      {
        sourceInstanceId: 'support:1',
        skillId: '20',
        effectId: '200',
        effectOccurrenceId: '200:0',
      },
    ]);
    expect(disabled.support?.composition.selectedEffects).toEqual([]);
    expect(disabled.effectDecisions).toEqual([
      {
        decisionKey: projection.projectionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      },
    ]);
  });
});
