import { describe, expect, it } from 'vitest';
import { probeRawNiceVocabulary, type RawNiceVocabularyProbeInput } from './probeRawNiceVocabulary';

function input(): RawNiceVocabularyProbeInput {
  return {
    rawServants: [{ id: 100, type: 1, classId: 3, attri: 1, individuality: [20, -30] }],
    rawItems: [{ id: 10, type: 1, priority: 7 }],
    rawFunctions: [
      {
        id: 700,
        funcType: 1,
        targetType: 0,
        applyTarget: 1,
        popupText: '',
        tvals: [-30],
        questTvals: [],
        vals: [800],
      },
    ],
    rawBuffs: [
      {
        id: 800,
        type: 4,
        name: 'Buff',
        buffGroup: 0,
        maxRate: 1000,
        vals: [],
        tvals: [20],
        ckSelfIndv: [],
        ckOpIndv: [],
      },
    ],
    niceServants: [
      {
        id: 100,
        type: 'normal',
        className: 'lancer',
        attribute: 'human',
        traits: [{ id: 20 }, { id: 30, negative: true }],
        skills: [
          {
            functions: [
              {
                funcId: 700,
                funcType: 'addState',
                funcTargetType: 'self',
                funcTargetTeam: 'player',
                funcPopupText: '',
                functvals: [{ id: 30, negative: true }],
                funcquestTvals: [],
                buffs: [
                  {
                    id: 800,
                    type: 'downCriticalpoint',
                    name: 'Buff',
                    buffGroup: 0,
                    maxRate: 1000,
                    vals: [],
                    tvals: [{ id: 20 }],
                    ckSelfIndv: [],
                    ckOpIndv: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    niceCraftEssences: [],
    niceMysticCodes: [],
    niceItems: [{ id: 10, type: 'qp', priority: 7 }],
    niceEnums: {
      NiceSvtType: { '1': 'normal' },
      SvtClass: { '3': 'lancer' },
      Attribute: { '1': 'human' },
      NiceFuncType: { '1': 'addState' },
      NiceFuncTargetType: { '0': 'self' },
      FuncApplyTarget: { '1': 'player' },
      NiceBuffType: { '4': 'downCriticalpoint' },
      NiceItemType: { '1': 'qp' },
    },
  };
}

describe('raw/nice vocabulary feasibility probe', () => {
  it('compares signed traits and buff vocabulary', () => {
    expect(probeRawNiceVocabulary(input())).toEqual({
      scope: 'enum-trait-buff-and-item-vocabulary-only',
      servants: 1,
      craftEssences: 0,
      items: 1,
      distinctFunctions: 1,
      distinctBuffs: 1,
      nonBuffValueFunctions: 0,
    });
  });

  it('rejects a nice buff with a contradictory raw meaning', () => {
    const candidate = input();
    const servant = (candidate.niceServants as Record<string, unknown>[])[0]!;
    const skill = (servant.skills as Record<string, unknown>[])[0]!;
    const fn = (skill.functions as Record<string, unknown>[])[0]!;
    const buff = (fn.buffs as Record<string, unknown>[])[0]!;
    buff.type = 'upAtk';
    expect(() => probeRawNiceVocabulary(candidate)).toThrow('vocabulary_probe:mismatch');
  });
});
