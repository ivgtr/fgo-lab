import { describe, expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { master, source, stackEffectTemplate } from './stackQuantityFixture';

describe('physical stack source master admission', () => {
  it('admits distinct reader caps but rejects contradictory baselines before execution', () => {
    const data = structuredClone(master);
    const variant = data.servants[0]!.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (variant.kind !== 'attack') throw new Error('fixture');
    const other = structuredClone(variant.damage[0]!);
    if (other.kind !== 'traitCount' || other.quantity.kind !== 'stacks') throw new Error('fixture');
    other.functionId = 'second-reader';
    other.quantity.inputs[0]!.maximum = 10;
    for (const row of other.parametersByOvercharge)
      for (const cell of row) cell.maximumTargetCount = 10;
    variant.damage.push(other);
    expect(masterSnapshotSchema.safeParse(data).success).toBe(true);
    other.quantity.inputs[0]!.defaultValue = 2;
    const result = masterSnapshotSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected invalid master');
    expect(
      result.error.issues.some(
        ({ message }) => message === `conflicting_stack_source_baseline:${source.key}`,
      ),
    ).toBe(true);
  });

  it.each(['npEffect', 'craftEssence', 'otherVariant'] as const)(
    'checks %s definitions in the same master admission inventory',
    (location) => {
      const data = structuredClone(master);
      const actor = data.servants[0]!;
      const variant = actor.noblePhantasmVariantGroups[0]!.variants[0]!;
      const effect = {
        ...stackEffectTemplate,
        id: 'source-definition',
        occurrenceId: 'source-definition:0',
        gameActivation: 'npBeforeDamage',
        timing: 'beforeDamage',
        proc: { kind: 'guaranteed' },
        selection: null,
        inputDefinitions: [{ ...source, defaultValue: 2 }],
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
        execution: [
          {
            kind: 'contextMutation',
            mutation: 'addTrait',
            scope: 'recipientState',
            trait: 'unrelated-state',
            damageRelevant: true,
            route: {
              target: 'sourceSelf',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
            },
          },
        ],
      };
      const input = {
        ...data,
        servants:
          location === 'craftEssence'
            ? data.servants
            : [
                {
                  ...actor,
                  noblePhantasmVariantGroups: [
                    {
                      ...actor.noblePhantasmVariantGroups[0],
                      variants:
                        location === 'npEffect'
                          ? [{ ...variant, effects: [effect] }]
                          : [
                              variant,
                              {
                                ...variant,
                                canonicalId: '1'.repeat(64),
                                ref: { ...variant.ref, noblePhantasmId: 'second-variant' },
                                effects: [effect],
                              },
                            ],
                    },
                  ],
                },
              ],
        craftEssences:
          location !== 'craftEssence'
            ? data.craftEssences
            : [
                {
                  ...data.craftEssences[0],
                  effects: [
                    Object.fromEntries(Object.entries(effect).filter(([key]) => key !== 'timing')),
                  ],
                },
              ],
      };
      effect.inputDefinitions[0]!.defaultValue = 0;
      expect(masterSnapshotSchema.safeParse(input).success).toBe(true);
      effect.inputDefinitions[0]!.defaultValue = 2;
      const result = masterSnapshotSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected invalid master');
      expect(
        result.error.issues.some(
          ({ message }) => message === `conflicting_stack_source_baseline:${source.key}`,
        ),
      ).toBe(true);
    },
  );
});
