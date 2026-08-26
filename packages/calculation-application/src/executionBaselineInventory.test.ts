import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema, type MasterEffect } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

function allEffects(master: ReturnType<typeof masterSnapshotSchema.parse>): MasterEffect[] {
  return [
    ...master.servants.flatMap((servant) => [
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...servant.noblePhantasms.flatMap((np) => np.effects),
    ]),
    ...master.craftEssences.flatMap((ce) => ce.effects),
    ...master.mysticCodes.flatMap((code) => code.skills.flatMap((skill) => skill.effects)),
  ];
}

const nonDamageBuffs = new Set([
  'changeCommandCardType',
  'downTolerance',
  'upCriticaldamage',
  'upExtraattack',
  'upTolerance',
  'upToleranceSubstate',
]);
const directModifierBuffs = new Set([
  'addDamage',
  'downAtk',
  'downDefence',
  'downDefenceNpdamage',
  'downNpdamage',
  'pierceDefence',
  'pierceSubdamage',
  'upAtk',
  'upDamage',
  'upDamageIndividuality',
  'upDamageIndividualityActiveonly',
  'upDefence',
  'upDefenceNpdamage',
  'upNpdamage',
]);
const cardModifierBuffs = new Set([
  'downCommandall',
  'downDefencecommandall',
  'upCommandall',
  'upCommandatk',
  'upDefencecommandall',
]);

function rawValuePurpose(effect: MasterEffect) {
  const buffs = effect.buffTypes ?? [];
  if (buffs.some((buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality'))
    return 'contextTraitId';
  if (buffs.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp'))
    return 'modifierRate';
  if (
    !buffs.some((buff) => nonDamageBuffs.has(buff)) &&
    (buffs.some((buff) => directModifierBuffs.has(buff)) ||
      (effect.cardTypes.length > 0 && buffs.some((buff) => cardModifierBuffs.has(buff))))
  )
    return 'modifier';
  return 'nonDamage';
}

describe('E0 production master execution inventory', () => {
  it('locks every normalized function family and context dependency', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
    const damageKinds = Object.fromEntries(
      Object.entries(
        master.servants
          .flatMap((servant) => servant.noblePhantasms.flatMap((np) => np.damage))
          .reduce<Record<string, number>>((counts, damage) => {
            counts[damage.kind] = (counts[damage.kind] ?? 0) + 1;
            return counts;
          }, {}),
      ).sort(),
    );
    const conditionOperators = sorted(
      effects.flatMap((effect) => [
        ...effect.conditions.recipient.map((condition) => condition.operator),
        effect.conditions.holder.operator,
        effect.conditions.opponent.operator,
        effect.conditions.field.operator,
      ]),
    );
    const contextProducers = effects.filter(
      (effect) =>
        effect.contextChanges.addedFieldTraits.length > 0 ||
        effect.contextChanges.addedRecipientTraits.length > 0,
    );
    const contextConsumers = effects.filter(
      (effect) =>
        effect.conditions.field.traits.length > 0 ||
        effect.conditions.recipient.some((condition) => condition.traits.length > 0) ||
        effect.conditions.holder.traits.length > 0 ||
        effect.conditions.opponent.traits.length > 0,
    );

    expect(master.servants).toHaveLength(469);
    expect(
      master.servants.filter((servant) =>
        servant.noblePhantasms.some((np) => np.damage.length > 0),
      ),
    ).toHaveLength(420);
    expect(damageKinds).toEqual({
      battlePointPhase: 2,
      defensePiercing: 67,
      hpRatioLow: 6,
      standard: 371,
      stateTrait: 12,
      targetRarity: 1,
      trait: 141,
      traitCount: 20,
      traitExpression: 1,
    });
    expect(conditionOperators).toEqual(['all', 'any', 'partial']);
    expect(contextProducers.length).toBeGreaterThan(0);
    expect(contextConsumers.length).toBeGreaterThan(0);
    expect(sorted(effects.map((effect) => effect.type))).toMatchSnapshot('effect-types');
    expect(sorted(effects.flatMap((effect) => effect.buffTypes ?? []))).toMatchSnapshot(
      'buff-types',
    );
    expect(
      sorted(
        effects.flatMap((effect) =>
          effect.parameterSets.flatMap((set) => set.flatMap((parameter) => Object.keys(parameter))),
        ),
      ),
    ).toMatchSnapshot('parameter-keys');

    const valueEffects = effects.filter((effect) =>
      effect.parameterSemantics.value.includes('Value'),
    );
    expect(valueEffects).toHaveLength(10_432);
    expect(
      Object.fromEntries(
        Object.entries(
          valueEffects.reduce<Record<string, number>>((counts, effect) => {
            const purpose = rawValuePurpose(effect);
            counts[purpose] = (counts[purpose] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(),
      ),
    ).toEqual({ contextTraitId: 73, modifier: 3_733, modifierRate: 1, nonDamage: 6_625 });
  });

  it('locks mandatory real-master scenarios without production branching', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const required = [
      ['2300500', 'アーキタイプ：アース'],
      ['2801000', 'ダンテ・アリギエーリ'],
      ['505200', '武則天'],
      ['405900', 'リリス'],
    ] as const;
    for (const [id, name] of required)
      expect(master.servants.find((servant) => servant.id === id)?.name).toBe(name);
    const families = new Set(
      master.servants.flatMap((servant) =>
        servant.noblePhantasms.flatMap((np) => np.damage.map((damage) => damage.kind)),
      ),
    );
    expect(families).toEqual(
      new Set([
        'standard',
        'defensePiercing',
        'trait',
        'traitCount',
        'stateTrait',
        'hpRatioLow',
        'battlePointPhase',
        'targetRarity',
        'traitExpression',
      ]),
    );
  });
});
