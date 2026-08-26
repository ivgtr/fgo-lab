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

function evidenceValues(effect: MasterEffect, limitBreak = false) {
  const sets =
    limitBreak && effect.atlasEvidence.limitBreakParameterSets
      ? effect.atlasEvidence.limitBreakParameterSets
      : effect.atlasEvidence.parameterSets;
  return sets.map((set) =>
    set.map((parameter) => (typeof parameter['Value'] === 'number' ? parameter['Value'] : null)),
  );
}

describe('production canonical execution semantics', () => {
  it('maps every raw occurrence to a typed operation family', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    const operations = effects.flatMap((effect) => effect.execution);
    const counts = operations.reduce<Record<string, number>>((result, operation) => {
      result[operation.kind] = (result[operation.kind] ?? 0) + 1;
      return result;
    }, {});

    expect(effects).toHaveLength(13_314);
    expect(operations).toHaveLength(13_314);
    expect(Object.fromEntries(Object.entries(counts).sort())).toEqual({
      cardTypeMutation: 12,
      contextMutation: 55,
      damageModifier: 3_733,
      ignoreDamageCut: 1,
      ignoreDefense: 35,
      modifierRateChange: 1,
      nonDamage: 9_442,
      unresolved: 35,
    });
  });

  it('keeps modifier values exactly equal to the former execution value source', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    let compared = 0;
    for (const effect of effects)
      for (const operation of effect.execution) {
        if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
          continue;
        expect(operation.values).toEqual(evidenceValues(effect));
        if (operation.limitBreakValues)
          expect(operation.limitBreakValues).toEqual(evidenceValues(effect, true));
        compared += 1;
      }
    expect(compared).toBe(3_734);
  });

  it('classifies all 10,432 Value effects without placing trait IDs in modifier series', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const valueEffects = allEffects(master).filter((effect) =>
      effect.atlasEvidence.parameterSemantics.value.includes('Value'),
    );
    const purposeCounts = { modifier: 0, modifierRate: 0, contextTraitId: 0, nonDamage: 0 };
    for (const effect of valueEffects) {
      if (
        effect.atlasEvidence.buffTypes.some(
          (buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality',
        )
      )
        purposeCounts.contextTraitId += 1;
      else if (effect.execution.some((operation) => operation.kind === 'modifierRateChange'))
        purposeCounts.modifierRate += 1;
      else if (effect.execution.some((operation) => operation.kind === 'damageModifier'))
        purposeCounts.modifier += 1;
      else purposeCounts.nonDamage += 1;
    }
    expect(valueEffects).toHaveLength(10_432);
    expect(purposeCounts).toEqual({
      modifier: 3_733,
      modifierRate: 1,
      contextTraitId: 73,
      nonDamage: 6_625,
    });
    expect(
      valueEffects
        .filter((effect) =>
          effect.atlasEvidence.buffTypes.some(
            (buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality',
          ),
        )
        .some((effect) =>
          effect.execution.some(
            (operation) =>
              operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange',
          ),
        ),
    ).toBe(false);
  });
});
