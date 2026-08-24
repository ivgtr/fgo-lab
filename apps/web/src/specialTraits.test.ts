import { describe, expect, it } from 'vitest';
import fixture from '../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createDefaultCalcInput } from './calculation';
import { collectSpecialTraitCandidates } from './specialTraits';

const master = masterSnapshotSchema.parse(fixture);

describe('special trait candidates', () => {
  it('combines resolvable sources and hides internal trait markers', () => {
    const base = master.servants[0]!;
    const attacker = {
      ...base,
      skills: [
        {
          id: 'skill-1',
          slot: 1,
          priority: 0,
          name: '竜特攻付与',
          detail: '',
          imageKey: null,
          effects: [
            {
              id: 'dragon-power',
              type: 'buff',
              target: 'self',
              label: '威力アップ・対竜',
              values: [300],
              targetTraits: ['dragon'],
              buffTypes: ['upDamage'],
            },
            {
              id: 'internal',
              type: 'buff',
              target: 'self',
              label: '内部条件',
              values: [100],
              targetTraits: ['trait:internal'],
              buffTypes: ['upDamage'],
            },
          ],
        },
      ],
    };
    const candidates = collectSpecialTraitCandidates({
      input: createDefaultCalcInput(master, undefined, attacker),
      attacker,
      craftEssence: undefined,
      selection: {
        attackerSource: 'master',
        craftEssence: null,
        attackerSkills: [{ skillId: 'skill-1', skillLevel: 1, enabled: true }],
      },
      support: undefined,
      servants: [attacker],
    });
    expect(candidates).toEqual([
      {
        trait: 'dragon',
        label: '竜',
        sources: [
          {
            key: 'attacker:skill-1:dragon-power',
            name: '竜特攻付与',
            imageKey: null,
            valueLabel: '+30%',
          },
        ],
      },
    ]);
  });
});
