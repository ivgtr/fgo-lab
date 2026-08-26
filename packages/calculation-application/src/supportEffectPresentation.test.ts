import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  supportDamageEffectSummary,
  supportDamageSkillViews,
  supportEffectOptions,
} from './supportEffectPresentation';

const conditions = {
  recipient: [{ operator: 'any' as const, traits: [] }],
  holder: { operator: 'any' as const, traits: [] },
  opponent: { operator: 'any' as const, traits: [] },
  field: { operator: 'any' as const, traits: [] },
};
const effectContract = {
  choice: null,
  triggerScope: null,
  operationTrigger: null,
  quantityConditions: [],
  sourceQuantityConditions: [],
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
              effects: [
                {
                  ...effectContract,
                  id: 'attack-up',
                  occurrenceId: 'attack-up:0',
                  label: '攻撃力アップ',
                  conditions,
                  conditionTargetPolicy: 'partyMember',
                  execution: [
                    {
                      kind: 'damageModifier',
                      modifier: 'attackBuff',
                      sign: 1,
                      targetPolicy: 'partyMember',
                      expectedRecipient: 'attacker',
                      targetMismatch: 'unsupported',
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
                  label: 'クリティカル威力アップ',
                  conditions,
                  conditionTargetPolicy: 'partyMember',
                  execution: [{ kind: 'nonDamage' }],
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
      skills: [{ skillId: 'support-skill', skillLevel: 10 }],
    };
    const composition = { sources: [source], selectedEffects: [] };

    expect(supportEffectOptions(composition, [servant])).toEqual([
      expect.objectContaining({ label: '攻撃力アップ', skillLevel: 10 }),
    ]);
    expect(supportDamageSkillViews(source, servant)).toEqual([
      expect.objectContaining({ effectLabels: ['攻撃力アップ'] }),
    ]);
    expect(supportDamageEffectSummary(servant, 'support-skill')).toBe('攻撃力アップ');
  });
});
