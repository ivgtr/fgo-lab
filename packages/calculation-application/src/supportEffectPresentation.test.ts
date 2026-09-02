import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  supportDamageEffectSummary,
  supportDamageSkillViews,
  supportEffectOptions,
} from './supportEffectPresentation';

const effectContract = {
  inclusionPolicy: { default: 'exclude' as const },
  gameActivation: 'skillUse' as const,
  proc: { kind: 'guaranteed' as const },
  selection: null,
  interaction: null,
  triggerScope: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  inputDefinitions: [],
  atlasEvidence: {
    functionType: 'addStateShort',
    target: 'ptOne',
    parameterSets: [[], [], [], [], []],
    parameterSemantics: {
      value: [],
      lifecycle: [],
      presentation: [],
      condition: [],
      contextMutation: [],
      choice: [],
      valueExpression: [],
      buffIdentity: [],
      unresolved: [],
    },
    unresolvedSemanticKeys: [],
    buffTypes: [],
    buffRateTargets: [],
    buffConditionKeys: [],
  },
};

describe('support effect application view model', () => {
  it('keeps runtime routing inside calculation-application', () => {
    const base = masterSnapshotSchema.parse(fixture).servants[0]!;
    const servant = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...base,
          skills: [
            {
              id: 'support-skill',
              slot: 1,
              priority: 1,
              name: '支援火力',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [
                {
                  ...effectContract,
                  id: 'attack-up',
                  occurrenceId: 'attack-up:0',
                  availability: 'allLimitBreakStates',
                  label: '攻撃力アップ',
                  requirement: { recipient: 'partyMember', expression: { kind: 'always' } },
                  execution: [
                    {
                      kind: 'damageModifier',
                      modifier: 'attackBuff',
                      sign: 1,
                      route: {
                        target: 'partyMember',
                        contributionScope: 'partyWide',
                        eligibility: {
                          kind: 'requiredRecipient',
                          recipient: 'attacker',
                          onMissing: 'ignore',
                          onMismatch: 'unsupported',
                        },
                      },
                      card: null,
                      values: [Array.from({ length: 10 }, () => 200), [], [], [], []],
                      valueExpressions: [[], [], [], [], []],
                      semanticSupport: 'supported',
                    },
                  ],
                },
                {
                  ...effectContract,
                  id: 'critical-only',
                  occurrenceId: 'critical-only:0',
                  availability: 'allLimitBreakStates',
                  label: 'クリティカル威力アップ',
                  requirement: { recipient: 'partyMember', expression: { kind: 'always' } },
                  execution: [{ kind: 'boundedPhaseIrrelevant', proof: 'noBattleStateChange' }],
                },
              ],
            },
          ],
        },
      ],
    }).servants[0]!;
    const source = {
      sourceInstanceId: 'support:1',
      servantId: servant.id,
      skills: [{ skillId: 'support-skill', skillLevel: 10, enabled: true }],
    };
    const composition = { sources: [source], effectInclusions: [] };

    expect(supportEffectOptions(composition, [servant])).toEqual([
      expect.objectContaining({ label: '攻撃力アップ', skillLevel: 10 }),
    ]);
    expect(supportDamageSkillViews(source, servant)).toEqual([
      expect.objectContaining({ effectLabels: ['攻撃力アップ'] }),
    ]);
    expect(supportDamageEffectSummary(servant, 'support-skill')).toBe('攻撃力アップ');
  });
});
