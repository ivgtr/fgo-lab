import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import {
  applyEffectConditionDecision,
  applyEffectControlPresentationDecision,
  applyEffectPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
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
              skills: [{ skillId: '20', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [],
        },
      },
    };
    const projection: EffectProjection = {
      projectionKey: 'support:1:20:200:0',
      operationId: 'support:1:20:200:0:modifier',
      label: '攻撃力アップ',
      sourceName: 'support',
      skillName: 'skill',
      gameActivation: 'skillUse',
      sourceActive: true,
      proc: { kind: 'guaranteed' },
      procRatePermille: 1_000,
      valuePermille: 200,
      value: 0.2,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'attackBuff',
      source: {
        origin: 'support',
        sourceInstanceId: 'support:1',
        sourceId: '2',
        skillId: '20',
        effectId: '200',
        effectOccurrenceId: '200:0',
      },
      contributionScope: 'external',
      activationSources: [],
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: [],
      decision: {
        state: 'disabled',
        decisionKey: 'support:1:20:200:0',
        kind: 'effect',
        plan: { activation: 'user', condition: 'evaluate' },
      },
      conditionDecision: 'none',
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
    expect(enabledAgain.support?.composition.effectInclusions).toEqual([]);
    expect(disabled.support?.composition.effectInclusions).toEqual([
      {
        sourceInstanceId: 'support:1',
        skillId: '20',
        effectId: '200',
        effectOccurrenceId: '200:0',
        included: false,
      },
    ]);
    expect(disabled.effectDecisions).toEqual([
      {
        decisionKey: projection.projectionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      },
    ]);
  });

  it('keeps inclusion independent while replacing an exclusive condition decision', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const baseProjection: EffectProjection = {
      projectionKey: 'effect:sky',
      operationId: 'operation:sky',
      label: '対天',
      sourceName: 'source',
      skillName: 'skill',
      gameActivation: 'skillUse',
      sourceActive: true,
      proc: { kind: 'guaranteed' },
      procRatePermille: 1_000,
      valuePermille: 500,
      value: 0.5,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'powerMod',
      source: {
        origin: 'attacker',
        sourceInstanceId: 'attacker:1',
        sourceId: '1',
        skillId: 'skill',
        effectId: 'sky',
        effectOccurrenceId: 'sky:0',
      },
      contributionScope: 'personal',
      activationSources: [],
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: [{ groupKey: 'trait:target:worldAttribute', candidateKey: 'attributeSky' }],
      decision: {
        state: 'disabled',
        decisionKey: 'effect:sky',
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
      conditionDecision: 'evaluate',
      explanation: {
        code: 'disabled',
        condition: { kind: 'trait', scope: 'target', trait: 'attributeSky', present: true },
      },
    };
    const earth: EffectProjection = {
      ...baseProjection,
      projectionKey: 'effect:earth',
      operationId: 'operation:earth',
      label: '対地',
      selectionGroups: [
        { groupKey: 'trait:target:worldAttribute', candidateKey: 'attributeEarth' },
      ],
      decision: {
        state: 'disabled',
        decisionKey: 'effect:earth',
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
      explanation: {
        code: 'disabled',
        condition: { kind: 'trait', scope: 'target', trait: 'attributeEarth', present: true },
      },
    };
    const skyIncluded = applyEffectProjectionDecision(scenario, baseProjection, true);
    const skySelected = applyEffectConditionDecision(
      skyIncluded,
      baseProjection,
      true,
      [],
      [baseProjection, earth],
    );
    const earthIncluded = applyEffectProjectionDecision(skySelected, earth, true);
    const earthSelected = applyEffectConditionDecision(
      earthIncluded,
      earth,
      true,
      [],
      [baseProjection, earth],
    );

    expect(earthSelected.effectDecisions).toEqual([
      {
        decisionKey: 'effect:sky',
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      },
      {
        decisionKey: 'effect:earth',
        operationEnabled: true,
        conditionSatisfaction: 'assumeSatisfied',
      },
    ]);

    const skillScenario = {
      ...scenario,
      attackerSkills: [
        ...scenario.attackerSkills,
        { skillId: 'skill', skillLevel: 10 },
        { skillId: 'prerequisite', skillLevel: 10 },
      ],
    };
    const projectionWithPrerequisite: EffectProjection = {
      ...baseProjection,
      activationSources: [
        {
          origin: 'attacker',
          sourceInstanceId: 'attacker:1',
          sourceId: '1',
          skillId: 'prerequisite',
          effectId: 'mutation',
          effectOccurrenceId: 'mutation:0',
        },
      ],
    };
    const compactSky = applyEffectPresentationDecision(
      skillScenario,
      projectionWithPrerequisite,
      true,
      [],
      [projectionWithPrerequisite, earth],
    );
    const compactEarth = applyEffectPresentationDecision(
      compactSky,
      earth,
      true,
      [],
      [baseProjection, earth],
    );
    expect(compactEarth.attackerSkills).toEqual(skillScenario.attackerSkills);
    expect(compactEarth.effectDecisions).toEqual([
      {
        decisionKey: 'effect:sky',
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      },
      {
        decisionKey: 'effect:earth',
        operationEnabled: true,
        conditionSatisfaction: 'assumeSatisfied',
      },
    ]);

    const compactEarthOff = applyEffectPresentationDecision(
      compactEarth,
      earth,
      false,
      [],
      [baseProjection, earth],
    );
    expect(compactEarthOff.attackerSkills).toEqual(skillScenario.attackerSkills);
    expect(compactEarthOff.effectDecisions.at(-1)).toEqual({
      decisionKey: 'effect:earth',
      operationEnabled: false,
      conditionSatisfaction: 'evaluate',
    });
  });

  it('routes chained proc controls through source dependencies without a second decision state', () => {
    const base = createDefaultResolvedScenario(master, undefined);
    const scenario = {
      ...base,
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support:chain',
              servantId: '2',
              skills: [
                { skillId: 'chain', skillLevel: 10, enabled: false },
                { skillId: 'prerequisite', skillLevel: 10, enabled: false },
              ],
            },
          ],
          effectInclusions: [],
        },
      },
    };
    const inputKey = 'support:support:chain:chain:chain:0:activation:proc:chain:0';
    const projection: EffectProjection = {
      projectionKey: 'support:chain:chain:chain:0:interaction:proc',
      operationId: 'support:chain:chain:chain:0:modifier',
      label: '攻撃力アップ',
      sourceName: 'support',
      skillName: 'chain skill',
      gameActivation: 'skillUse',
      sourceActive: false,
      proc: {
        kind: 'chainedRolls',
        ratePermille: [
          Array<number>(10).fill(800),
          Array<number>(10).fill(800),
          Array<number>(10).fill(800),
          Array<number>(10).fill(800),
          Array<number>(10).fill(800),
        ],
        seriesKey: inputKey,
        index: 0,
        maximumSuccesses: 5,
      },
      procRatePermille: 800,
      valuePermille: 500,
      value: 0.5,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [
        {
          key: inputKey,
          kind: 'procSuccessCount',
          owner: 'attacker',
          label: '成功回数',
          description: 'test',
          minimum: 0,
          maximum: 5,
          step: 1,
          defaultValue: 0,
          defaultReason: 'source inactive',
        },
      ],
      modifier: 'attackBuff',
      source: {
        origin: 'support',
        sourceInstanceId: 'support:chain',
        sourceId: '2',
        skillId: 'chain',
        effectId: 'chain',
        effectOccurrenceId: 'chain:0',
      },
      contributionScope: 'external',
      activationSources: [
        {
          origin: 'support',
          sourceInstanceId: 'support:chain',
          sourceId: '2',
          skillId: 'prerequisite',
          effectId: 'mutation',
          effectOccurrenceId: 'mutation:0',
        },
      ],
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: [],
      decision: {
        state: 'disabled',
        decisionKey: projectionKeyForTest(),
        kind: 'effect',
        plan: { activation: 'user', condition: 'evaluate' },
      },
      conditionDecision: 'none',
      explanation: { code: 'disabled', condition: null },
    };
    const control = {
      key: projection.projectionKey,
      projection,
      operationIds: [projection.operationId],
      interaction: 'toggle' as const,
      active: false,
      valueDisplay: 'sum' as const,
      presentationState: 'sourceInactive' as const,
    };
    const input = {
      key: inputKey,
      kind: 'procSuccessCount' as const,
      owner: 'attacker' as const,
      label: '成功回数',
      description: 'test',
      control: 'stepper' as const,
      minimum: 0,
      maximum: 5,
      step: 1,
      value: 0,
      defaultValue: 0,
      defaultReason: 'source inactive',
      explicit: false,
      invalid: false,
      section: 'support' as const,
      relatedProjectionKeys: [projection.projectionKey],
      relatedEffectLabels: [projection.label],
    };

    expect(() => applyEffectPresentationDecision(scenario, projection, true, [])).toThrow(
      'chained_proc_requires_control_command',
    );
    const enabled = applyEffectControlPresentationDecision(
      scenario,
      control,
      true,
      [],
      [projection],
      [input],
    );
    expect(enabled.support?.composition.sources[0]?.skills).toEqual([
      { skillId: 'chain', skillLevel: 10, enabled: true },
      { skillId: 'prerequisite', skillLevel: 10, enabled: true },
    ]);
    expect(enabled.canonicalInputValues[inputKey]).toEqual({ kind: 'integer', value: 5 });
    expect(enabled.effectDecisions).toEqual([]);
  });
});

function projectionKeyForTest() {
  return 'support:chain:chain:chain:0:interaction:proc';
}
