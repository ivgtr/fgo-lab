import { describe, expect, it } from 'vitest';
import {
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
            { condLimitCount: 4, priority: 2, functions: [effect(20, '宝具威力アップ', 800)] },
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
        targetTraits: ['dragon'],
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
});
