import { createHash } from 'node:crypto';
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

    expect(effects).toHaveLength(13_322);
    expect(operations).toHaveLength(13_322);
    expect(Object.fromEntries(Object.entries(counts).sort())).toEqual({
      cardTypeMutation: 12,
      contextMutation: 55,
      damageModifier: 3_738,
      ignoreDamageCut: 1,
      ignoreDefense: 35,
      modifierRateChange: 1,
      nonDamage: 9_420,
      unresolved: 60,
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
    expect(compared).toBe(3_739);
  });

  it('classifies all 10,440 Value effects without placing trait IDs in modifier series', async () => {
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
    expect(valueEffects).toHaveLength(10_440);
    expect(purposeCounts).toEqual({
      modifier: 3_738,
      modifierRate: 1,
      contextTraitId: 73,
      nonDamage: 6_628,
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
    expect(
      valueEffects.filter((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'unresolved' &&
            operation.reason === 'contextReference' &&
            !operation.damageRelevant,
        ),
      ),
    ).toHaveLength(25);
  });

  it('retains every MLB-only effect with explicit availability', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    expect(effects.filter((effect) => effect.availability === 'allLimitBreakStates')).toHaveLength(
      13_314,
    );
    expect(
      effects
        .filter((effect) => effect.availability === 'maximumLimitBreakOnly')
        .map((effect) => ({
          id: effect.id,
          kind: effect.execution[0]?.kind,
          modifier:
            effect.execution[0]?.kind === 'damageModifier' ? effect.execution[0].modifier : null,
        })),
    ).toEqual([
      { id: '265', kind: 'damageModifier', modifier: 'flatDamage' },
      { id: '274', kind: 'nonDamage', modifier: null },
      { id: '118', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '100', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '247', kind: 'damageModifier', modifier: 'npDamageBuff' },
      { id: '109', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '364', kind: 'nonDamage', modifier: null },
      { id: '199', kind: 'nonDamage', modifier: null },
    ]);
  });

  it('ratchets complete shared MLB value evidence without runtime fallbacks', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const sharedValues: unknown[] = [];
    let mlbSkillCraftEssences = 0;
    let sharedEffects = 0;
    let sharedValuedOperations = 0;
    let differingValueOperations = 0;
    let explicitCraftEssenceValuedOperations = 0;
    for (const craftEssence of master.craftEssences) {
      let hasLimitBreakEvidence = false;
      for (const effect of craftEssence.effects) {
        const shared = effect.atlasEvidence.limitBreakParameterSets !== undefined;
        if (shared) {
          hasLimitBreakEvidence = true;
          sharedEffects += 1;
        }
        for (const [operationIndex, operation] of effect.execution.entries()) {
          if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
            continue;
          explicitCraftEssenceValuedOperations += 1;
          expect(operation.limitBreakValues).toBeDefined();
          expect(operation.limitBreakValueExpressions).toBeDefined();
          if (!shared) continue;
          sharedValuedOperations += 1;
          if (JSON.stringify(operation.values) !== JSON.stringify(operation.limitBreakValues))
            differingValueOperations += 1;
          sharedValues.push({
            craftEssenceId: craftEssence.id,
            occurrenceId: effect.occurrenceId,
            operationIndex,
            values: operation.limitBreakValues,
            expressions: operation.limitBreakValueExpressions,
          });
        }
      }
      if (hasLimitBreakEvidence) mlbSkillCraftEssences += 1;
    }
    sharedValues.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    expect(mlbSkillCraftEssences).toBe(898);
    expect(sharedEffects).toBe(2_077);
    expect(sharedValuedOperations).toBe(745);
    expect(differingValueOperations).toBe(735);
    expect(explicitCraftEssenceValuedOperations).toBe(1_307);
    expect(createHash('sha256').update(JSON.stringify(sharedValues)).digest('hex')).toBe(
      '9a70f2009c272e7818d66b6937ee9f10abc7aa74566b935227835840beebada6',
    );
  });
});
