import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { CalcInput, SupportTemplate } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  resolveAttackerSkills,
  resolveCraftEssenceEffects,
  resolveNpEffects,
  resolveServantPassives,
  resolveSupportTemplate,
} from './index';

const input: CalcInput = {
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
  npSpecialMultiplier: 1,
  specialDamageBuff: 0,
  specialResistance: 0,
  flatDamage: 0,
  damageCut: 0,
  target: { classId: 'neutral', attribute: 'unknown', traits: [] },
};

const source: ServantMaster = {
  id: 'support',
  name: '支援役',
  classId: 'caster',
  attribute: 'human',
  rarity: 5,
  hasAttackNp: false,
  npCard: 'arts',
  npTarget: 'all',
  atkByLevel: {},
  npMultipliers: [0, 0, 0, 0, 0],
  attackNpFunctionType: 'none',
  traits: [],
  imageKey: null,
  growth: [],
  passives: [],
  npEffects: [],
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
          values: [100, 110, 120, 130, 140, 150, 160, 170, 180, 200],
        },
        {
          id: 'buster',
          type: 'addStateShort',
          target: 'ptOne',
          label: 'バスターアップ',
          values: [300, 320, 340, 360, 380, 400, 420, 440, 460, 500],
        },
        {
          id: 'np',
          type: 'addStateShort',
          target: 'ptAll',
          label: '宝具威力アップ',
          values: [200, 210, 220, 230, 240, 250, 260, 270, 280, 300],
        },
        {
          id: 'charge',
          type: 'gainNp',
          target: 'ptAll',
          label: 'NP増加',
          values: Array(10).fill(2000) as number[],
        },
      ],
    },
  ],
};

function template(patch: Partial<SupportTemplate> = {}): SupportTemplate {
  return {
    templateId: '00000000-0000-4000-8000-000000000001',
    name: 'テスト支援',
    masterDataVersion: 'test',
    effects: [
      {
        sourceType: 'servant',
        sourceId: source.id,
        effectId: 'skill',
        skillLevel: 10,
        targetRole: 'ATTACKER',
        enabled: true,
        order: 0,
      },
    ],
    updatedAt: '2026-08-24T00:00:00.000Z',
    lastUsedAt: null,
    ...patch,
  };
}

describe('resolveSupportTemplate', () => {
  it('adds unconditional damage buffs at the selected skill level', () => {
    const result = resolveSupportTemplate(input, template(), [source]);
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.filter((effect) => effect.applied)).toHaveLength(3);
    expect(result.precision).toBe('exact');
  });

  it('does not apply a card buff to a different NP card', () => {
    const result = resolveSupportTemplate({ ...input, cardType: 'arts' }, template(), [source]);
    expect(result.input.cardBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      applied: false,
      reason: 'card_type_mismatch',
    });
  });

  it('fails closed when the saved source cannot be resolved', () => {
    const result = resolveSupportTemplate(input, template(), []);
    expect(result.precision).toBe('unsupported');
    expect(result.input).toEqual(input);
    expect(result.warnings).toEqual(['support_effect_missing:support:skill']);
  });

  it('marks an unhandled damage effect as approximate', () => {
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
              values: Array(10).fill(1000) as number[],
            },
          ],
        },
      ],
    };
    const result = resolveSupportTemplate(input, template(), [boosted]);
    expect(result.precision).toBe('approximate');
    expect(result.effects[0]).toMatchObject({
      applied: false,
      reason: 'damage_effect_not_supported',
    });
  });
});

describe('resolveAttackerSkills', () => {
  const attacker: ServantMaster = { ...source, id: input.attackerId, name: '攻撃役' };

  it('applies enabled self skills without mutating the base input', () => {
    const result = resolveAttackerSkills(
      input,
      [{ skillId: 'skill', skillLevel: 10, enabled: true }],
      [attacker],
    );
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.every((effect) => effect.origin === 'attacker')).toBe(true);
    expect(input).toMatchObject({ attackBuff: 0.1, cardBuff: 0, npDamageBuff: 0 });
  });

  it('does not apply disabled self skills', () => {
    const result = resolveAttackerSkills(
      input,
      [{ skillId: 'skill', skillLevel: 10, enabled: false }],
      [attacker],
    );
    expect(result.input).toEqual(input);
    expect(result.effects).toEqual([]);
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
              values: Array(10).fill(200) as number[],
              recipientTraits: ['knightsOfTheRound'],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10, enabled: true }];
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
          values: [600, 800],
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
              values: Array(10).fill(80) as number[],
            },
          ],
        },
      ],
    };
    expect(resolveServantPassives(input, attacker).input.cardBuff).toBe(0.08);
  });

  it('uses OC for a damage-relevant effect before the NP function', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
      npEffects: [
        {
          id: 'attack',
          type: 'addStateShort',
          target: 'self',
          label: '攻撃力アップ',
          values: [100, 200, 300, 400, 500],
          timing: 'beforeDamage',
        },
      ],
    };
    expect(resolveNpEffects({ ...input, overcharge: 3 }, attacker).input.attackBuff).toBe(0.4);
  });

  it('applies a special NP multiplier only to a matching enemy trait', () => {
    const attacker: ServantMaster = {
      ...source,
      id: input.attackerId,
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
    expect(matched.input.npSpecialMultiplier).toBe(2.2);
    expect(matched.effects.at(-1)).toMatchObject({ applied: true, reason: 'target_trait_matched' });
    const missed = resolveNpEffects(input, attacker);
    expect(missed.input.npSpecialMultiplier).toBe(1);
    expect(missed.effects.at(-1)).toMatchObject({
      applied: false,
      reason: 'target_trait_mismatch',
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
              values: Array(10).fill(500) as number[],
              targetTraits: ['dragon'],
              buffTypes: ['upDamage'],
            },
          ],
        },
      ],
    };
    const selection = [{ skillId: 'skill', skillLevel: 10, enabled: true }];
    expect(
      resolveAttackerSkills(
        { ...input, target: { ...input.target, traits: ['dragon'] } },
        selection,
        [attacker],
      ).input.powerMod,
    ).toBe(0.5);
    expect(resolveAttackerSkills(input, selection, [attacker]).input.powerMod).toBe(0);
  });
});
