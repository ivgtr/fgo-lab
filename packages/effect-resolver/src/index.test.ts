import type { CraftEssenceMaster, MysticCodeMaster, ServantMaster } from '@fgo-lab/master-data';
import type { DamageKernelInput, SupportComposition } from '@fgo-lab/schema';
import type { MasterEffect, NpDamageSpec } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  isDamageRelevantEffect,
  resolveAttackerSkills,
  resolveCraftEssenceEffects,
  resolveNpEffects,
  resolveMysticCodeSkills,
  resolveServantPassives,
  resolveSupportComposition,
} from './index';

const input: DamageKernelInput = {
  attackerId: 'attacker',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 1000,
  craftEssenceId: null,
  craftEssenceAtk: 0,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [300, 400, 450, 475, 500],
  cardType: 'buster',
  classAttackRate: 1,
  classAffinity: 1,
  attributeAffinity: 1,
  attackBuff: 0.1,
  defenseBuff: 0,
  cardBuff: 0,
  cardResistance: 0,
  npDamageBuff: 0,
  npResistance: 0,
  powerMod: 0,
  eventDamageBuff: 0,
  npSpecialMultipliers: [1, 1, 1, 1, 1],
  specialDamageBuff: 0,
  specialResistance: 0,
  flatDamage: 0,
  damageCut: 0,
  fieldTraits: [],
  target: { classId: 'neutral', attribute: 'unknown', traits: [] },
};

const parameterSets = (values: readonly number[]): MasterEffect['parameterSets'] => [
  values.map((Value) => ({ Value })),
  [],
  [],
  [],
  [],
];
const npEffectParameterSets = (
  values: readonly [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ],
): MasterEffect['parameterSets'] => {
  const set = (source: readonly number[]) => source.map((Value) => ({ Value }));
  return [set(values[0]), set(values[1]), set(values[2]), set(values[3]), set(values[4])];
};

const source: ServantMaster = {
  id: 'support',
  name: '支援役',
  classId: 'caster',
  attribute: 'human',
  rarity: 5,
  atkByLevel: {},
  noblePhantasms: [],
  traits: [],
  imageKey: null,
  growth: [],
  passives: [],
  skills: [
    {
      id: 'skill',
      slot: 1,
      priority: 1,
      name: '支援スキル',
      detail: '',
      imageKey: null,
      effects: [
        {
          id: 'attack',
          type: 'addStateShort',
          target: 'ptAll',
          label: '攻撃力アップ',
          parameterSets: parameterSets([100, 110, 120, 130, 140, 150, 160, 170, 180, 200]),
          buffTypes: ['upAtk'],
          cardTypes: [],
        },
        {
          id: 'buster',
          type: 'addStateShort',
          target: 'ptOne',
          label: 'バスターアップ',
          parameterSets: parameterSets([300, 320, 340, 360, 380, 400, 420, 440, 460, 500]),
          buffTypes: ['upCommandall'],
          cardTypes: ['buster'],
        },
        {
          id: 'np',
          type: 'addStateShort',
          target: 'ptAll',
          label: '宝具威力アップ',
          parameterSets: parameterSets([200, 210, 220, 230, 240, 250, 260, 270, 280, 300]),
          buffTypes: ['upNpdamage'],
          cardTypes: [],
        },
        {
          id: 'charge',
          type: 'gainNp',
          target: 'ptAll',
          label: 'NP増加',
          parameterSets: parameterSets(Array(10).fill(2000)),
          cardTypes: [],
        },
      ],
    },
  ],
};

const npParameterMatrix = (
  correctionsByOvercharge: readonly (readonly number[])[] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => 1000),
  ),
) =>
  correctionsByOvercharge.map((corrections) =>
    corrections.map((correctionPermille) => ({
      ratePermille: 1000,
      valuePermille: 3000,
      correctionPermille,
      targetId: 2002,
      targetTrait: { id: 2002, name: 'dragon' },
    })),
  ) as NpDamageSpec['parametersByOvercharge'];

const standardDamage: NpDamageSpec = {
  kind: 'standard',
  rawFunctionType: 'damageNp',
  functionId: 'damage',
  target: 'all',
  parametersByOvercharge: npParameterMatrix(),
  rawPath: 'fixture.damage',
};

function attackNoblePhantasm(
  effects: Array<MasterEffect & { timing: 'beforeDamage' | 'afterDamage' }>,
  damage: NpDamageSpec = standardDamage,
) {
  return [
    { id: 'np', name: '宝具', priority: 1, card: 'buster' as const, damage: [damage], effects },
  ];
}

