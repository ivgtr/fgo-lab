import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import manifest from '../../test-fixtures/master/manifest.json';
import {
  deriveCraftEssenceAtk,
  masterEffectSchema,
  masterManifestSchema,
  masterSnapshotSchema,
  naturalServantLevel,
  validateMasterSnapshot,
} from './index';

const parsedFixture = masterSnapshotSchema.parse(fixture);
const nonDamageEffect = {
  id: 'test-effect',
  occurrenceId: 'test-effect:0',
  label: 'test',
  availability: 'maximumLimitBreakOnly' as const,
  inclusionPolicy: { default: 'include' as const },
  gameActivation: 'constant' as const,
  proc: { kind: 'guaranteed' as const },
  selection: null,
  interaction: null,
  triggerScope: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  inputDefinitions: [],
  requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
  resourceTransition: null,
  execution: [{ kind: 'nonDamage' as const }],
  atlasEvidence: {
    functionType: 'test',
    target: 'self',
    parameterSets: [[], [], [], [], []],
    parameterSemantics: {
      value: [],
      lifecycle: [],
      presentation: [],
      condition: [],
      contextMutation: [],
      choice: [],
      valueExpression: [],
      buffIdentity: [],
      unresolved: [],
    },
    unresolvedSemanticKeys: [],
    buffTypes: [],
    buffRateTargets: [],
    buffConditionKeys: [],
  },
};

