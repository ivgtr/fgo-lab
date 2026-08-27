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
  it('ratchets every probabilistic terminal damage occurrence into canonical proc semantics', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const probabilistic = allEffects(master).filter((effect) => effect.proc.kind !== 'guaranteed');
    expect(
      probabilistic.reduce<Record<string, number>>((counts, effect) => {
        counts[effect.proc.kind] = (counts[effect.proc.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ chainedRolls: 5, independentRolls: 35, singleRoll: 3 });
    expect(new Set(probabilistic.map((effect) => effect.gameActivation))).toEqual(
      new Set(['npBeforeDamage', 'skillUse']),
    );
    expect(
      probabilistic.filter(
        (effect) =>
          (effect.proc.kind === 'singleRoll' || effect.proc.kind === 'independentRolls') &&
          effect.inputDefinitions.length !== 0,
      ),
    ).toEqual([]);
    const chained = probabilistic.filter((effect) => effect.proc.kind === 'chainedRolls');
    expect(chained).toHaveLength(5);
    expect(new Set(chained.map((effect) => effect.gameActivation))).toEqual(
      new Set(['npBeforeDamage']),
    );
    expect(
      chained.every(
        (effect) =>
          effect.procSelection.kind === 'successCount' &&
          effect.procSelection.defaultSelection === 'maximum',
      ),
    ).toBe(true);
    expect(
      master.servants.flatMap((servant) =>
        servant.noblePhantasms.flatMap((np) =>
          np.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
      ),
    ).toHaveLength(5);
    expect(
      master.servants.flatMap((servant) => [
        ...servant.skills.flatMap((skill) =>
          skill.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
        ...servant.passives.flatMap((skill) =>
          skill.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
      ]),
    ).toEqual([]);
    expect(
      probabilistic.filter(
        (effect) =>
          effect.proc.kind === 'chainedRolls' &&
          effect.inputDefinitions.every((input) => input.kind !== 'procSuccessCount'),
      ),
    ).toEqual([]);
    expect(
      probabilistic.filter((effect) =>
        effect.atlasEvidence.parameterSets.some((set) =>
          set.some(
            (parameter) => typeof parameter.Rate === 'number' && Math.abs(parameter.Rate) < 1_000,
          ),
        ),
      ),
    ).toHaveLength(43);
  });

  it('ratchets every raw HP condition before damage relevance filtering', async () => {
    const count = (value: unknown, result = { HP_LOWER: 0, HP_HIGHER: 0 }) => {
      if (!value || typeof value !== 'object') return result;
      if (Object.hasOwn(value, 'HP_LOWER')) result.HP_LOWER += 1;
      if (Object.hasOwn(value, 'HP_HIGHER')) result.HP_HIGHER += 1;
      for (const child of Object.values(value)) count(child, result);
      return result;
    };
    const servants = JSON.parse(
      await readFile(resolve(root, 'data/raw/nice_servant.json'), 'utf8'),
    ) as unknown;
    const craftEssences = JSON.parse(
      await readFile(resolve(root, 'data/raw/nice_equip.json'), 'utf8'),
    ) as unknown;

    // script and originalScript contain the same condition; divide by the two evidence copies.
    const servantCounts = count(servants);
    const craftEssenceCounts = count(craftEssences);
    expect({
      HP_LOWER: servantCounts.HP_LOWER / 2,
      HP_HIGHER: servantCounts.HP_HIGHER / 2,
    }).toEqual({ HP_LOWER: 6, HP_HIGHER: 2 });
    expect({
      HP_LOWER: craftEssenceCounts.HP_LOWER / 2,
      HP_HIGHER: craftEssenceCounts.HP_HIGHER / 2,
    }).toEqual({ HP_LOWER: 1, HP_HIGHER: 0 });
  });

  it('ratchets every normalized HP condition family and cumulative series', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    const hpEvidence = effects.filter((effect) =>
      effect.atlasEvidence.buffConditionKeys.some(
        (key) => key === 'HP_LOWER' || key === 'HP_HIGHER',
      ),
    );
    const thresholdSeries = effects.filter(
      (effect) => effect.interaction?.kind === 'quantityThresholdSeries',
    );

    expect(hpEvidence).toHaveLength(9);
    expect(
      hpEvidence.reduce<Record<string, number>>((counts, effect) => {
        for (const key of effect.atlasEvidence.buffConditionKeys)
          counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ HP_LOWER: 7, HP_HIGHER: 2 });
    expect(
      hpEvidence.flatMap((effect) =>
        effect.atlasEvidence.buffConditionKeys.flatMap((key) =>
          key === 'HP_LOWER' || key === 'HP_HIGHER'
            ? [
                {
                  key,
                  comparisons: effect.quantityConditions
                    .filter((condition) => condition.quantity === 'attackerHpPermille')
                    .map((condition) => condition.comparison),
                  values: effect.quantityConditions
                    .filter((condition) => condition.quantity === 'attackerHpPermille')
                    .map((condition) => condition.value),
                },
              ]
            : [],
        ),
      ),
    ).toEqual([
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [990] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [750] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [250] },
      { key: 'HP_LOWER', comparisons: ['atLeast', 'atMost'], values: [0, 500] },
      { key: 'HP_HIGHER', comparisons: ['atLeast'], values: [500] },
      { key: 'HP_HIGHER', comparisons: ['atLeast'], values: [1000] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
    ]);
    expect(thresholdSeries).toHaveLength(5);
    expect(new Set(thresholdSeries.map((effect) => effect.interaction?.key)).size).toBe(1);
    expect(
      thresholdSeries.flatMap((effect) =>
        effect.quantityConditions
          .filter((condition) => condition.quantity === 'attackerHpPermille')
          .map((condition) => condition.value),
      ),
    ).toEqual([990, 750, 500, 250]);
    expect(
      hpEvidence.reduce<Record<string, number>>((counts, effect) => {
        const operation = effect.execution.find((candidate) => candidate.kind !== 'nonDamage');
        const family =
          operation?.kind === 'damageModifier' &&
          operation.valueExpressions
            .flat()
            .some((expression) => expression?.kind === 'hpRangeLinear')
            ? 'hpRangeLinear'
            : operation?.kind === 'damageModifier' &&
                effect.interaction?.kind === 'quantityThresholdSeries'
              ? 'quantityThresholdModifier'
              : operation?.kind === 'damageModifier'
                ? 'standaloneConditionalModifier'
                : 'nonDamage';
        counts[family] = (counts[family] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      hpRangeLinear: 1,
      quantityThresholdModifier: 4,
      standaloneConditionalModifier: 1,
      nonDamage: 3,
    });
  });

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
    expect(operations).toHaveLength(13_325);
    expect(Object.fromEntries(Object.entries(counts).sort())).toEqual({
      cardTypeMutation: 12,
      contextMutation: 64,
      damageModifier: 3_739,
      ignoreDamageCut: 1,
      ignoreDefense: 35,
      modifierRateChange: 1,
      nonDamage: 9_418,
      unresolved: 55,
    });
  });

  it('ratchets canonical contribution scopes independently from target routing', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const scoped = allEffects(master)
      .flatMap((effect) => effect.execution)
      .filter((operation) => 'contributionScope' in operation);
    const terminal = scoped.filter((operation) =>
      [
        'damageModifier',
        'modifierRateChange',
        'ignoreDefense',
        'ignoreDamageCut',
        'cardTypeMutation',
      ].includes(operation.kind),
    );
    const counts = (operations: typeof scoped) =>
      operations.reduce<Record<string, number>>((result, operation) => {
        result[operation.contributionScope] = (result[operation.contributionScope] ?? 0) + 1;
        return result;
      }, {});
    expect(counts(scoped)).toEqual({
      personal: 2_605,
      partyWide: 857,
      partyOther: 39,
      enemyApplied: 345,
    });
    expect(counts(terminal)).toEqual({
      personal: 2_574,
      partyWide: 849,
      partyOther: 34,
      enemyApplied: 331,
    });
  });

  it('keeps modifier values exactly equal to the former execution value source', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const effects = allEffects(master);
    let compared = 0;
    for (const effect of effects) {
      if (effect.operationReference !== null) continue;
      for (const operation of effect.execution) {
        if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
          continue;
        expect(operation.values).toEqual(evidenceValues(effect));
        if (operation.limitBreakValues)
          expect(operation.limitBreakValues).toEqual(evidenceValues(effect, true));
        compared += 1;
      }
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
      modifier: 3_739,
      modifierRate: 1,
      contextTraitId: 73,
      nonDamage: 6_627,
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

  it('ratchets build-time referenced skills and their ordered canonical operations', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    expect(
      allEffects(master)
        .filter((effect) => effect.operationReference !== null)
        .map((effect) => ({
          effectId: effect.id,
          reference: effect.operationReference,
          operations: effect.execution.map((operation) => operation.kind),
        })),
    ).toEqual([
      {
        effectId: '23291',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970869',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['contextMutation', 'nonDamage'],
      },
      {
        effectId: '23560',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970936',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['nonDamage', 'nonDamage'],
      },
      {
        effectId: '2096',
        reference: {
          kind: 'resolvedSkill',
          skillId: '961313',
          levelSource: 'skillLevelParameter',
          defaultLevel: 1,
        },
        operations: ['contextMutation', 'damageModifier'],
      },
      {
        effectId: '21814',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970535',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['contextMutation'],
      },
    ]);
  });

  it('retains trait provenance policies instead of reducing them to combined traits', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const counts = allEffects(master).reduce<Record<string, number>>((result, effect) => {
      const key = [
        effect.traitReadPolicy.stateSources,
        effect.traitReadPolicy.ignoredStateTraits,
        effect.traitReadPolicy.unremovableStateTraits,
      ].join(':');
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      'activeOnly:exclude:include': 13_306,
      'activeAndPassive:exclude:include': 6,
      'activeOnly:include:include': 7,
      'activeOnly:exclude:exclude': 3,
    });
  });

  it('keeps linked trait grants and suppressions under one canonical state identity', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const linked = allEffects(master).filter((effect) => effect.stateIdentity !== null);
    expect(linked).toHaveLength(25);
    const paired = linked.filter((effect) => effect.stateIdentity?.key === 'trait:2841');
    expect(
      paired.map((effect) => ({
        effectId: effect.id,
        identity: effect.stateIdentity,
        operations: effect.execution,
      })),
    ).toEqual([
      {
        effectId: '9619',
        identity: { kind: 'linkedTraitFamily', key: 'trait:2841' },
        operations: [
          expect.objectContaining({
            kind: 'contextMutation',
            mutation: 'addTrait',
            trait: 'alignmentLawful',
          }),
        ],
      },
      {
        effectId: '9620',
        identity: { kind: 'linkedTraitFamily', key: 'trait:2841' },
        operations: [
          expect.objectContaining({
            kind: 'contextMutation',
            mutation: 'suppressInitialTrait',
            trait: 'alignmentChaotic',
          }),
        ],
      },
    ]);
  });

  it('normalizes forced-equality field counts without widening a single-enemy condition', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const fieldCountEffects = allEffects(master).filter((effect) =>
      effect.atlasEvidence.parameterSemantics.condition.includes('TriggeredFieldCountRange'),
    );
    expect(fieldCountEffects).toHaveLength(1);
    expect(fieldCountEffects[0]).toMatchObject({
      inputDefinitions: [
        {
          kind: 'fieldActorCount',
          owner: 'field',
          minimum: 1,
          maximum: 3,
          defaultValue: 1,
        },
      ],
      inputQuantityConditions: [{ comparison: 'atMost', value: 1 }],
    });
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
    const purelyBloom = master.craftEssences
      .find((craftEssence) => craftEssence.id === '9400810')
      ?.effects.find((effect) => effect.occurrenceId === '249:0')?.execution[0];
    const crimson = master.craftEssences
      .find((craftEssence) => craftEssence.id === '9400850')
      ?.effects.find((effect) => effect.occurrenceId === '267:0')?.execution[0];
    expect(purelyBloom).toMatchObject({
      kind: 'damageModifier',
      valueExpressions: [[{ kind: 'inputLinear', maximumUnits: 9 }], [], [], [], []],
      limitBreakValueExpressions: [
        [{ kind: 'inputLinear', maximumUnits: 11, maximumValuePermille: 500 }],
        [],
        [],
        [],
        [],
      ],
    });
    expect(crimson).toMatchObject({
      kind: 'damageModifier',
      valueExpressions: [[{ kind: 'inputLinear', maximumUnits: 11 }], [], [], [], []],
      limitBreakValueExpressions: [
        [{ kind: 'inputLinear', maximumUnits: 13, maximumValuePermille: 1200 }],
        [],
        [],
        [],
        [],
      ],
    });
    expect(createHash('sha256').update(JSON.stringify(sharedValues)).digest('hex')).toBe(
      'eaf94a1c80ddd684e7f1b09b12c9b3591273afd2842392f11409d5b522f55575',
    );
  });
});
