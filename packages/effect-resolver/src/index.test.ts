import {
  getPrimaryNoblePhantasm,
  type CraftEssenceMaster,
  type MysticCodeMaster,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { DamageResolutionInput, SupportComposition } from '@fgo-lab/schema';
import type { MasterEffect, NpDamageSpec } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  isDamageRelevantEffect,
  resolveEffectSources,
  type EffectSource,
  type ResolveEffectOptions,
} from './index';

const input: DamageResolutionInput = {
  attackerId: 'attacker',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 1000,
  craftEssenceId: null,
  craftEssenceAtk: 0,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [300, 400, 450, 475, 500],
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
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
  attackerStateTraits: [],
  attackerHpPermille: null,
  targetRarity: null,
  targetStateTraits: [],
  battlePointPhase: null,
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

function effectValue(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  useLimitBreak = false,
) {
  const sets =
    useLimitBreak && effect.limitBreakParameterSets
      ? effect.limitBreakParameterSets
      : effect.parameterSets;
  const value = sets[setIndex]?.[valueIndex]?.['Value'];
  return typeof value === 'number' ? value : undefined;
}

function withWarnings(
  baseInput: DamageResolutionInput,
  sources: EffectSource[],
  warnings: string[],
  options: ResolveEffectOptions = {},
) {
  const resolved = resolveEffectSources(baseInput, sources, options);
  return {
    ...resolved,
    precision: warnings.length ? ('unsupported' as const) : resolved.precision,
    warnings: [...warnings, ...resolved.warnings],
  };
}

function skillSources(
  baseInput: DamageResolutionInput,
  selections: readonly {
    sourceInstanceId: string;
    sourceId: string;
    skillId: string;
    skillLevel: number;
    defaultEnabled: boolean;
    selectedEffectIds?: readonly string[];
  }[],
  servants: readonly ServantMaster[],
  origin: EffectSource['origin'],
) {
  const warnings: string[] = [];
  const sources: EffectSource[] = [];
  const recipientTraits =
    servants.find((servant) => servant.id === baseInput.attackerId)?.traits ?? [];
  for (const selected of selections) {
    const servant = servants.find((candidate) => candidate.id === selected.sourceId);
    const skill = [...(servant?.skills ?? []), ...(servant?.passives ?? [])].find(
      (candidate) => candidate.id === selected.skillId,
    );
    if (!servant || !skill) {
      warnings.push(`${origin}_effect_missing:${selected.sourceId}:${selected.skillId}`);
      continue;
    }
    for (const effect of skill.effects)
      sources.push({
        order: sources.length,
        origin,
        sourceInstanceId: selected.sourceInstanceId,
        sourceId: servant.id,
        sourceName: servant.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: effectValue(effect, 0, selected.skillLevel - 1),
        appliedReason: 'unconditional_attacker_buff',
        defaultEnabled: selected.selectedEffectIds?.includes(effect.id) ?? selected.defaultEnabled,
        recipientTraits,
      });
  }
  return { sources, warnings };
}

function resolveAttackerSourcesForTest(
  baseInput: DamageResolutionInput,
  selections: readonly { skillId: string; skillLevel: number }[],
  servants: readonly ServantMaster[],
  options: ResolveEffectOptions = {},
) {
  const collected = skillSources(
    baseInput,
    selections.map((selection) => ({
      ...selection,
      sourceInstanceId: `attacker:${baseInput.attackerId}`,
      sourceId: baseInput.attackerId,
      defaultEnabled: options.defaultEnabled ?? true,
    })),
    servants,
    'attacker',
  );
  return withWarnings(baseInput, collected.sources, collected.warnings, options);
}

function resolveSupportSourcesForTest(
  baseInput: DamageResolutionInput,
  composition: SupportComposition,
  servants: readonly ServantMaster[],
  options: ResolveEffectOptions = {},
) {
  const collected = skillSources(
    baseInput,
    composition.sources.flatMap((support) =>
      support.skills.map((skill) => ({
        ...skill,
        sourceInstanceId: support.sourceInstanceId,
        sourceId: support.servantId,
        defaultEnabled: false,
        selectedEffectIds: composition.selectedEffects
          .filter(
            (effect) =>
              effect.sourceInstanceId === support.sourceInstanceId &&
              effect.skillId === skill.skillId,
          )
          .map((effect) => effect.effectId),
      })),
    ),
    servants,
    'support',
  );
  return withWarnings(baseInput, collected.sources, collected.warnings, options);
}

function resolvePassiveSourcesForTest(
  baseInput: DamageResolutionInput,
  servant: ServantMaster | undefined,
  options: ResolveEffectOptions = {},
) {
  if (!servant) return withWarnings(baseInput, [], ['passive_source_missing'], options);
  const collected = skillSources(
    baseInput,
    servant.passives.map((skill) => ({
      sourceInstanceId: `passive:${servant.id}`,
      sourceId: servant.id,
      skillId: skill.id,
      skillLevel: 1,
      defaultEnabled: true,
    })),
    [servant],
    'passive',
  );
  return withWarnings(baseInput, collected.sources, collected.warnings, options);
}

function resolveCraftEssenceSourcesForTest(
  baseInput: DamageResolutionInput,
  craftEssence: CraftEssenceMaster | undefined,
  limitBreak: number,
  recipientTraits: readonly string[] = [],
  options: ResolveEffectOptions = {},
) {
  if (!craftEssence) return withWarnings(baseInput, [], [], options);
  return withWarnings(
    baseInput,
    craftEssence.effects.map((effect, order) => ({
      order,
      origin: 'craftEssence',
      sourceInstanceId: `craftEssence:${craftEssence.id}`,
      sourceId: craftEssence.id,
      sourceName: craftEssence.name,
      skillId: `ce:${craftEssence.id}`,
      skillName: craftEssence.name,
      effect,
      rawValue: effectValue(effect, 0, 0, limitBreak === 4),
      appliedReason: limitBreak === 4 ? 'limit_break_effect' : 'craft_essence_effect',
      defaultEnabled: true,
      recipientTraits,
    })),
    [],
    options,
  );
}

function resolveNpSourcesForTest(
  baseInput: DamageResolutionInput,
  servant: ServantMaster | undefined,
  options: ResolveEffectOptions = {},
) {
  const np = servant ? getPrimaryNoblePhantasm(servant) : undefined;
  if (!servant || !np) return withWarnings(baseInput, [], ['np_source_missing'], options);
  return withWarnings(
    baseInput,
    np.effects
      .filter((effect) => effect.timing === 'beforeDamage')
      .map((effect, order) => ({
        order,
        origin: 'np',
        sourceInstanceId: `np:${servant.id}`,
        sourceId: servant.id,
        sourceName: servant.name,
        skillId: `np:${servant.id}`,
        skillName: '宝具前効果',
        effect,
        rawValue: effectValue(effect, baseInput.overcharge - 1, baseInput.npLevel - 1),
        appliedReason: 'np_before_damage',
        defaultEnabled: true,
        recipientTraits: servant.traits,
      })),
    [],
    options,
  );
}

function resolveMysticCodeSourcesForTest(
  baseInput: DamageResolutionInput,
  mysticCode: MysticCodeMaster | undefined,
  selections: readonly { skillId: string; skillLevel: number }[],
  recipientTraits: readonly string[],
  options: ResolveEffectOptions = {},
) {
  if (!mysticCode) return withWarnings(baseInput, [], ['mysticCode_source_missing'], options);
  const sources: EffectSource[] = [];
  const warnings: string[] = [];
  for (const selected of selections) {
    const skill = mysticCode.skills.find((candidate) => candidate.id === selected.skillId);
    if (!skill) {
      warnings.push(`mysticCode_effect_missing:${mysticCode.id}:${selected.skillId}`);
      continue;
    }
    for (const effect of skill.effects)
      sources.push({
        order: sources.length,
        origin: 'mysticCode',
        sourceInstanceId: `mysticCode:${mysticCode.id}`,
        sourceId: mysticCode.id,
        sourceName: mysticCode.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: effectValue(effect, 0, selected.skillLevel - 1),
        appliedReason: 'mystic_code_buff',
        defaultEnabled: options.defaultEnabled ?? true,
        recipientTraits,
      });
  }
  return withWarnings(baseInput, sources, warnings, options);
}

describe('resolveSupportSourcesForTest', () => {
  it('aggregates rates as integer permille before one final conversion', () => {
    const stacked: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              ...source.skills[0]!.effects[0]!,
              id: 'attack-100',
              parameterSets: parameterSets(Array(10).fill(100)),
            },
            {
              ...source.skills[0]!.effects[0]!,
              id: 'attack-200',
              parameterSets: parameterSets(Array(10).fill(200)),
            },
          ],
        },
      ],
    };
    const result = resolveSupportSourcesForTest(
      { ...input, attackBuff: 0 },
      compositionFor(stacked),
      [stacked],
    );
    expect(result.input.attackBuff).toBe(0.3);
    expect(result.effects.map((effect) => effect.valuePermille)).toEqual([100, 200]);
  });

  it('applies only effects explicitly selected in the composition', () => {
    const composition = compositionFor();
    composition.selectedEffects = composition.selectedEffects.filter(
      (effect) => effect.effectId === 'attack',
    );

    const result = resolveSupportSourcesForTest(input, composition, [source]);

    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBe(0);
    expect(result.input.npDamageBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      state: 'rejected',
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
    const result = resolveSupportSourcesForTest(input, compositionFor(), [source]);
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.filter((effect) => effect.state === 'applied')).toHaveLength(3);
    expect(result.effects.find((effect) => effect.effectId === 'np')).toMatchObject({
      damageRelevant: true,
    });
    expect(result.effects.find((effect) => effect.effectId === 'charge')).toMatchObject({
      damageRelevant: false,
    });
    expect(result.precision).toBe('exact');
  });

  it('does not apply a card buff to a different NP card', () => {
    const result = resolveSupportSourcesForTest({ ...input, cardType: 'arts' }, compositionFor(), [
      source,
    ]);
    expect(result.input.cardBuff).toBe(0);
    expect(result.effects.find((effect) => effect.effectId === 'buster')).toMatchObject({
      state: 'rejected',
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
    const result = resolveSupportSourcesForTest(input, compositionFor(renamed), [renamed]);

    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
  });

  it('fails closed when the saved source cannot be resolved', () => {
    const result = resolveSupportSourcesForTest(input, compositionFor(), []);
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
    const result = resolveSupportSourcesForTest(input, compositionFor(boosted), [boosted]);
    expect(result.precision).toBe('exact');
    expect(result.npDamageBuffRate).toBe(1);
    expect(result.effects[0]).toMatchObject({
      state: 'applied',
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
    const result = resolveSupportSourcesForTest(input, compositionFor(boosted), [boosted]);
    expect(result.precision).toBe('unsupported');
    expect(result.effects[0]).toMatchObject({
      state: 'unsupported',
      reason: 'damage_effect_not_supported',
    });
  });

  it('fails closed instead of ignoring damage effect script semantics', () => {
    const scripted: ServantMaster = {
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          effects: [
            {
              ...source.skills[0]!.effects[0]!,
              id: 'scripted-attack',
              functionScript: { funcIndividuality: [{ id: 3098, name: 'demeritFunction' }] },
            },
          ],
        },
      ],
    };
    const result = resolveSupportSourcesForTest(input, compositionFor(scripted), [scripted]);
    expect(result).toMatchObject({
      precision: 'unsupported',
      input: { attackBuff: input.attackBuff },
      effects: [{ state: 'unsupported', reason: 'effect_metadata_not_resolved' }],
      warnings: ['support_effect_metadata_not_resolved:support:skill:scripted-attack'],
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
    const result = resolveSupportSourcesForTest(input, compositionFor(defensive), [defensive]);

    expect(result.input.powerMod).toBe(0);
    expect(result.precision).toBe('exact');
    expect(result.effects).toHaveLength(2);
    expect(
      result.effects.every(
        (effect) =>
          effect.kind === null &&
          effect.state !== 'applied' &&
          effect.reason === 'not_np_damage_relevant',
      ),
    ).toBe(true);
  });
});

describe('resolveAttackerSourcesForTest', () => {
  const attacker: ServantMaster = { ...source, id: input.attackerId, name: '攻撃役' };

  it('applies enabled self skills without mutating the base input', () => {
    const result = resolveAttackerSourcesForTest(
      input,
      [{ skillId: 'skill', skillLevel: 10 }],
      [attacker],
    );
    expect(result.input.attackBuff).toBeCloseTo(0.3);
    expect(result.input.cardBuff).toBeCloseTo(0.5);
    expect(result.input.npDamageBuff).toBeCloseTo(0.3);
    expect(result.effects.every((effect) => effect.origin === 'attacker')).toBe(true);
    expect(input).toMatchObject({ attackBuff: 0.1, cardBuff: 0, npDamageBuff: 0 });
  });

  it('can exclude every effect in a self skill independently from its level', () => {
    const result = resolveAttackerSourcesForTest(
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
    expect(result.effects.every((effect) => effect.state !== 'applied')).toBe(true);
  });

  it('uses effect overrides as the only calculator-level switch', () => {
    const result = resolveAttackerSourcesForTest(
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
    expect(result.effects.find((effect) => effect.effectId === 'attack')?.state).toBe('applied');
    expect(result.effects.find((effect) => effect.effectId === 'np')).toMatchObject({
      state: 'rejected',
      reason: 'calculation_effect_disabled',
    });
  });

  it('does not let an override bypass a hard card mismatch', () => {
    const result = resolveAttackerSourcesForTest(
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
      state: 'rejected',
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
    const resolved = resolveAttackerSourcesForTest(
      input,
      [{ skillId: 'skill', skillLevel: 1 }],
      [attacker],
    );
    expect(resolved.effects.find((effect) => effect.effectId === 'zero')).toMatchObject({
      value: 0,
      state: 'applied',
    });
    expect(resolved.effects.find((effect) => effect.effectId === 'missing')).toMatchObject({
      value: null,
      state: 'unsupported',
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
    expect(
      resolveAttackerSourcesForTest(input, selection, [conditional]).input.attackBuff,
    ).toBeCloseTo(0.3);
    const mismatch = resolveAttackerSourcesForTest(input, selection, [
      { ...conditional, traits: [] },
    ]);
    expect(mismatch.input.attackBuff).toBe(0.1);
    expect(mismatch.effects[0]).toMatchObject({
      state: 'rejected',
      reason: 'attacker_trait_mismatch',
    });
  });
});

describe('resolveMysticCodeSourcesForTest', () => {
  const mysticCode: MysticCodeMaster = {
    id: '1',
    name: '魔術礼装･カルデア',
    maxLevel: 10,
    imageKey: null,
    skills: source.skills,
  };

  it('uses the shared effect resolver and fails closed for a missing source', () => {
    const resolved = resolveMysticCodeSourcesForTest(
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
      resolveMysticCodeSourcesForTest(input, undefined, [{ skillId: 'skill', skillLevel: 10 }], [])
        .precision,
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
    expect(resolveCraftEssenceSourcesForTest(input, craftEssence, 0).input.npDamageBuff).toBe(0.6);
    expect(resolveCraftEssenceSourcesForTest(input, craftEssence, 4).input.npDamageBuff).toBe(0.8);
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
    expect(resolvePassiveSourcesForTest(input, attacker).input.cardBuff).toBe(0.08);
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
    const resolved = resolvePassiveSourcesForTest(input, attacker);
    expect(resolved.input.flatDamage).toBe(175);
    expect(resolved.effects[0]).toMatchObject({ kind: 'flatDamage', value: 175, state: 'applied' });
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
    const missed = resolveAttackerSourcesForTest(input, selection, [attacker]);
    expect(missed.input.attackBuff).toBe(0.1);
    expect(missed.effects[0]).toMatchObject({ state: 'rejected', reason: 'field_trait_mismatch' });
    expect(
      resolveAttackerSourcesForTest({ ...input, fieldTraits: ['fieldDarkness'] }, selection, [
        attacker,
      ]).input.attackBuff,
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
      resolveNpSourcesForTest({ ...input, overcharge: 3, npLevel: 2 }, attacker).input.attackBuff,
    ).toBeCloseTo(0.45);
  });

  it('leaves NP damage-function multipliers to the calculation application', () => {
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
    const resolved = resolveNpSourcesForTest(
      {
        ...input,
        npLevel: 5,
        overcharge: 3,
        target: { ...input.target, traits: ['dragon'] },
      },
      attacker,
    );
    expect(resolved.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(resolved.effects).toEqual([]);
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
      resolveAttackerSourcesForTest(
        { ...input, target: { ...input.target, traits: ['dragon'] } },
        selection,
        [attacker],
      ).input.powerMod,
    ).toBe(0.5);
    const missed = resolveAttackerSourcesForTest(input, selection, [attacker]);
    expect(missed.input.powerMod).toBe(0);
    expect(missed.effects[0]?.damageTraitCondition).toEqual({
      kind: 'powerMod',
      condition: { anyOf: ['dragon'], noneOf: [] },
    });
    const explicitlyEnabled = resolveAttackerSourcesForTest(input, selection, [attacker], {
      effectOverrides: {
        'attacker:attacker:attacker:skill:dragon-power': true,
      },
    });
    expect(explicitlyEnabled.input.powerMod).toBe(0);
    expect(explicitlyEnabled.effects[0]).toMatchObject({
      state: 'rejected',
      reason: 'target_trait_mismatch',
    });
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
    expect(resolveAttackerSourcesForTest(input, selection, [attacker]).input.powerMod).toBe(0.5);
    expect(
      resolveAttackerSourcesForTest(
        { ...input, target: { ...input.target, traits: ['superGiant'] } },
        selection,
        [attacker],
      ).input.powerMod,
    ).toBe(0);
  });
});
