import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getBaseAttackNoblePhantasmVariant,
  getAttackNoblePhantasmVariants,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

function allEffects(master: ReturnType<typeof masterSnapshotSchema.parse>): MasterEffect[] {
  return [
    ...master.servants.flatMap((servant) => [
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...getNoblePhantasmVariants(servant).flatMap((np) => np.effects),
    ]),
    ...master.craftEssences.flatMap((ce) => ce.effects),
    ...master.mysticCodes.flatMap((code) => code.skills.flatMap((skill) => skill.effects)),
  ];
}

function atlasValuePurpose(effect: MasterEffect) {
  if (
    effect.atlasEvidence.buffTypes.some(
      (buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality',
    )
  )
    return 'contextTraitId';
  if (effect.execution.some((operation) => operation.kind === 'modifierRateChange'))
    return 'modifierRate';
  if (effect.execution.some((operation) => operation.kind === 'damageModifier')) return 'modifier';
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
          .flatMap((servant) => getAttackNoblePhantasmVariants(servant).flatMap((np) => np.damage))
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
    const contextProducers = effects.filter((effect) =>
      effect.execution.some((operation) => operation.kind === 'contextMutation'),
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
      master.servants.filter((servant) => getBaseAttackNoblePhantasmVariant(servant)),
    ).toHaveLength(420);
    expect(damageKinds).toEqual({
      battlePointPhase: 2,
      defensePiercing: 67,
      hpRatioLow: 6,
      standard: 371,
      stateTrait: 13,
      targetRarity: 1,
      trait: 141,
      traitCount: 20,
      traitExpression: 1,
    });
    expect(conditionOperators).toEqual(['all', 'any']);
    expect(contextProducers.length).toBeGreaterThan(0);
    expect(contextConsumers.length).toBeGreaterThan(0);
    expect(sorted(effects.map((effect) => effect.atlasEvidence.functionType))).toMatchSnapshot(
      'effect-types',
    );
    expect(sorted(effects.flatMap((effect) => effect.atlasEvidence.buffTypes))).toMatchSnapshot(
      'buff-types',
    );
    expect(
      sorted(
        effects.flatMap((effect) =>
          effect.atlasEvidence.parameterSets.flatMap((set) =>
            set.flatMap((parameter) => Object.keys(parameter)),
          ),
        ),
      ),
    ).toMatchSnapshot('parameter-keys');

    const valueEffects = effects.filter((effect) =>
      effect.atlasEvidence.parameterSemantics.value.includes('Value'),
    );
    expect(valueEffects).toHaveLength(10_706);
    expect(
      Object.fromEntries(
        Object.entries(
          valueEffects.reduce<Record<string, number>>((counts, effect) => {
            const purpose = atlasValuePurpose(effect);
            counts[purpose] = (counts[purpose] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(),
      ),
    ).toEqual({ contextTraitId: 74, modifier: 3_834, modifierRate: 1, nonDamage: 6_797 });
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
        getAttackNoblePhantasmVariants(servant).flatMap((np) =>
          np.damage.map((damage) => damage.kind),
        ),
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
