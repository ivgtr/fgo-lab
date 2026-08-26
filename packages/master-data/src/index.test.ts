import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import manifest from '../../test-fixtures/master/manifest.json';
import {
  deriveCraftEssenceAtk,
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
  interaction: null,
  choice: null,
  triggerScope: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  traitReadPolicy: {
    stateSources: 'activeOnly' as const,
    ignoredStateTraits: 'exclude' as const,
    unremovableStateTraits: 'include' as const,
  },
  quantityConditions: [],
  sourceQuantityConditions: [],
  inputDefinitions: [],
  inputQuantityConditions: [],
  conditions: {
    recipient: [],
    holder: { operator: 'all' as const, traits: [] },
    opponent: { operator: 'all' as const, traits: [] },
    field: { operator: 'all' as const, traits: [] },
  },
  conditionTargetPolicy: 'sourceSelf' as const,
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
  it('rejects an unknown attack function in the normalized master', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [
              {
                ...fixture.servants[0]!.noblePhantasms[0]!,
                damage: [
                  {
                    ...fixture.servants[0]!.noblePhantasms[0]!.damage[0]!,
                    rawFunctionType: 'futureDamage',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({ valid: false, unknownAttackFunctions: [] }));
  it('accepts a servant without an attacking NP', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        normalization: { attackFunctions: { sourceCount: 0, includedCount: 0, excluded: [] } },
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [],
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
            noblePhantasms: fixture.servants[0]!.noblePhantasms.map((np) => ({
              ...np,
              effects: [{ ...nonDamageEffect, timing: 'beforeDamage' as const }],
            })),
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
                  targetPolicy: 'sourceSelf',
                  expectedRecipient: 'attacker',
                  targetMismatch: 'unsupported',
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
  it('rejects an incomplete NP parameter matrix', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [
              {
                ...fixture.servants[0]!.noblePhantasms[0]!,
                damage: [
                  {
                    ...fixture.servants[0]!.noblePhantasms[0]!.damage[0]!,
                    parametersByOvercharge: [],
                  },
                ],
              },
            ],
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