describe('master validation', () => {
  it('accepts only the current master manifest schema', () => {
    expect(masterManifestSchema.safeParse(manifest).success).toBe(true);
    expect(masterManifestSchema.safeParse({ ...manifest, schemaVersion: 28 }).success).toBe(false);
    expect(masterManifestSchema.safeParse({ ...manifest, schemaVersion: 6 }).success).toBe(false);
  });
  it('accepts the legal minimal fixture', () =>
    expect(validateMasterSnapshot(fixture)).toEqual({
      valid: true,
      errors: [],
      unknownAttackFunctions: [],
    }));
  it('rejects contradictory NP capacity and partial resource transitions', () => {
    expect(
      masterSnapshotSchema.safeParse({
        ...fixture,
        npResourceSemantics: {
          ...fixture.npResourceSemantics,
          capacityByNpLevel: [10_000, 10_000, 10_000, 10_000, 10_000],
        },
      }).success,
    ).toBe(false);
    expect(
      masterEffectSchema.safeParse({
        ...nonDamageEffect,
        resourceTransition: {
          kind: 'fixed',
          recipient: 'sourceActor',
          direction: 'gain',
          amounts: [[1_000], [], [], [], []],
          overflow: 'clampToCapacity',
        },
      }).success,
    ).toBe(false);
  });
  it('rejects a partial canonical route and accepts an explicit unresolved route', () => {
    const valued = {
      kind: 'damageModifier' as const,
      modifier: 'attackBuff' as const,
      sign: 1 as const,
      card: null,
      semanticSupport: 'supported' as const,
      values: [[100], [], [], [], []],
      valueExpressions: [[null], [], [], [], []],
    };
    expect(
      masterEffectSchema.safeParse({
        ...nonDamageEffect,
        execution: [
          {
            ...valued,
            route: {
              target: 'sourceSelf',
              contributionScope: 'personal',
              eligibility: { kind: 'requiredRecipient', recipient: 'attacker' },
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      masterEffectSchema.safeParse({
        ...nonDamageEffect,
        execution: [
          {
            kind: 'unresolved',
            route: {
              target: 'unresolved',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
            },
            reason: 'unresolvedTarget',
            damageRelevant: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      masterEffectSchema.safeParse({
        ...nonDamageEffect,
        quantityConditions: [],
      }).success,
    ).toBe(false);
  });
  it('rejects conflicting semantics for one canonical NP variant ID', () => {
    const source = fixture.servants[0]!;
    const sourceForm = source.actorFormGraph.forms[0]!;
    const sourceVariant = source.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (sourceVariant.kind !== 'attack') throw new TypeError('attack fixture required');
    const duplicateFormId = { actorId: 'fixture-saber-duplicate', limitCount: 0 };
    const duplicateRef = {
      actorFormId: duplicateFormId,
      noblePhantasmId: sourceVariant.ref.noblePhantasmId,
    };
    const snapshotWithDuplicateCard = (
      card: typeof sourceVariant.card,
      canonicalId = sourceVariant.canonicalId,
    ) => ({
      ...fixture,
      servants: [
        {
          ...source,
          actorFormGraph: {
            ...source.actorFormGraph,
            forms: [
              ...source.actorFormGraph.forms,
              { ...sourceForm, id: duplicateFormId, baseNoblePhantasmVariant: duplicateRef },
            ],
          },
          noblePhantasmVariantGroups: source.noblePhantasmVariantGroups.map((group, index) =>
            index === 0
              ? {
                  ...group,
                  variants: [
                    ...group.variants,
                    { ...sourceVariant, ref: duplicateRef, card, canonicalId },
                  ],
                }
              : group,
          ),
        },
      ],
    });

    expect(
      masterSnapshotSchema.safeParse(snapshotWithDuplicateCard(sourceVariant.card)).success,
    ).toBe(true);
    expect(
      masterSnapshotSchema.safeParse(snapshotWithDuplicateCard('quick', '0'.repeat(64))).success,
    ).toBe(true);
    const parsed = masterSnapshotSchema.safeParse(snapshotWithDuplicateCard('quick'));

    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        'conflicting canonical noble phantasm variant semantics',
      );
  });
  it('canonicalizes form-qualified non-attack base variants by semantics', () => {
    const source = fixture.servants[0]!;
    const sourceForm = source.actorFormGraph.forms[0]!;
    const duplicateFormId = { actorId: 'fixture-saber-non-attack-duplicate', limitCount: 0 };
    const baseRef = { actorFormId: sourceForm.id, noblePhantasmId: 'shared-non-attack-np' };
    const duplicateRef = {
      actorFormId: duplicateFormId,
      noblePhantasmId: baseRef.noblePhantasmId,
    };
    const baseCanonicalId = '1'.repeat(64);
    const differentCanonicalId = '2'.repeat(64);
    const snapshotWithDuplicateBase = (
      priority: number,
      duplicateCanonicalId = baseCanonicalId,
    ) => ({
      ...fixture,
      servants: [
        {
          ...source,
          actorFormGraph: {
            ...source.actorFormGraph,
            forms: [
              ...source.actorFormGraph.forms.map((form) =>
                form === sourceForm ? { ...form, baseNoblePhantasmVariant: baseRef } : form,
              ),
              { ...sourceForm, id: duplicateFormId, baseNoblePhantasmVariant: duplicateRef },
            ],
          },
          noblePhantasmVariantGroups: [
            ...source.noblePhantasmVariantGroups,
            {
              id: 'shared-non-attack-group',
              baseVariant: baseRef,
              variants: [
                {
                  kind: 'nonAttack' as const,
                  canonicalId: baseCanonicalId,
                  ref: baseRef,
                  name: 'base presentation',
                  priority: 1,
                  effects: [],
                },
                {
                  kind: 'nonAttack' as const,
                  canonicalId: duplicateCanonicalId,
                  ref: duplicateRef,
                  name: 'duplicate presentation',
                  priority,
                  effects: [],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(masterSnapshotSchema.safeParse(snapshotWithDuplicateBase(1)).success).toBe(true);
    expect(
      masterSnapshotSchema.safeParse(snapshotWithDuplicateBase(2, differentCanonicalId)).success,
    ).toBe(true);
    const conflicting = masterSnapshotSchema.safeParse(snapshotWithDuplicateBase(2));
    expect(conflicting.success).toBe(false);
    if (!conflicting.success)
      expect(conflicting.error.issues.map(({ message }) => message)).toContain(
        'conflicting canonical noble phantasm variant semantics',
      );
    const splitEquivalent = masterSnapshotSchema.safeParse(
      snapshotWithDuplicateBase(1, differentCanonicalId),
    );
    expect(splitEquivalent.success).toBe(false);
    if (!splitEquivalent.success)
      expect(splitEquivalent.error.issues.map(({ message }) => message)).toContain(
        'equivalent noble phantasm semantics use different canonical IDs',
      );
  });
  it('rejects an unknown attack function in the normalized master', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasmVariantGroups: fixture.servants[0]!.noblePhantasmVariantGroups.map(
              (group) => ({
                ...group,
                variants: group.variants.map((variant) => ({
                  ...variant,
                  damage: variant.damage.map((damage) => ({
                    ...damage,
                    rawFunctionType: 'futureDamage',
                  })),
                })),
              }),
            ),
          },
        ],
      }),
    ).toMatchObject({ valid: false, unknownAttackFunctions: [] }));
  it('accepts a servant without an attacking NP', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        normalization: {
          attackFunctions: { sourceCount: 0, includedCount: 0, expansionCount: 0, excluded: [] },
        },
        servants: [
          {
            ...fixture.servants[0],
            actorFormGraph: {
              ...fixture.servants[0]!.actorFormGraph,
              forms: fixture.servants[0]!.actorFormGraph.forms.map((form) => ({
                ...form,
                baseNoblePhantasmVariant: null,
              })),
            },
            baseNoblePhantasmGroupId: null,
            noblePhantasmVariantGroups: [],
          },
        ],
      }),
    ).toMatchObject({ valid: true, unknownAttackFunctions: [] }));
  it('rejects maximum-limit-break-only availability outside craft essences', () => {
    const skill = {
      id: 'test-skill',
      slot: 1,
      priority: 0,
      name: 'test',
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [nonDamageEffect],
    };
    const invalidSnapshots = [
      {
        ...fixture,
        servants: [{ ...fixture.servants[0], skills: [skill] }],
      },
      {
        ...fixture,
        servants: [{ ...fixture.servants[0], passives: [skill] }],
      },
      {
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasmVariantGroups: fixture.servants[0]!.noblePhantasmVariantGroups.map(
              (group) => ({
                ...group,
                variants: group.variants.map((variant) => ({
                  ...variant,
                  effects: [{ ...nonDamageEffect, timing: 'beforeDamage' as const }],
                })),
              }),
            ),
          },
        ],
      },
      {
        ...fixture,
        mysticCodes: [
          { id: 'test-code', name: 'test', maxLevel: 10, imageKey: null, skills: [skill] },
        ],
      },
    ];
    for (const snapshot of invalidSnapshots) {
      const result = validateMasterSnapshot(snapshot);
      expect(result).toMatchObject({ valid: false });
      expect(result.errors.join('\n')).toContain('maximumLimitBreakOnly is only valid');
    }
  });
  it('rejects a CE valued operation without an explicit MLB value series', () => {
    const values = [[100], [], [], [], []] as const;
    const result = validateMasterSnapshot({
      ...fixture,
      craftEssences: [
        {
          id: 'test-ce',
          name: 'test',
          maxLevelByLimitBreak: [20, 20, 20, 20, 100],
          atkMin: 0,
          atkMax: 0,
          imageKey: null,
          effects: [
            {
              ...nonDamageEffect,
              availability: 'allLimitBreakStates',
              execution: [
                {
                  kind: 'damageModifier',
                  modifier: 'attackBuff',
                  sign: 1,
                  card: null,
                  route: {
                    target: 'sourceSelf',
                    contributionScope: 'personal',
                    eligibility: {
                      kind: 'requiredRecipient',
                      recipient: 'attacker',
                      onMissing: 'ignore',
                      onMismatch: 'unsupported',
                    },
                  },
                  values,
                  valueExpressions: [[], [], [], [], []],
                  semanticSupport: 'supported',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result).toMatchObject({ valid: false });
    expect(result.errors.join('\n')).toContain('require explicit limit-break values');
  });
  it('requires stochastic outcome semantics to match the proc and activation contracts', () => {
    const skill = {
      id: 'test-skill',
      slot: 1,
      priority: 0,
      name: 'test',
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [
        {
          ...nonDamageEffect,
          availability: 'allLimitBreakStates' as const,
          gameActivation: 'skillUse' as const,
          proc: {
            kind: 'chainedRolls' as const,
            ratePermille: Array.from({ length: 5 }, () => Array<number>(10).fill(800)),
            seriesKey: 'proc:test',
            index: 0,
            maximumSuccesses: 1,
          },
          selection: {
            kind: 'stochasticOutcome' as const,
            group: {
              kind: 'successCount' as const,
              key: 'proc:test',
              maximumSuccesses: 1,
              defaultOutcome: 'maximum' as const,
            },
          },
          interaction: { kind: 'procSeries' as const, key: 'proc:test' },
          inputDefinitions: [
            {
              key: 'proc:test',
              kind: 'procSuccessCount' as const,
              owner: 'attacker' as const,
              label: 'successes',
              description: 'test',
              minimum: 0,
              maximum: 1,
              step: 1,
              defaultValue: 1,
              defaultReason: 'invalid skill default',
            },
          ],
          requirement: {
            recipient: 'sourceSelf' as const,
            expression: {
              kind: 'inputQuantity' as const,
              inputKey: 'proc:test',
              comparison: 'atLeast' as const,
              value: 1,
            },
          },
        },
      ],
    };
    const result = validateMasterSnapshot({
      ...fixture,
      servants: [{ ...fixture.servants[0], skills: [skill] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('invalid chained stochastic outcome contract');
  });
  it('rejects an incomplete NP parameter matrix', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasmVariantGroups: fixture.servants[0]!.noblePhantasmVariantGroups.map(
              (group) => ({
                ...group,
                variants: group.variants.map((variant) => ({
                  ...variant,
                  damage: variant.damage.map((damage) => ({
                    ...damage,
                    parametersByOvercharge: [],
                  })),
                })),
              }),
            ),
          },
        ],
      }),
    ).toMatchObject({ valid: false }));
  it('derives CE attack and rejects levels over the limit', () => {
    expect(deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 1, 0)).toBe(0);
    expect(() => deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 21, 0)).toThrow(RangeError);
  });
  it('derives the natural level cap from servant rarity', () => {
    expect([0, 1, 2, 3, 4, 5].map(naturalServantLevel)).toEqual([65, 60, 65, 70, 80, 90]);
    expect(() => naturalServantLevel(6)).toThrow('unsupported servant rarity:6');
  });
});
