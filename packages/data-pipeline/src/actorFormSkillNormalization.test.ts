import { describe, expect, it } from 'vitest';
import { activeSkills, availableInForm } from './actorFormSkillNormalization';

const form = { actorId: '100', limitCount: 1 };
const owner = { actorId: 100, num: 1, priority: 2 };

function release(condType: string, condGroup: number, condTargetId: number, condNum: number) {
  return { condType, condGroup, condTargetId, condNum };
}

describe('owner-scoped release conditions', () => {
  it('uses only the exact servant, slot and priority association', () => {
    const skillSvts = [
      {
        svtId: 200,
        num: 1,
        priority: 2,
        releaseConditions: [release('equipWithTargetCostume', 0, 200, 11)],
      },
      { svtId: 100, num: 1, priority: 2, releaseConditions: [] },
    ];
    expect(availableInForm(skillSvts, form, owner)).toBe(true);
    const actor = {
      id: 100,
      skills: [
        { id: 1, num: 1, priority: 1, skillSvts: [] },
        { id: 2, num: 1, priority: 2, skillSvts },
      ],
    };
    expect(activeSkills(actor, form).map(({ id }) => id)).toEqual([2]);
  });

  it('requires all conditions in one group and accepts an alternate group', () => {
    const association = [
      {
        svtId: 100,
        num: 1,
        priority: 2,
        releaseConditions: [
          release('questClear', 1, 900, 1),
          release('equipWithTargetCostume', 1, 100, 11),
          release('questClear', 2, 901, 1),
          release('svtLimit', 2, 100, 3),
        ],
      },
    ];
    expect(availableInForm(association, form, owner)).toBe(true);
    expect(
      availableInForm(
        association.slice(0, 1).map((value) => ({
          ...value,
          releaseConditions: value.releaseConditions.slice(0, 2),
        })),
        form,
        owner,
      ),
    ).toBe(false);
  });

  it('rejects unknown release vocabulary and missing owner', () => {
    const association = [
      {
        svtId: 100,
        num: 1,
        priority: 2,
        releaseConditions: [release('newCondition', 0, 100, 1)],
      },
    ];
    expect(() => availableInForm(association, form, owner)).toThrow(
      'unsupported_release_condition',
    );
    expect(() => availableInForm(association, form, { ...owner, priority: 3 })).toThrow(
      'ambiguous_release_owner',
    );
    expect(() =>
      availableInForm(
        [
          {
            ...association[0]!,
            releaseConditions: [
              release('equipWithTargetCostume', 0, 100, 11),
              release('svtLimit', 0, 200, 3),
            ],
          },
        ],
        form,
        owner,
      ),
    ).toThrow('foreign_svt_limit');
  });
});
