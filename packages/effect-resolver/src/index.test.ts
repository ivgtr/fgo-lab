import type { ServantMaster } from '@fgo-lab/master-data';
import type { CalcInput, SupportTemplate } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { resolveSupportTemplate } from './index';

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
  cardBuff: 0,
  npDamageBuff: 0,
  powerMod: 0,
  npSpecialMultiplier: 1,
  specialResistance: 0,
  flatDamage: 0,
  target: { classId: 'neutral', attribute: 'unknown', traits: [] },
};

const source: ServantMaster = {
  id: 'support',
  name: '支援役',
  classId: 'caster',
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
  skills: [
    {
      id: 'skill',
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
