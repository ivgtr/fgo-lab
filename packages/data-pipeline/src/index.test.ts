import { describe, expect, it } from 'vitest';
import {
  assertMasterVersionIdentity,
  createManifest,
  inventoryAtlasAttackFunctions,
  normalizeAtlasSnapshot,
  validatePublishedArtifact,
} from './index';
const content = JSON.stringify({ version: 'v1', servants: [], craftEssences: [], materials: [] });
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
      items: [],
    });
    expect(snapshot.servants[0]).toMatchObject({
      attribute: 'earth',
      skills: [{ id: '2', slot: 1, name: '強化後スキル' }],
      passives: [{ id: '3' }],
      npEffects: [{ id: '11', timing: 'beforeDamage' }],
      npMultipliers: [300, 400, 450, 475, 500],
      npSpecialAttack: {
        targetCondition: { anyOf: ['dragon'], noneOf: [] },
        multipliersByNpLevelAndOvercharge: [
          [1.5, 1.6, 1.7, 1.8, 1.9],
          [1.75, 1.85, 1.95, 2.05, 2.15],
          [1.875, 1.975, 2.075, 2.175, 2.275],
          [1.938, 2.038, 2.138, 2.238, 2.338],
          [2, 2.1, 2.2, 2.3, 2.4],
        ],
      },
    });
    expect(snapshot.craftEssences[0]?.effects[0]).toMatchObject({ values: [600, 800] });
  });

  it('normalizes card enums and explicit Atlas conditions without label parsing', () => {
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
              card: '3',
              priority: 1,
              functions: [
                {
                  funcId: 12,
                  funcType: 'damageNpStateIndividualFix',
                  funcTargetType: 'enemy',
                  svals: [
                    { Value: 6000, Target: 3012, Correction: 1500 },
                    { Value: 8000, Target: 3012, Correction: 1500 },
                    { Value: 9000, Target: 3012, Correction: 1500 },
                    { Value: 9500, Target: 3012, Correction: 1500 },
                    { Value: 10000, Target: 3012, Correction: 1500 },
                  ],
                  svals2: Array(5).fill({ Correction: 1625 }),
                  svals3: Array(5).fill({ Correction: 1750 }),
                  svals4: Array(5).fill({ Correction: 1875 }),
                  svals5: Array(5).fill({ Correction: 2000 }),
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
              card: '1',
              functions: [
                {
                  funcId: 1,
                  funcType: 'damageNp',
                  funcTargetType: 'enemy',
                  svals: Array(5).fill({ Value: 1000 }),
                },
              ],
            },
          ],
        },
      ],
      equips: [],
      items: [],
    });

    const lilith = snapshot.servants.find((servant) => servant.id === '405900');
    expect(lilith).toMatchObject({
      npCard: 'quick',
      npSpecialAttack: {
        targetCondition: { anyOf: ['buffCharm'], noneOf: [] },
        multipliersByNpLevelAndOvercharge: [
          [1.5, 1.625, 1.75, 1.875, 2],
          [1.5, 1.625, 1.75, 1.875, 2],
          [1.5, 1.625, 1.75, 1.875, 2],
          [1.5, 1.625, 1.75, 1.875, 2],
          [1.5, 1.625, 1.75, 1.875, 2],
        ],
      },
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
    expect(snapshot.servants.find((servant) => servant.id === '1')?.npCard).toBe('arts');
  });
});
