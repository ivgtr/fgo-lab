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
  it('assigns distinct stable occurrences to repeated Function IDs', () => {
    const repeated = (value: number) => ({
      funcId: 248,
      funcType: 'addStateShort',
      funcTargetType: 'self',
      funcPopupText: '宝具威力アップ',
      svals: [{ Value: value }],
      buffs: [{ type: 'upNpdamage' }],
    });
    const snapshot = normalizeAtlasSnapshot({
      version: 'occurrence-test',
      servants: [
        {
          id: 100100,
          collectionNo: 1,
          type: 'normal',
          name: 'occurrence tester',
          className: 'saber',
          attribute: 'earth',
          rarity: 5,
          atkGrowth: [1_000],
          traits: [{ id: 2_038, name: 'fieldSunlight' }],
          skills: [
            {
              id: 100150,
              num: 1,
              priority: 1,
              name: 'field skill',
              functions: [
                {
                  funcId: 8_411,
                  funcType: 'addState',
                  funcTargetType: 'self',
                  svals: [{ Value: 2_038 }],
                  buffs: [{ type: 'fieldIndividuality' }],
                },
                {
                  funcId: 20_780,
                  funcType: 'addState',
                  funcTargetType: 'self',
                  svals: [{ TargetList: [2_038] }],
                  buffs: [{ type: 'subFieldIndividuality' }],
                },
              ],
            },
          ],
          noblePhantasms: [
            {
              id: 100101,
              name: 'test NP',
              card: 'buster',
              priority: 1,
              functions: [
                repeated(100),
                repeated(200),
                {
                  funcId: 13,
                  funcType: 'damageNp',
                  funcTargetType: 'enemyAll',
                  svals: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                  svals2: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                  svals3: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                  svals4: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                  svals5: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
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

    expect(snapshot.servants[0]?.noblePhantasms[0]?.effects).toMatchObject([
      { id: '248', occurrenceId: '248:0' },
      { id: '248', occurrenceId: '248:1' },
    ]);
    expect(snapshot.servants[0]?.skills[0]?.effects).toMatchObject([
      {
        contextChanges: {
          addedFieldTraits: ['fieldSunlight'],
          removedFieldTraits: [],
        },
      },
      {
        contextChanges: {
          addedFieldTraits: [],
          removedFieldTraits: ['fieldSunlight'],
        },
      },
    ]);
  });
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
    const battlePointValues = () =>
      [4500, 6000, 6750, 7125, 7500].map((Value) => ({
        Rate: 1000,
        Value,
        Value2: 1000,
        Target: 3300200,
        Correction: 100,
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
          battlePoints: [{ id: 3300200, phases: [{ phase: 0 }, { phase: 4 }, { phase: 10 }] }],
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
            {
              id: 101,
              name: 'Battle Point宝具',
              card: '1',
              priority: 0,
              functions: [
                {
                  funcId: 13,
                  funcType: 'damageNpBattlePointPhase',
                  funcTargetType: 'enemyAll',
                  svals: battlePointValues(),
                  svals2: battlePointValues(),
                  svals3: battlePointValues(),
                  svals4: battlePointValues(),
                  svals5: battlePointValues(),
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
    expect(snapshot.servants[0]?.noblePhantasms[1]?.damage[0]).toMatchObject({
      kind: 'battlePointPhase',
      maximumBattlePointPhase: 10,
    });
    expect(snapshot.craftEssences[0]?.effects[0]).toMatchObject({
      parameterSets: [[{ Value: 600 }], [], [], [], []],
      limitBreakParameterSets: [[{ Value: 800 }], [], [], [], []],
    });
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
                      ckOpIndv: [
                        { id: 2076, name: 'superGiant', negative: true },
                        { id: 2001, name: 'servant' },
                      ],
                      script: { checkIndvType: 1 },
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
                      script: {
                        INDIVIDUALITIE: { id: 2884, name: 'fieldDarkness' },
                      },
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
                {
                  funcId: 15,
                  funcType: 'addFieldChangeToField',
                  funcTargetType: 'self',
                  funcPopupText: '',
                  buffs: [
                    {
                      type: 'toFieldChangeField',
                      vals: [{ id: 2884, name: 'fieldDarkness' }],
                    },
                  ],
                  svals: Array(10).fill({ FieldIndividuality: [2884] }),
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
      conditions: {
        recipient: [{ operator: 'any', traits: [] }],
        holder: { operator: 'all', traits: [] },
        opponent: {
          operator: 'all',
          traits: [
            { name: 'superGiant', negative: true },
            { name: 'servant', negative: false },
          ],
        },
        field: {
          operator: 'any',
          traits: [{ name: 'fieldDarkness', negative: false }],
        },
      },
    });
    expect(lilith?.skills[0]?.effects.find((effect) => effect.id === '13')).toMatchObject({
      label: '表示名に依存しない色バフ',
      buffTypes: ['upCommandall'],
      cardTypes: ['buster'],
      conditions: {
        field: {
          operator: 'any',
          traits: [{ name: 'fieldDarkness', negative: false }],
        },
      },
    });
    expect(lilith?.skills[0]?.effects.find((effect) => effect.id === '14')).toMatchObject({
      buffTypes: ['buffRate'],
      buffRateTargets: ['buffNpDamageUp'],
    });
    expect(lilith?.skills[0]?.effects.find((effect) => effect.id === '15')).toMatchObject({
      contextChanges: {
        addedFieldTraits: ['fieldDarkness'],
        addedRecipientTraits: [],
      },
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
                  svals: Array.from({ length: 10 }, (_, index) => ({
                    Rate: 5000,
                    Turn: 1,
                    Value: 300 + index * 20,
                  })),
                  svals2: [{ Value: 999, ParamAddMaxCount: 2 }],
                  script: { funcIndividuality: [], customFlag: 7 },
                  overWriteTvalsList: [[{ id: 4002 }]],
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
                parameterSets: [
                  [
                    { Rate: 5000, Turn: 1, Value: 300 },
                    { Rate: 5000, Turn: 1, Value: 320 },
                    { Rate: 5000, Turn: 1, Value: 340 },
                    { Rate: 5000, Turn: 1, Value: 360 },
                    { Rate: 5000, Turn: 1, Value: 380 },
                    { Rate: 5000, Turn: 1, Value: 400 },
                    { Rate: 5000, Turn: 1, Value: 420 },
                    { Rate: 5000, Turn: 1, Value: 440 },
                    { Rate: 5000, Turn: 1, Value: 460 },
                    { Rate: 5000, Turn: 1, Value: 480 },
                  ],
                  [{ Value: 999, ParamAddMaxCount: 2 }],
                  [],
                  [],
                  [],
                ],
                parameterSemantics: {
                  value: ['Rate', 'Value'],
                  lifecycle: ['Turn'],
                  presentation: [],
                  condition: [],
                  contextMutation: [],
                  choice: [],
                  valueExpression: [],
                  buffIdentity: [],
                  unresolved: ['ParamAddMaxCount'],
                },
                unresolvedSemanticKeys: ['script:customFlag'],
              }),
            ],
          }),
        ],
      },
    ]);
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[0]).toMatchObject({
      conditions: {
        recipient: [
          {
            operator: 'all',
            traits: [{ name: 'traitId:4002', negative: false }],
          },
        ],
      },
      parameterSemantics: {
        unresolved: ['ParamAddMaxCount'],
      },
      unresolvedSemanticKeys: ['script:customFlag'],
    });
  });

  it('normalizes Battle Point ranges into subject-scoped quantity conditions', () => {
    const snapshot = normalizeAtlasSnapshot({
      version: 'battle-point-condition',
      servants: [],
      equips: [],
      mysticCodes: [
        {
          id: 1,
          name: 'test',
          maxLv: 10,
          skills: [
            {
              id: 2,
              name: 'test skill',
              functions: [
                {
                  funcId: 3,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [{ type: 'pierceDefence' }],
                  svals: [
                    {
                      Rate: 1000,
                      CheckBattlePointPhaseRange: [{ battlePointId: 33_002_00, range: ['7<='] }],
                    },
                  ],
                },
                {
                  funcId: 5,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [{ type: 'upNpdamage' }],
                  svals: [
                    {
                      Rate: 1000,
                      Value: 200,
                      ActSelectIndex: 2,
                      TriggeredTargetBattlePointRateRange: [
                        { battlePointId: 705300, range: ['<=999'] },
                      ],
                    },
                  ],
                },
                {
                  funcId: 4,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [{ type: 'upAtk' }],
                  svals: [
                    {
                      Rate: 1000,
                      Value: 0,
                      RatioHPLow: 300,
                      RatioHPHigh: 100,
                      RatioHPRangeLow: 0,
                      RatioHPRangeHigh: 500,
                    },
                  ],
                },
                {
                  funcId: 6,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [
                    {
                      type: 'tdTypeChangeArts',
                      vals: [
                        { id: 3004, name: 'buffPositiveEffect' },
                        { id: 3122, name: 'jadeRabbitSunForm' },
                      ],
                    },
                  ],
                  svals: [
                    {
                      Rate: 1000,
                      Turn: 1,
                      ForceAddState: 1,
                      ProcActive: 1,
                      UnSubState: 1,
                      SetPassiveFrame: 1,
                      InvalidHide: 1,
                      FuncCheckTargetIndividualityTargetType: 0,
                    },
                  ],
                },
                {
                  funcId: 7,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [{ type: 'attackBeforeFunction' }],
                  svals: [{ Rate: 1000, Value2: 1234 }],
                },
                {
                  funcId: 8,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [{ type: 'upAtk' }],
                  svals: [
                    {
                      Rate: 1000,
                      Value: 300,
                      TriggeredFuncPosition: 2,
                      DisplayLastFuncInvalidType: 1,
                    },
                  ],
                },
                {
                  funcId: 9,
                  funcType: 'addStateShort',
                  funcTargetType: 'self',
                  buffs: [
                    {
                      type: 'upDamage',
                      ckSelfIndv: [{ name: 'faceCard' }],
                    },
                  ],
                  svals: [
                    {
                      Rate: 1000,
                      Value: 0,
                      AddIndividualty: 100,
                      AddIndividualtyList: [100],
                      AddLinkageTargetIndividualty: 100,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      items: [],
    });

    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[0]).toMatchObject({
      parameterSemantics: {
        condition: ['CheckBattlePointPhaseRange'],
        unresolved: [],
      },
      quantityConditions: [
        {
          quantity: 'battlePointPhase',
          subjectId: '3300200',
          comparison: 'atLeast',
          value: 7,
        },
      ],
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[2]).toMatchObject({
      parameterSemantics: {
        valueExpression: ['RatioHPHigh', 'RatioHPLow', 'RatioHPRangeHigh', 'RatioHPRangeLow'],
        unresolved: [],
      },
      modifierValueExpressionSets: [
        [
          {
            kind: 'hpRangeLinear',
            basePermille: 0,
            minimumHpPermille: 0,
            maximumHpPermille: 500,
            valueAtMinimumHpPermille: 300,
            valueAtMaximumHpPermille: 100,
          },
        ],
        [],
        [],
        [],
        [],
      ],
      quantityConditions: [
        {
          quantity: 'attackerHpPermille',
          comparison: 'atLeast',
          value: 0,
        },
        {
          quantity: 'attackerHpPermille',
          comparison: 'atMost',
          value: 500,
        },
      ],
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[1]).toMatchObject({
      choice: { family: 'actSelectIndex', candidate: 2 },
      sourceQuantityConditions: [
        {
          quantity: 'battlePointRate',
          subjectId: '705300',
          comparison: 'atMost',
          value: 999,
        },
      ],
      parameterSemantics: {
        choice: ['ActSelectIndex'],
        condition: ['TriggeredTargetBattlePointRateRange'],
        unresolved: [],
      },
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[3]).toMatchObject({
      npCardTypeChange: 'arts',
      npCardTypeStateTraits: ['jadeRabbitSunForm'],
      parameterSemantics: {
        condition: ['FuncCheckTargetIndividualityTargetType'],
        lifecycle: ['ForceAddState', 'ProcActive', 'Turn', 'UnSubState'],
        presentation: ['InvalidHide', 'SetPassiveFrame'],
        unresolved: [],
      },
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[4]).toMatchObject({
      triggerScope: 'commandCardAttack',
      parameterSemantics: { unresolved: ['Value2'] },
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[5]).toMatchObject({
      operationTrigger: { kind: 'functionPosition', position: 2 },
      parameterSemantics: {
        condition: ['TriggeredFuncPosition'],
        presentation: ['DisplayLastFuncInvalidType'],
        unresolved: [],
      },
    });
    expect(snapshot.mysticCodes[0]?.skills[0]?.effects[6]).toMatchObject({
      triggerScope: 'commandCard',
      parameterSemantics: {
        buffIdentity: ['AddIndividualty', 'AddIndividualtyList', 'AddLinkageTargetIndividualty'],
        unresolved: [],
      },
    });
  });
});
