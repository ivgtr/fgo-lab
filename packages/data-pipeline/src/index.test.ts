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
                  svals: [3000, 4000, 4500, 4750, 5000].map((Value) => ({
                    Value,
                    Target: 2002,
                    Correction: 1500,
                  })),
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
        multipliersByOvercharge: [1.5, 1, 1, 1, 1],
      },
    });
    expect(snapshot.craftEssences[0]?.effects[0]).toMatchObject({ values: [600, 800] });
  });
});
