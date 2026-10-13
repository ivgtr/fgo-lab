import { describe, expect, it } from 'vitest';
import { probeRawNiceIdentity, type RawNiceIdentityProbeInput } from './probeRawNiceIdentity';

function input(): RawNiceIdentityProbeInput {
  return {
    rawServants: [
      { id: 100, name: 'Servant', collectionNo: 1, type: 1 },
      { id: 900, name: 'Craft Essence', collectionNo: 2, type: 6 },
    ],
    rawMysticCodes: [{ id: 3, name: 'Mystic Code' }],
    rawMysticCodeSkills: [{ equipId: 3, num: 1, skillId: 701, condLv: 0 }],
    rawItems: [{ id: 10, name: 'Item' }],
    rawServantSkills: [
      { svtId: 100, skillId: 500, num: 1, priority: 1 },
      { svtId: 900, skillId: 501, num: 1, priority: 1 },
    ],
    rawServantNoblePhantasms: [{ svtId: 100, treasureDeviceId: 600, num: 1, priority: 1 }],
    rawFunctions: [{ id: 700 }],
    niceServants: [
      {
        id: 100,
        name: 'Servant',
        collectionNo: 1,
        skills: [{ id: 500, num: 1, priority: 1, functions: [{ funcId: 700 }] }],
        noblePhantasms: [{ id: 600, num: 1, priority: 1 }],
      },
    ],
    niceCraftEssences: [
      {
        id: 900,
        name: 'Craft Essence',
        collectionNo: 2,
        skills: [{ id: 501, num: 1, priority: 1 }],
      },
    ],
    niceMysticCodes: [{ id: 3, name: 'Mystic Code', skills: [{ id: 701 }] }],
    niceItems: [{ id: 10, name: 'Item' }],
    niceEnums: {
      NiceSvtType: {
        '1': 'normal',
        '2': 'heroine',
        '6': 'servantEquip',
        '9': 'enemyCollectionDetail',
      },
    },
  };
}

describe('raw/nice identity feasibility probe', () => {
  it('reports its limited scope when all primitive references exist', () => {
    expect(probeRawNiceIdentity(input())).toEqual({
      scope: 'identity-and-reference-existence-only',
      servants: 1,
      craftEssences: 1,
      mysticCodes: 1,
      items: 1,
      servantSkillReferences: 1,
      servantNoblePhantasmReferences: 1,
      craftEssenceSkillReferences: 1,
      mysticCodeSkillReferences: 1,
      distinctFunctionReferences: 1,
      rawSkillRowsForNiceServantsAbsentFromNice: 0,
      publishedServantsRequiredByRaw: 1,
      publishedCraftEssencesRequiredByRaw: 1,
      unnumberedServantsPublishedByAtlas: 0,
    });
  });

  it('rejects a nice function reference missing from the pinned raw source', () => {
    const candidate = input();
    candidate.rawFunctions = [{ id: 701 }];
    expect(() => probeRawNiceIdentity(candidate)).toThrow('source_probe:missing_raw_function:700');
  });

  it('rejects duplicate raw IDs before a Map can overwrite one', () => {
    const candidate = input();
    candidate.rawItems = [
      { id: 10, name: 'Item' },
      { id: 10, name: 'Other' },
    ];
    expect(() => probeRawNiceIdentity(candidate)).toThrow('source_probe:duplicate_id:mstItem:10');
  });

  it('rejects a published raw servant omitted by a partial nice export', () => {
    const candidate = input();
    candidate.rawServants = [
      ...(candidate.rawServants as object[]),
      { id: 101, name: 'New Servant', collectionNo: 3, type: 1 },
    ];
    expect(() => probeRawNiceIdentity(candidate)).toThrow(
      'source_probe:missing_published_servant:101',
    );
  });

  it('rejects a changed servant type catalog instead of shrinking the required roster', () => {
    const candidate = input();
    candidate.niceEnums = {
      NiceSvtType: {
        '1': 'unrecognized',
        '2': 'heroine',
        '6': 'servantEquip',
        '9': 'enemyCollectionDetail',
      },
    };
    expect(() => probeRawNiceIdentity(candidate)).toThrow(
      'raw_export_selection:changed_servant_type:1',
    );
  });

  it('rejects a craft essence skill missing from a partial nice export', () => {
    const candidate = input();
    candidate.niceCraftEssences = [{ id: 900, name: 'Craft Essence', collectionNo: 2, skills: [] }];
    expect(() => probeRawNiceIdentity(candidate)).toThrow(
      'source_probe:missing_published_equip_skill',
    );
  });
});
