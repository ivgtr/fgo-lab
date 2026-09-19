import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getBaseAttackNoblePhantasmVariant,
  getAttackNoblePhantasmVariants,
  getNoblePhantasmVariants,
  canonicalRequirementLeaves,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { beforeAll, describe, expect, it } from 'vitest';
import { noblePhantasmDamageDependency } from '@fgo-lab/battle-execution';

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
  return 'otherOperation';
}

describe('E0 production master execution inventory', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
  }, 5_000);

  it('locks every normalized function family and context dependency', () => {
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
      effects.flatMap((effect) => {
        const collect = (requirement: typeof effect.requirement.expression): string[] =>
          requirement.kind === 'all' || requirement.kind === 'any'
            ? [requirement.kind, ...requirement.requirements.flatMap(collect)]
            : requirement.kind === 'not'
              ? collect(requirement.requirement)
              : [];
        return collect(effect.requirement.expression);
      }),
    );
    const contextProducers = effects.filter((effect) =>
      effect.execution.some((operation) => operation.kind === 'contextMutation'),
    );
    const resourceMutations = effects.flatMap((effect) =>
      effect.execution.filter(({ kind }) => kind === 'resourceMutation'),
    );
    const resourceCounts = Object.fromEntries(
      Object.entries(
        resourceMutations.reduce<Record<string, number>>((counts, operation) => {
          if (operation.kind === 'resourceMutation')
            counts[operation.resource] = (counts[operation.resource] ?? 0) + 1;
          return counts;
        }, {}),
      ).sort(),
    );
    const npValueDependencies = master.servants.flatMap((servant) =>
      getAttackNoblePhantasmVariants(servant).flatMap((np) =>
        np.damage.flatMap((damage) => {
          const dependency = noblePhantasmDamageDependency(damage, 1, 1);
          return ['hpRatioLow', 'battlePointPhase', 'traitCount'].includes(damage.kind)
            ? [{ damageKind: damage.kind, dependencyKind: dependency.kind }]
            : [];
        }),
      ),
    );
    const contextConsumers = effects.filter((effect) =>
      canonicalRequirementLeaves(effect.requirement.expression).some(
        (requirement) => requirement.kind === 'trait' || requirement.kind === 'targetPredicate',
      ),
    );

    expect(master.servants).toHaveLength(469);
    expect(
      master.servants.filter((servant) => getBaseAttackNoblePhantasmVariant(servant)),
    ).toHaveLength(419);
    expect(damageKinds).toEqual({
      battlePointPhase: 2,
      defensePiercing: 67,
      hpRatioLow: 6,
      standard: 375,
      stateTrait: 13,
      targetRarity: 1,
      trait: 143,
      traitCount: 22,
      traitExpression: 1,
    });
    expect(conditionOperators).toEqual(['all', 'any']);
    expect(contextProducers.length).toBeGreaterThan(0);
    expect(contextConsumers.length).toBeGreaterThan(0);
    expect(resourceCounts).toEqual({
      battlePoint: 7,
      criticalStars: 255,
      hp: 181,
      npGauge: 742,
    });
    expect(
      npValueDependencies.reduce<Record<string, number>>((counts, item) => {
        const key = `${item.damageKind}:${item.dependencyKind}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      'battlePointPhase:quantity': 2,
      'hpRatioLow:quantity': 6,
      'traitCount:any': 22,
    });
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
    expect(valueEffects).toHaveLength(10_865);
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
    ).toEqual({ contextTraitId: 80, modifier: 3_885, modifierRate: 1, otherOperation: 6_899 });
  });

  it('locks mandatory real-master scenarios without production branching', () => {
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