function compositionFor(servant: ServantMaster = source): SupportComposition {
  return {
    sources: [
      {
        sourceInstanceId: 'support-instance-1',
        servantId: servant.id,
        skills: servant.skills.map((skill) => ({ skillId: skill.id, skillLevel: 10 })),
      },
    ],
    selectedEffects: servant.skills.flatMap((skill) =>
      skill.effects.map((effect) => ({
        sourceInstanceId: 'support-instance-1',
        skillId: skill.id,
        effectId: effect.id,
      })),
    ),
  };
}

describe('resolveSupportComposition', () => {
  it('applies only effects explicitly selected in the composition', () => {
    const composition = compositionFor();
    composition.selectedEffects = composition.selectedEffects.filter(
      (effect) => effect.effectId === 'attack',
    );

    const result = resolveSupportComposition(input, composition, [source]);

    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBe(0);
    expect(result.input.npDamageBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      applied: false,
      reason: 'calculation_effect_disabled',
    });
  });

  it('excludes non-NP buffs and exposes unresolved damage candidates', () => {
    expect(
      isDamageRelevantEffect({
        id: 'extra',
        type: 'addStateShort',
        target: 'self',
        label: 'Extra Attackアップ',
        parameterSets: parameterSets(Array(10).fill(1000)),
        buffTypes: ['upExtraattack', 'upCommandall'],
        cardTypes: ['buster'],
      }),
    ).toBe(false);
    expect(
      isDamageRelevantEffect({
        id: 'unsupported-rate',
        type: 'addStateShort',
        target: 'self',
        label: '対象不明のブースト',
        parameterSets: parameterSets(Array(10).fill(1000)),
        buffTypes: ['buffRate'],
        cardTypes: [],
      }),
    ).toBe(true);
  });

  it('adds unconditional damage buffs at the selected skill level', () => {
    const result = resolveSupportComposition(input, compositionFor(), [source]);
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.filter((effect) => effect.applied)).toHaveLength(3);
    expect(result.effects.find((effect) => effect.effectId === 'np')).toMatchObject({
      damageRelevant: true,
    });
    expect(result.effects.find((effect) => effect.effectId === 'charge')).toMatchObject({
      damageRelevant: false,
    });
    expect(result.precision).toBe('exact');
  });

  it('does not apply a card buff to a different NP card', () => {
    const result = resolveSupportComposition({ ...input, cardType: 'arts' }, compositionFor(), [
      source,
    ]);
    expect(result.input.cardBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      applied: false,
      reason: 'card_type_mismatch',
    });
  });

  it('classifies damage buffs from structured metadata instead of display labels', () => {
    const renamed: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: source.skills[0]!.effects.map((effect) => ({
            ...effect,
            label: `変更された表示名 ${effect.id}`,
          })),
        },
      ],
    };
    const result = resolveSupportComposition(input, compositionFor(renamed), [renamed]);

    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
  });

  it('fails closed when the saved source cannot be resolved', () => {
    const result = resolveSupportComposition(input, compositionFor(), []);
    expect(result.precision).toBe('unsupported');
    expect(result.input).toEqual(input);
    expect(result.warnings).toEqual(['support_effect_missing:support:skill']);
  });

  it('resolves a structured NP damage buff rate without stacking duplicate boost states', () => {
    const boosted: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'boost',
              type: 'addStateShort',
              target: 'ptOne',
              label: '宝具威力アップブースト',
              parameterSets: parameterSets(Array(10).fill(1000)),
              buffTypes: ['buffRate'],
              buffRateTargets: ['buffNpDamageUp'],
              cardTypes: [],
            },
            {
              id: 'weaker-boost',
              type: 'addStateShort',
              target: 'ptOne',
              label: '宝具威力アップブースト',
              parameterSets: parameterSets(Array(10).fill(500)),
              buffTypes: ['buffRate'],
              buffRateTargets: ['buffNpDamageUp'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const result = resolveSupportComposition(input, compositionFor(boosted), [boosted]);
    expect(result.precision).toBe('exact');
    expect(result.npDamageBuffRate).toBe(1);
    expect(result.effects[0]).toMatchObject({
      applied: true,
      reason: 'np_damage_buff_rate',
    });
    expect(result.warnings).toEqual([]);
  });

  it('keeps an untyped buff rate fail-closed as unsupported', () => {
    const boosted: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'unknown-boost',
              type: 'addStateShort',
              target: 'ptOne',
              label: '対象不明のブースト',
              parameterSets: parameterSets(Array(10).fill(1000)),
              buffTypes: ['buffRate'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const result = resolveSupportComposition(input, compositionFor(boosted), [boosted]);
    expect(result.precision).toBe('unsupported');
    expect(result.effects[0]).toMatchObject({
      applied: false,
      reason: 'damage_effect_not_supported',
    });
  });

  it('does not misclassify NP gain when damaged as outgoing damage', () => {
    const defensive: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'gain-np-when-damaged',
              type: 'addStateShort',
              target: 'ptOne',
              label: '被ダメージ時NP獲得量アップ',
              parameterSets: parameterSets(Array(10).fill(1000)),
              buffTypes: ['upDamagedropnp'],
              cardTypes: [],
            },
            {
              id: 'extra-attack',
              type: 'addStateShort',
              target: 'ptOne',
              label: 'Extra Attackアップ',
              parameterSets: parameterSets(Array(10).fill(1000)),
              buffTypes: ['upCommandall'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const result = resolveSupportComposition(input, compositionFor(defensive), [defensive]);

    expect(result.input.powerMod).toBe(0);
    expect(result.precision).toBe('exact');
    expect(result.effects).toHaveLength(2);
    expect(
      result.effects.every(
        (effect) =>
          effect.kind === null && !effect.applied && effect.reason === 'not_np_damage_relevant',
      ),
    ).toBe(true);
  });
});

describe('resolveAttackerSkills', () => {
  const attacker: ServantMaster = { ...source, id: input.attackerId, name: '攻撃役' };

  it('applies enabled self skills without mutating the base input', () => {
    const result = resolveAttackerSkills(input, [{ skillId: 'skill', skillLevel: 10 }], [attacker]);
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.every((effect) => effect.origin === 'attacker')).toBe(true);
    expect(input).toMatchObject({ attackBuff: 0.1, cardBuff: 0, npDamageBuff: 0 });
  });

  it('can exclude every effect in a self skill independently from its level', () => {
    const result = resolveAttackerSkills(
      input,
      [{ skillId: 'skill', skillLevel: 10 }],
      [attacker],
      {
        effectOverrides: {
          'attacker:attacker:attacker:skill:attack': false,
          'attacker:attacker:attacker:skill:buster': false,
          'attacker:attacker:attacker:skill:np': false,
          'attacker:attacker:attacker:skill:charge': false,
        },
      },
    );
    expect(result.input).toEqual(input);
    expect(result.effects.every((effect) => !effect.applied)).toBe(true);
  });

  it('uses effect overrides as the only calculator-level switch', () => {
    const result = resolveAttackerSkills(
      input,
      [{ skillId: 'skill', skillLevel: 10 }],
      [attacker],
      {
        defaultEnabled: false,
        effectOverrides: {
          'attacker:attacker:attacker:skill:attack': true,
        },
      },
    );

    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBe(0);
    expect(result.input.npDamageBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'attack')?.applied).toBe(true);
    expect(result.effects.find((effect) => effect.effectId === 'np')).toMatchObject({
      applied: false,
      reason: 'calculation_effect_disabled',
    });
  });

  it('does not let an override bypass a hard card mismatch', () => {
    const result = resolveAttackerSkills(
      { ...input, cardType: 'arts' },
      [{ skillId: 'skill', skillLevel: 10 }],
      [attacker],
      {
        defaultEnabled: false,
        effectOverrides: {
          'attacker:attacker:attacker:skill:buster': true,
        },
      },
    );

    expect(result.input.cardBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      applied: false,
      reason: 'card_type_mismatch',
    });
  });

  it('distinguishes an explicit zero from a missing damage value', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              ...source.skills[0]!.effects[0]!,
              id: 'zero',
              parameterSets: parameterSets(Array(10).fill(0)),
            },
            {
              ...source.skills[0]!.effects[0]!,
              id: 'missing',
              parameterSets: [[{ Rate: 5000 }], [], [], [], []],
            },
          ],
        },
      ],
    };
    const resolved = resolveAttackerSkills(
      input,
      [{ skillId: 'skill', skillLevel: 1 }],
      [attacker],
    );
    expect(resolved.effects.find((effect) => effect.effectId === 'zero')).toMatchObject({
      value: 0,
      applied: true,
    });
    expect(resolved.effects.find((effect) => effect.effectId === 'missing')).toMatchObject({
      value: null,
      applied: false,
      reason: 'level_value_missing',
    });
    expect(resolved.precision).toBe('unsupported');
  });

  it('applies a recipient-limited buff only when the attacker has the trait', () => {
    const conditional: ServantMaster = {
      ...attacker,
      traits: ['knightsOfTheRound'],
      skills: [
        {
          ...attacker.skills[0]!,
          effects: [
            {
              id: 'round-table',
              type: 'addStateShort',
              target: 'ptAll',
              label: '攻撃力アップ',
              parameterSets: parameterSets(Array(10).fill(200)),
              recipientTraits: ['knightsOfTheRound'],
              buffTypes: ['upAtk'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10 }];
    expect(resolveAttackerSkills(input, selection, [conditional]).input.attackBuff).toBeCloseTo(
      0.3,
    );
    const mismatch = resolveAttackerSkills(input, selection, [{ ...conditional, traits: [] }]);
    expect(mismatch.input.attackBuff).toBe(0.1);
    expect(mismatch.effects[0]).toMatchObject({
      applied: false,
      reason: 'attacker_trait_mismatch',
    });
  });
});

describe('resolveMysticCodeSkills', () => {
  const mysticCode: MysticCodeMaster = {
    id: '1',
    name: '魔術礼装･カルデア',
    maxLevel: 10,
    imageKey: null,
    skills: source.skills,
  };

  it('uses the shared effect resolver and fails closed for a missing source', () => {
    const resolved = resolveMysticCodeSkills(
      input,
      mysticCode,
      [{ skillId: 'skill', skillLevel: 10 }],
      [],
    );
    expect(resolved.input.attackBuff).toBeCloseTo(0.3);
    expect(resolved.input.cardBuff).toBeCloseTo(0.5);
    expect(resolved.input.npDamageBuff).toBeCloseTo(0.3);
    expect(resolved.effects.every((effect) => effect.origin === 'mysticCode')).toBe(true);
    expect(
      resolveMysticCodeSkills(input, undefined, [{ skillId: 'skill', skillLevel: 10 }], []).precision,
    ).toBe('unsupported');
  });
});

describe('automatic equipment, passive, and NP effects', () => {
  it('uses the normal and maximum-limit-break craft essence values', () => {
    const craftEssence: CraftEssenceMaster = {
      id: 'black-grail',
      name: '黒の聖杯',
      maxLevelByLimitBreak: [20, 35, 50, 65, 100],
      atkMin: 600,
      atkMax: 2400,
      imageKey: null,
      effects: [
        {
          id: 'np',
          type: 'addStateShort',
          target: 'self',
          label: '宝具威力アップ',
          parameterSets: parameterSets([600]),
          limitBreakParameterSets: parameterSets([800]),
          buffTypes: ['upNpdamage'],
          cardTypes: [],
        },
      ],
    };
    expect(resolveCraftEssenceEffects(input, craftEssence, 0).input.npDamageBuff).toBe(0.6);
    expect(resolveCraftEssenceEffects(input, craftEssence, 4).input.npDamageBuff).toBe(0.8);
  });

  it('applies a matching passive card buff', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      passives: [
        {
          id: 'passive',
          slot: 0,
          priority: 0,
          name: '狂化',
          detail: '',
          imageKey: null,
          effects: [
            {
              id: 'buster',
              type: 'addStateShort',
              target: 'self',
              label: 'バスターアップ',
              parameterSets: parameterSets(Array(10).fill(80)),
              buffTypes: ['upCommandall'],
              cardTypes: ['buster'],
            },
          ],
        },
      ],
    };
    expect(resolveServantPassives(input, attacker).input.cardBuff).toBe(0.08);
  });

  it('adds fixed damage without treating it as a percentage', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      passives: [
        {
          id: 'divinity',
          slot: 0,
          priority: 0,
          name: '神性',
          detail: '',
          imageKey: null,
          effects: [
            {
              id: 'flat',
              type: 'addStateShort',
              target: 'self',
              label: 'アタックプラス',
              parameterSets: parameterSets([175]),
              buffTypes: ['addDamage'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const resolved = resolveServantPassives(input, attacker);
    expect(resolved.input.flatDamage).toBe(175);
    expect(resolved.effects[0]).toMatchObject({ kind: 'flatDamage', value: 175, applied: true });
  });

  it('requires explicit field state for field-limited buffs', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'darkness-attack',
              type: 'addStateShort',
              target: 'ptAll',
              label: '攻撃力アップ',
              parameterSets: parameterSets(Array(10).fill(200)),
              requiredFieldTraits: ['fieldDarkness'],
              buffTypes: ['upAtk'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10 }];
    const missed = resolveAttackerSkills(input, selection, [attacker]);
    expect(missed.input.attackBuff).toBe(0.1);
    expect(missed.effects[0]).toMatchObject({ applied: false, reason: 'field_trait_mismatch' });
    expect(
      resolveAttackerSkills({ ...input, fieldTraits: ['fieldDarkness'] }, selection, [attacker])
        .input.attackBuff,
    ).toBeCloseTo(0.3);
  });

  it('uses OC and NP level for a damage-relevant effect before the NP function', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      noblePhantasms: attackNoblePhantasm([
        {
          id: 'attack',
          type: 'addStateShort',
          target: 'self',
          label: '攻撃力アップ',
          parameterSets: npEffectParameterSets([
            [100, 110, 120, 130, 140],
            [200, 210, 220, 230, 240],
            [300, 350, 400, 450, 500],
            [400, 410, 420, 430, 440],
            [500, 510, 520, 530, 540],
          ]),
          timing: 'beforeDamage',
          buffTypes: ['upAtk'],
          cardTypes: [],
        },
      ]),
    };
    expect(
      resolveNpEffects({ ...input, overcharge: 3, npLevel: 2 }, attacker).input.attackBuff,
    ).toBeCloseTo(0.45);
  });

  it('applies a special NP multiplier only to a matching enemy trait', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      noblePhantasms: attackNoblePhantasm([], {
        kind: 'trait',
        rawFunctionType: 'damageNpIndividual',
        functionId: 'special-damage',
        target: 'all',
        parametersByOvercharge: npParameterMatrix([
          [1500, 1750, 1875, 1938, 2000],
          [1600, 1850, 1975, 2038, 2100],
          [1700, 1950, 2075, 2138, 2200],
          [1800, 2050, 2175, 2238, 2300],
          [1900, 2150, 2275, 2338, 2400],
        ]),
        rawPath: 'fixture.special-damage',
      }),
    };
    const matched = resolveNpEffects(
      {
        ...input,
        npLevel: 5,
        overcharge: 3,
        target: { ...input.target, traits: ['dragon'] },
      },
      attacker,
    );
    expect(matched.input.npSpecialMultipliers).toEqual([1.7, 1.95, 2.075, 2.138, 2.2]);
    expect(matched.effects.at(-1)).toMatchObject({
      label: '特攻宝具',
      applied: true,
      reason: 'target_trait_matched',
    });
    const missed = resolveNpEffects(input, attacker);
    expect(missed.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(missed.effects.at(-1)).toMatchObject({
      applied: false,
      reason: 'target_trait_mismatch',
      damageTraitCondition: {
        kind: 'npSpecial',
        condition: { anyOf: ['dragon'], noneOf: [] },
      },
    });
  });

  it('applies only a matching damage power trait', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'dragon-power',
              type: 'addStateShort',
              target: 'self',
              label: '威力アップ・対竜',
              parameterSets: parameterSets(Array(10).fill(500)),
              targetCondition: { anyOf: ['dragon'], noneOf: [] },
              buffTypes: ['upDamage'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10 }];
    expect(
      resolveAttackerSkills(
        { ...input, target: { ...input.target, traits: ['dragon'] } },
        selection,
        [attacker],
      ).input.powerMod,
    ).toBe(0.5);
    const missed = resolveAttackerSkills(input, selection, [attacker]);
    expect(missed.input.powerMod).toBe(0);
    expect(missed.effects[0]?.damageTraitCondition).toEqual({
      kind: 'powerMod',
      condition: { anyOf: ['dragon'], noneOf: [] },
    });
    const forced = resolveAttackerSkills(input, selection, [attacker], {
      effectOverrides: {
        'attacker:attacker:attacker:skill:dragon-power': true,
      },
    });
    expect(forced.input.powerMod).toBe(0.5);
  });

  it('applies an excluded-trait modifier only while that trait is absent', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              id: 'not-super-giant',
              type: 'addStateShort',
              target: 'self',
              label: '威力アップ・対非超巨大',
              parameterSets: parameterSets(Array(10).fill(500)),
              targetCondition: { anyOf: [], noneOf: ['superGiant'] },
              buffTypes: ['upDamage'],
              cardTypes: [],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10 }];
    expect(resolveAttackerSkills(input, selection, [attacker]).input.powerMod).toBe(0.5);
    expect(
      resolveAttackerSkills(
        { ...input, target: { ...input.target, traits: ['superGiant'] } },
        selection,
        [attacker],
      ).input.powerMod,
    ).toBe(0);
  });
});
