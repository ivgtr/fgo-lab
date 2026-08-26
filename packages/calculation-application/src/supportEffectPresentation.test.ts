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
                  id: 'attack-up',
                  occurrenceId: 'attack-up:0',
                  type: 'addStateShort',
                  target: 'ptOne',
                  label: '攻撃力アップ',
                  parameterSets: [
                    Array.from({ length: 10 }, () => ({ Value: 200 })),
                    [],
                    [],
                    [],
                    [],
                  ],
                  buffTypes: ['upAtk'],
                  conditions,
                  contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
                  cardTypes: [],
                },
                {
                  id: 'critical-only',
                  occurrenceId: 'critical-only:0',
                  type: 'addStateShort',
                  target: 'ptOne',
                  label: 'クリティカル威力アップ',
                  parameterSets: [
                    Array.from({ length: 10 }, () => ({ Value: 500 })),
                    [],
                    [],
                    [],
                    [],
                  ],
                  buffTypes: ['upCriticaldamage'],
                  conditions,
                  contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
                  cardTypes: [],
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
