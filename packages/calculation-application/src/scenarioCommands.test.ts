import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import { createDefaultResolvedScenario } from './scenario';
import {
  appendCalculationSupportSource,
  removeCalculationSupportSource,
  setCalculationSupportSkillLevel,
} from './scenarioCommands';

const master = masterSnapshotSchema.parse(fixture);

describe('resolved scenario commands', () => {
  it('keeps support source, decisions, facts, and saved references consistent', () => {
    const base = createDefaultResolvedScenario(master, undefined);
    const added = appendCalculationSupportSource(base, {
      sourceInstanceId: 'support:1',
      servantId: '2',
      skills: [{ skillId: '20', skillLevel: 1, enabled: true }],
    });
    const configured = setCalculationSupportSkillLevel(added, 'support:1', '20', 10);
    const scenario = {
      ...configured,
      effectDecisions: [
        {
          decisionKey: 'support:projection',
          operationEnabled: true,
          conditionSatisfaction: 'assumeSatisfied' as const,
        },
      ],
      worldFactAssertions: [
        {
          decisionKey: 'support:projection',
          fact: {
            kind: 'trait' as const,
            scope: 'target' as const,
            trait: 'dragon',
            present: true,
          },
        },
      ],
      support: {
        ...configured.support!,
        composition: {
          ...configured.support!.composition,
          effectInclusions: [
            {
              sourceInstanceId: 'support:1',
              skillId: '20',
              effectId: '200',
              effectOccurrenceId: '200:0',
              included: false as const,
            },
          ],
        },
      },
    };
    const projection = {
      projectionKey: 'support:projection',
      source: { sourceInstanceId: 'support:1' },
    } as EffectProjection;

    const removed = removeCalculationSupportSource(scenario, 'support:1', [projection]);

    expect(configured.support?.composition.sources[0]?.skills[0]?.skillLevel).toBe(10);
    expect(removed.support?.composition).toEqual({ sources: [], effectInclusions: [] });
    expect(removed.effectDecisions).toEqual([]);
    expect(removed.worldFactAssertions).toEqual([]);
  });
});
