import { describe, expect, it } from 'vitest';
import {
  assertMasterVersionIdentity,
  createManifest,
  inventoryAtlasAttackFunctions,
  normalizeAtlasSnapshot,
  validatePublishedArtifact,
} from './index';
const content = JSON.stringify({
  version: 'v1',
  normalization: { attackFunctions: { sourceCount: 0, includedCount: 0, excluded: [] } },
  servants: [],
  craftEssences: [],
  mysticCodes: [],
  materials: [],
});
describe('immutable publish pipeline', () => {
  it('creates and validates a checksum manifest', () => {
    const manifest = createManifest({
      masterDataVersion: 'v1',
      createdAt: '2026-08-24T00:00:00.000Z',
      retrievedAt: '2026-08-24T00:00:00.000Z',
      minimalAppVersion: '0.1.0',
      artifactKind: 'diagnostic',
      imagesEnabled: false,
      files: [{ key: 'master', file: 'master.json', content, required: true }],
    });
    expect(validatePublishedArtifact(manifest, { 'master.json': content })).toEqual({
      valid: true,
      errors: [],
    });
  });
  it('keeps active candidates fail-closed on checksum mismatch', () => {
    const manifest = createManifest({
      masterDataVersion: 'v1',
      createdAt: '2026-08-24T00:00:00.000Z',
      retrievedAt: '2026-08-24T00:00:00.000Z',
      minimalAppVersion: '0.1.0',
      artifactKind: 'diagnostic',
      imagesEnabled: false,
      files: [{ key: 'master', file: 'master.json', content, required: true }],
    });
    expect(validatePublishedArtifact(manifest, { 'master.json': `${content} ` }).valid).toBe(false);
  });
  it('rejects publishing different master content under an existing version', () => {
    const manifest = createManifest({
      masterDataVersion: 'v1',
      createdAt: '2026-08-24T00:00:00.000Z',
      retrievedAt: '2026-08-24T00:00:00.000Z',
      minimalAppVersion: '0.1.0',
      artifactKind: 'diagnostic',
      imagesEnabled: false,
      files: [{ key: 'master', file: 'master.json', content, required: true }],
    });
    const changed = createManifest({
      masterDataVersion: 'v1',
      createdAt: '2026-08-25T00:00:00.000Z',
      retrievedAt: '2026-08-25T00:00:00.000Z',
      minimalAppVersion: '0.1.0',
      artifactKind: 'diagnostic',
      imagesEnabled: false,
      files: [{ key: 'master', file: 'master.json', content: `${content} `, required: true }],
    });

    expect(() => assertMasterVersionIdentity(manifest, changed)).toThrow(
      'master_version_reused:v1',
    );
    expect(() => assertMasterVersionIdentity(manifest, manifest)).not.toThrow();
  });
  it('reports future damage functions instead of treating them as zero', () =>
    expect(
      inventoryAtlasAttackFunctions([
        {
          noblePhantasms: [
            { functions: [{ funcType: 'damageNp' }, { funcType: 'damageNpFuture' }] },
          ],
        },
      ]),
    ).toMatchObject({ attackEntries: 2, unknown: ['damageNpFuture'] }));
  it('keeps active skills, passive, NP timing, attribute, and CE effects', () => {
    const effect = (funcId: number, label: string, value: number) => ({
      funcId,
      funcType: 'addStateShort',
      funcTargetType: 'self',
      funcPopupText: label,
      svals: [{ Value: value }],
    });
    const specialValues = (corrections: readonly number[]) =>
      [3000, 4000, 4500, 4750, 5000].map((Value, index) => ({
        Rate: 1000,
        Value,
        Target: 2002,
        Correction: corrections[index],
      }));
    const snapshot = normalizeAtlasSnapshot({
      version: 'test',
      servants: [
        {
          id: 100100,
          collectionNo: 2,
          type: 'normal',
          name: '攻撃役',
          className: 'saber',
          attribute: 'earth',
          rarity: 5,
          atkGrowth: [1000],
          traits: [{ id: 2002, name: 'dragon' }],
          skills: [
            { id: 1, num: 1, priority: 1, name: '旧スキル', functions: [] },
            { id: 2, num: 1, priority: 2, name: '強化後スキル', functions: [] },
          ],
          classPassive: [
            { id: 3, num: 0, name: 'パッシブ', functions: [effect(10, 'バスターアップ', 80)] },
          ],
          noblePhantasms: [
            {
              id: 100,
              name: '攻撃宝具',
              card: '2',
              priority: 1,
              functions: [
                effect(11, '攻撃力アップ', 200),
                {
                  funcId: 12,
                  funcType: 'damageNpIndividual',
                  funcTargetType: 'enemyAll',
                  funcPopupText: 'なし',
                  svals: specialValues([1500, 1750, 1875, 1938, 2000]),
                  svals2: specialValues([1600, 1850, 1975, 2038, 2100]),
                  svals3: specialValues([1700, 1950, 2075, 2138, 2200]),
                  svals4: specialValues([1800, 2050, 2175, 2238, 2300]),
                  svals5: specialValues([1900, 2150, 2275, 2338, 2400]),
                },
              ],
            },
          ],
        },
      ],
      equips: [
        {
          id: 9400001,
          collectionNo: 1,
          name: '礼装',
          lvMax: 100,
          atkBase: 500,
          atkMax: 2000,
          skills: [
            { condLimitCount: 0, priority: 1, functions: [effect(20, '宝具威力アップ', 600)] },
            { condLimitCount: 4, priority: 2, functions: [effect(20, '変更後の表示名', 800)] },
          ],
        },
      ],
      mysticCodes: [],
      items: [],
    });
    expect(snapshot.servants[0]).toMatchObject({
      attribute: 'earth',
      skills: [{ id: '2', slot: 1, name: '強化後スキル' }],
      passives: [{ id: '3' }],
    });
    const noblePhantasm = snapshot.servants[0]?.noblePhantasms[0];
    expect(noblePhantasm).toMatchObject({
      id: '100',
      card: 'buster',
      effects: [{ id: '11', timing: 'beforeDamage' }],
    });
    expect(noblePhantasm?.damage[0]).toMatchObject({
      kind: 'trait',
      rawFunctionType: 'damageNpIndividual',
    });
    expect(noblePhantasm?.damage[0]?.parametersByOvercharge[0][0]).toMatchObject({
      ratePermille: 1000,
      valuePermille: 3000,
      correctionPermille: 1500,
      targetTrait: { id: 2002, name: 'dragon' },
    });
    expect(snapshot.craftEssences[0]?.effects[0]).toMatchObject({ values: [600, 800] });
  });

  it('normalizes card enums and explicit Atlas conditions without label parsing', () => {
    const stateDamageValues = (correction: number) =>
      [6000, 8000, 9000, 9500, 10000].map((Value) => ({
        Rate: 1000,
        Value,
        Target: 3012,
        Correction: correction,
      }));
    const standardDamageValues = () =>
      Array.from({ length: 5 }, () => ({ Rate: 1000, Value: 1000 }));
    const snapshot = normalizeAtlasSnapshot({
      version: 'conditions',
      servants: [
        {
          id: 405900,
          collectionNo: 458,
          type: 'normal',
          name: '水着リリス',
          className: 'rider',
          attribute: 'earth',
          rarity: 5,
          atkGrowth: [1000],
          traits: [],
          skills: [
            {
              id: 1,
              num: 1,
              name: '条件スキル',
              functions: [
                {
                  funcId: 10,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  funcPopupText: '任意の文言',
                  funcquestTvals: [{ id: 2884, name: 'fieldDarkness' }],
                  buffs: [
                    {
                      type: 'upDamage',
                      ckOpIndv: [{ id: 2076, name: 'superGiant', negative: true }],
                    },
                  ],
                  svals: Array(10).fill({ Value: 500 }),
                },
                {
                  funcId: 11,
                  funcType: 'addState',
                  funcTargetType: 'enemy',
                  funcPopupText: '魅了',
                  script: { funcIndividuality: [{ id: 3012, name: 'buffCharm' }] },
                  buffs: [{ type: 'charm', vals: [{ id: 3012, name: 'buffCharm' }] }],
                  svals: [{ Value: 0 }],
                },
                {
                  funcId: 13,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  funcPopupText: '表示名に依存しない色バフ',
                  buffs: [
                    {
                      type: 'upCommandall',
                      tvals: [{ id: 4002, name: 'cardBuster' }],
                      ckSelfIndv: [{ id: 4002, name: 'cardBuster' }],
                    },
                  ],
                  svals: Array(10).fill({ Value: 500 }),
                },
                {
                  funcId: 14,
                  funcType: 'addStateShort',
                  funcTargetType: 'ptOne',
                  funcPopupText: '宝具威力アップブースト',
                  buffs: [
                    {
                      type: 'buffRate',
                      script: {
                        UpBuffRateBuffIndiv: [{ id: 3030, name: 'buffNpDamageUp' }],
                      },
                    },
                  ],
                  svals: Array(10).fill({ Value: 1000 }),
                },
              ],
            },
          ],
          noblePhantasms: [
            {
              id: 200,
              name: '状態特攻宝具',
              card: '3',
              priority: 1,
              functions: [
                {
                  funcId: 12,
                  funcType: 'damageNpStateIndividualFix',
                  funcTargetType: 'enemy',
                  svals: stateDamageValues(1500),
                  svals2: stateDamageValues(1625),
                  svals3: stateDamageValues(1750),
                  svals4: stateDamageValues(1875),
                  svals5: stateDamageValues(2000),
                },
              ],
            },
          ],
        },
        {
          id: 1,
          collectionNo: 1,
          type: 'normal',
          name: 'Arts確認',
          className: 'caster',
          attribute: 'human',
          rarity: 1,
          atkGrowth: [1],
          noblePhantasms: [
            {
              id: 300,
              name: 'Arts宝具',
              card: '1',
              functions: [
                {
                  funcId: 1,
                  funcType: 'damageNp',
                  funcTargetType: 'enemy',
                  svals: standardDamageValues(),
                  svals2: standardDamageValues(),
                  svals3: standardDamageValues(),
                  svals4: standardDamageValues(),
                  svals5: standardDamageValues(),
                },
              ],
            },
          ],
        },
      ],
      equips: [],
      mysticCodes: [],
      items: [],
    });

    const lilith = snapshot.servants.find((servant) => servant.id === '405900');
    expect(lilith?.noblePhantasms[0]).toMatchObject({ card: 'quick' });
    expect(lilith?.noblePhantasms[0]?.damage[0]).toMatchObject({ kind: 'stateTrait' });
    expect(lilith?.noblePhantasms[0]?.damage[0]?.parametersByOvercharge[0][0]).toMatchObject({
      targetTrait: { id: 3012, name: 'buffCharm' },
      correctionPermille: 1500,
    });
    expect(lilith?.skills[0]?.effects[0]).toMatchObject({
      targetCondition: { anyOf: [], noneOf: ['superGiant'] },
      requiredFieldTraits: ['fieldDarkness'],
    });
    expect(lilith?.skills[0]?.effects.find((effect) => effect.id === '13')).toMatchObject({
      label: '表示名に依存しない色バフ',
      buffTypes: ['upCommandall'],
      cardTypes: ['buster'],
    });
    expect(lilith?.skills[0]?.effects.find((effect) => effect.id === '14')).toMatchObject({
      buffTypes: ['buffRate'],
      buffRateTargets: ['buffNpDamageUp'],
    });
    expect(snapshot.servants.find((servant) => servant.id === '1')?.noblePhantasms[0]?.card).toBe(
      'arts',
    );
  });

  it('normalizes mystic code skills through the shared effect model', () => {
    const snapshot = normalizeAtlasSnapshot({
      version: 'mystic-code',
      servants: [],
      equips: [],
      mysticCodes: [
        {
          id: 1,
          name: '魔術礼装･カルデア',
          maxLv: 10,
          extraAssets: { item: { male: 'master-equip.png' } },
          skills: [
            {
              id: 980002,
              name: '瞬間強化',
              detail: '味方単体の攻撃力を超アップ',
              icon: 'skill.png',
              functions: [
                {
                  funcId: 150,
                  funcType: 'addStateShort',
                  funcTargetType: 'ptOne',
                  funcPopupText: '攻撃力アップ',
                  buffs: [{ type: 'upAtk' }],
                  svals: Array.from({ length: 10 }, (_, index) => ({ Value: 300 + index * 20 })),
                },
              ],
            },
          ],
        },
      ],
      items: [],
    });

    expect(snapshot.mysticCodes).toEqual([
      {
        id: '1',
        name: '魔術礼装･カルデア',
        maxLevel: 10,
        imageKey: 'master-equip.png',
        skills: [
          expect.objectContaining({
            id: '980002',
            slot: 1,
            effects: [
              expect.objectContaining({
                id: '150',
                buffTypes: ['upAtk'],
                values: [300, 320, 340, 360, 380, 400, 420, 440, 460, 480],
              }),
            ],
          }),
        ],
      },
    ]);
  });
});
