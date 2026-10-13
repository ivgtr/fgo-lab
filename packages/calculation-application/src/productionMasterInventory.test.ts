import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalRequirementLeaves,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
let productionMaster: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;
function loadProductionMaster() {
  productionMaster ??= readFile(
    resolve(root, 'packages/test-fixtures/production-master/master.json'),
    'utf8',
  ).then((content) => masterSnapshotSchema.parse(JSON.parse(content)));
  return productionMaster;
}

describe('production master inventory ratchet', () => {
  it('preserves every damage-reachable target-state grant and removal', async () => {
    const master = await loadProductionMaster();
    const targetStateTraits = [
      'buffBound',
      'buffBurn',
      'buffCharm',
      'buffConfusion',
      'buffCurse',
      'buffDeathResistDown',
      'buffEvade',
      'buffImmobilize',
      'buffMentalEffect',
      'buffNegativeEffect',
      'buffPoison',
      'buffTerrorStunChanceAfterTurn',
      'marking',
      'skillSeal',
      'traitId:10047',
      'traitId:10052',
    ] as const;
    const targetStateTraitSet = new Set<string>(targetStateTraits);
    const effects: {
      ownerId: string;
      source: string;
      effect: MasterEffect;
      timing: 'beforeDamage' | 'afterDamage' | null;
    }[] = [
      ...master.servants.flatMap((servant) => [
        ...[...servant.skills, ...servant.passives].flatMap((skill) =>
          skill.effects.map((effect) => ({
            ownerId: servant.id,
            source: 'skill',
            effect,
            timing: null,
          })),
        ),
        ...getNoblePhantasmVariants(servant).flatMap((variant) =>
          variant.effects.map((effect) => ({
            ownerId: servant.id,
            source: 'np',
            effect,
            timing: effect.timing,
          })),
        ),
      ]),
      ...master.craftEssences.flatMap((craftEssence) =>
        craftEssence.effects.map((effect) => ({
          ownerId: craftEssence.id,
          source: 'equip',
          effect,
          timing: null,
        })),
      ),
      ...master.mysticCodes.flatMap((mysticCode) =>
        mysticCode.skills.flatMap((skill) =>
          skill.effects.map((effect) => ({
            ownerId: mysticCode.id,
            source: 'mysticCode',
            effect,
            timing: null,
          })),
        ),
      ),
    ];
    const mutations = effects.flatMap((item) =>
      item.effect.execution.flatMap((operation) =>
        operation.kind === 'contextMutation' &&
        'scope' in operation &&
        operation.scope === 'recipientState' &&
        (operation.mutation === 'addTrait' || operation.mutation === 'removeTrait') &&
        targetStateTraitSet.has(operation.trait)
          ? [{ ...item, operation }]
          : [],
      ),
    );
    const additions = mutations.filter(({ operation }) => operation.mutation === 'addTrait');
    const removals = mutations.filter(({ operation }) => operation.mutation === 'removeTrait');
    expect([...new Set(additions.map(({ operation }) => operation.trait))].sort()).toEqual(
      targetStateTraits.filter((trait) => trait !== 'traitId:10052'),
    );
    const consumerTraits = new Set<string>();
    for (const { effect } of effects)
      for (const requirement of canonicalRequirementLeaves(effect.requirement.expression))
        if (
          requirement.kind === 'trait' &&
          (requirement.scope === 'recipientState' || requirement.scope === 'opponentState')
        )
          consumerTraits.add(requirement.trait);
    for (const servant of master.servants)
      for (const variant of getNoblePhantasmVariants(servant))
        if (variant.kind === 'attack')
          for (const damage of variant.damage)
            for (const trait of damage.stateTraitNames) consumerTraits.add(trait);
    expect([...consumerTraits].sort()).toEqual(targetStateTraits);
    expect({
      operations: additions.length,
      effectOccurrences: new Set(
        additions.map(
          ({ ownerId, source, effect }) => `${source}:${ownerId}:${effect.occurrenceId}`,
        ),
      ).size,
      owners: new Set(additions.map(({ ownerId }) => ownerId)).size,
      guaranteed: additions.filter(({ effect }) => effect.proc.kind === 'guaranteed').length,
      probabilistic: additions.filter(({ effect }) => effect.proc.kind !== 'guaranteed').length,
      beforeDamage: additions.filter(({ timing }) => timing === 'beforeDamage').length,
      afterDamage: additions.filter(({ timing }) => timing === 'afterDamage').length,
      removals: removals.length,
    }).toEqual({
      operations: 1_403,
      effectOccurrences: 807,
      owners: 320,
      guaranteed: 1_394,
      probabilistic: 9,
      beforeDamage: 88,
      afterDamage: 815,
      removals: 9,
    });
    expect(
      additions.filter(
        ({ effect }) => !['addState', 'addStateShort'].includes(effect.atlasEvidence.functionType),
      ),
    ).toEqual([]);
    expect(additions.every(({ operation }) => operation.damageRelevant)).toBe(true);
  });
});
