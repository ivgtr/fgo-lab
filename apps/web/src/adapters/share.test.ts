/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createShareFragment,
  importBackup,
  MAX_SHARE_FRAGMENT_LENGTH,
  readShareFragment,
  RESULT_CARD_EXPORT_WIDTH,
} from './share';
import { validateCalculationShareSnapshot } from './shareValidation';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  applyCanonicalInputCommand,
  applyEffectConditionDecision,
  applyEffectProjectionDecision,
  calculateScenario as calculateScenarioOutcome,
  createCalculatorPortableRequest,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type CalculationShareSnapshot,
} from '@fgo-lab/schema';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

const master = masterSnapshotSchema.parse(fixture);
type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
let productionMaster: ReturnType<typeof masterSnapshotSchema.parse>;

beforeAll(async () => {
  productionMaster = masterSnapshotSchema.parse(
    JSON.parse(
      await readFile(resolve(import.meta.dirname, '../../public/master/master.json'), 'utf8'),
    ),
  );
});
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
const requestFor = (
  scenario: CalculationScenario,
  context: Pick<typeof versions, 'masterDataVersion' | 'engineVersion'> = versions,
) =>
  createCalculatorPortableRequest(scenario, {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: context.masterDataVersion,
    engineVersion: context.engineVersion,
  });
const readCurrentShare = (fragment: string): CalculationShareSnapshot => {
  const value = readShareFragment(fragment);
  if (!value || 'disposition' in value) throw new Error('current share required');
  return value;
};

describe('portable input limits', () => {
  it('rejects oversized backups before schema use', () =>
    expect(() => importBackup('x'.repeat(101), 100)).toThrow('backup_too_large'));
  it('rejects a servant identity mismatch at the backup import boundary', () => {
    const profileId = '00000000-0000-4000-8000-000000000047';
    const timestamp = '2026-09-05T00:00:00.000Z';
    expect(() =>
      importBackup(
        JSON.stringify({
          kind: 'fgo-lab-user-backup',
          schemaVersion: SCHEMA_VERSION,
          exportedAt: timestamp,
          appVersion: APP_VERSION,
          profiles: {
            schemaVersion: SCHEMA_VERSION,
            activeProfileId: profileId,
            profiles: [
              {
                profileId,
                name: 'identity mismatch',
                createdAt: timestamp,
                updatedAt: timestamp,
                servantBuilds: {
                  'servant-a': {
                    servantId: 'servant-b',
                    level: 1,
                    ascension: 0,
                    npLevel: 0,
                    fouAtk: 0,
                    skills: {},
                    appends: {},
                    updatedAt: timestamp,
                  },
                },
                servantTargets: {},
                craftEssences: [],
                supportTemplates: [],
                draft: null,
                history: [],
              },
            ],
          },
        }),
      ),
    ).toThrow(/servant_record_identity_mismatch/);
  });
  it('keeps a bounded URL limit large enough for traced proc scenarios', () =>
    expect(MAX_SHARE_FRAGMENT_LENGTH).toBe(16_384));
  it('keeps result image layout width independent from the viewport', () =>
    expect(RESULT_CARD_EXPORT_WIDTH).toBe(560));
  it('rejects oversized shared fragments before decoding', () =>
    expect(() => readShareFragment(`#share=${'x'.repeat(MAX_SHARE_FRAGMENT_LENGTH)}`)).toThrow(
      'share_too_large',
    ));

  it('round-trips only a reproducible current-master calculation', () => {
    const scenario = { ...createDefaultResolvedScenario(master, undefined), enemyDefenseBuff: 0.3 };
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      request: requestFor(scenario),
      result: calculateScenario(scenario, master, versions).result,
    } as unknown as CalculationShareSnapshot;
    const restored = readCurrentShare(`#${createShareFragment(snapshot)}`);

    expect(validateCalculationShareSnapshot(restored, master)).toEqual(snapshot);
  });

  it('re-derives canonical count minima when a shared scenario omits explicit counts', () => {
    const servant = productionMaster.servants.find((candidate) => candidate.id === '1102000')!;
    const scenario = createDefaultResolvedScenario(productionMaster, undefined, servant);
    const productionVersions = {
      ...versions,
      masterDataVersion: productionMaster.version,
    };
    const calculation = calculateScenario(scenario, productionMaster, productionVersions);
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-26T00:00:00.000Z',
      request: requestFor(scenario, productionVersions),
      result: calculation.result,
    } as unknown as CalculationShareSnapshot;

    expect(scenario.canonicalInputValues).toEqual({});
    const restored = readCurrentShare(`#${createShareFragment(snapshot)}`);
    expect(validateCalculationShareSnapshot(restored, productionMaster)).toEqual(snapshot);
    const recalculated = calculateScenario(
      restored.request.scenario,
      productionMaster,
      productionVersions,
    );
    expect(recalculated.input.npDamageBuff).toBe(0.2);
    expect(
      recalculated.inputDefinitions
        .filter((input) => input.kind === 'matchingActorCount')
        .map((input) => input.defaultValue),
    ).toEqual([1, 1]);
  });

  it('round-trips zero and partial chained proc results without changing damage', () => {
    const servant = productionMaster.servants.find((candidate) => candidate.id === '101300')!;
    const base = createDefaultResolvedScenario(productionMaster, undefined, servant);
    const initial = calculateScenario(base, productionMaster, {
      ...versions,
      masterDataVersion: productionMaster.version,
    });
    const input = initial.effectInputs.find((candidate) => candidate.kind === 'procSuccessCount')!;
    for (const value of [0, 2]) {
      const scenario = applyCanonicalInputCommand(base, {
        kind: 'setCanonicalIntegerInput',
        key: input.key,
        value,
      });
      const calculation = calculateScenario(scenario, productionMaster, {
        ...versions,
        masterDataVersion: productionMaster.version,
      });
      const snapshot: CalculationShareSnapshot = {
        kind: 'fgo-lab-calculation-share',
        schemaVersion: SCHEMA_VERSION,
        sharedAt: '2026-08-27T00:00:00.000Z',
        request: requestFor(scenario, { ...versions, masterDataVersion: productionMaster.version }),
        result: calculation.result,
      };

      const restored = readCurrentShare(`#${createShareFragment(snapshot)}`);
      expect(validateCalculationShareSnapshot(restored, productionMaster)).toEqual(snapshot);
      expect(restored.request.scenario.mode).toBe('resolved');
      if (restored.request.scenario.mode !== 'resolved') throw new Error('resolved share required');
      expect(restored.request.scenario.canonicalInputValues[input.key]).toEqual({
        kind: 'integer',
        value,
      });
      const recalculated = calculateScenario(restored.request.scenario, productionMaster, {
        ...versions,
        masterDataVersion: productionMaster.version,
      });
      expect(recalculated.input).toEqual(calculation.input);
      expect(recalculated.result).toEqual(calculation.result);
    }
  });

  it('rejects a shared result that does not match its scenario', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const result = calculateScenario(scenario, master, versions).result;
    if (result.status !== 'calculated') throw new Error('expected calculated fixture');
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      request: requestFor(scenario),
      result: {
        ...result,
        rows: [
          { ...result.rows[0], minimum: result.rows[0].minimum + 1 },
          ...result.rows.slice(1),
        ] as typeof result.rows,
      },
    } as const;

    expect(() => validateCalculationShareSnapshot(snapshot, master)).toThrow(
      'share_storedResultMismatch',
    );
  });

  it('rejects a share created from a different master version', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const result = calculateScenario(scenario, master, versions).result;
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      request: requestFor(scenario),
      result: {
        ...result,
        versions: { ...result.versions, masterDataVersion: 'different-master' },
      },
    } as const;

    expect(() => validateCalculationShareSnapshot(snapshot, master)).toThrow(
      'share_requestResultVersionMismatch',
    );
  });

  it('rejects an out-of-domain quantity fact while decoding a crafted share', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-26T00:00:00.000Z',
      request: {
        ...requestFor(scenario),
        scenario: {
          ...scenario,
          worldFactAssertions: [
            {
              decisionKey: 'crafted:hp',
              fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: -100 },
            },
          ],
        },
      },
      result: calculateScenario(scenario, master, versions).result,
    } as unknown as CalculationShareSnapshot;

    expect(() => readShareFragment(`#${createShareFragment(snapshot)}`)).toThrow();
  });

  it('fails closed on crafted cross-domain fact and effect decisions', () => {
    const base = master.servants[0]!;
    const craftedMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...base,
          actorFormGraph: {
            ...base.actorFormGraph,
            forms: base.actorFormGraph.forms.map((form) =>
              form.id.actorId === base.actorFormGraph.defaultInitialFormId.actorId &&
              form.id.limitCount === base.actorFormGraph.defaultInitialFormId.limitCount
                ? { ...form, skillIds: ['earth-skill'] }
                : form,
            ),
          },
          skills: [
            {
              id: 'earth-skill',
              slot: 1,
              priority: 1,
              name: 'earth skill',
              detail: '',
              imageKey: null,
              resourceRequirement: null,
              effects: [
                {
                  id: 'earth-power',
                  occurrenceId: 'earth-power:0',
                  availability: 'allLimitBreakStates',
                  inclusionPolicy: { default: 'include' },
                  gameActivation: 'skillUse',
                  proc: { kind: 'guaranteed' },
                  selection: null,
                  interaction: null,
                  label: '対地威力アップ',
                  triggerScope: null,
                  operationTrigger: null,
                  operationReference: null,
                  stateIdentity: null,
                  inputDefinitions: [
                    {
                      key: 'field:enemyCount',
                      kind: 'fieldActorCount',
                      owner: 'field',
                      label: '敵の数',
                      description: '宝具対象を含む生存中の敵数',
                      minimum: 1,
                      maximum: 3,
                      step: 1,
                      defaultValue: 1,
                      defaultReason: '単体対象1体',
                    },
                  ],
                  requirement: {
                    recipient: 'sourceSelf',
                    expression: {
                      kind: 'all',
                      requirements: [
                        {
                          kind: 'trait',
                          scope: 'opponent',
                          trait: 'attributeEarth',
                          present: true,
                          provenance: {
                            stateSources: 'activeOnly',
                            ignoredStateTraits: 'exclude',
                            unremovableStateTraits: 'include',
                          },
                        },
                        {
                          kind: 'trait',
                          scope: 'field',
                          trait: 'fieldHell',
                          present: true,
                          provenance: {
                            stateSources: 'activeOnly',
                            ignoredStateTraits: 'exclude',
                            unremovableStateTraits: 'include',
                          },
                        },
                      ],
                    },
                  },
                  execution: [
                    {
                      kind: 'damageModifier',
                      modifier: 'powerMod',
                      sign: 1,
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
                      card: null,
                      values: [Array.from({ length: 10 }, () => 500), [], [], [], []],
                      valueExpressions: [[], [], [], [], []],
                      semanticSupport: 'supported',
                    },
                  ],
                  atlasEvidence: {
                    functionType: 'addStateShort',
                    target: 'self',
                    parameterSets: [
                      Array.from({ length: 10 }, () => ({ Value: 500 })),
                      [],
                      [],
                      [],
                      [],
                    ],
                    parameterSemantics: {
                      value: ['Value'],
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
                    buffTypes: ['upDamage'],
                    buffRateTargets: [],
                    buffConditionKeys: [],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const craftedVersions = { ...versions, masterDataVersion: craftedMaster.version };
    const baseScenario: ResolvedScenario = {
      ...createDefaultResolvedScenario(craftedMaster, undefined),
      preNoblePhantasmPlan: [
        { kind: 'useSkillSlot', slot: 1 as const, skillLevel: 10, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
    };
    const initial = calculateScenario(baseScenario, craftedMaster, craftedVersions);
    const earth = initial.effects.find((effect) => effect.label === '対地威力アップ')!;
    const selected = applyEffectConditionDecision(
      applyEffectProjectionDecision(baseScenario, earth, true),
      earth,
      true,
      initial.activationRequirements,
    );
    const compatibleResult = calculateScenario(selected, craftedMaster, craftedVersions).result;
    const conflictingScenario = {
      ...selected,
      worldFactAssertions: [
        {
          decisionKey: 'crafted:sky',
          fact: {
            kind: 'trait' as const,
            scope: 'target' as const,
            trait: 'attributeSky',
            present: true,
          },
        },
        {
          decisionKey: 'crafted:heaven',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldHeaven',
            present: true,
          },
        },
      ],
    };
    const recalculated = calculateScenario(conflictingScenario, craftedMaster, craftedVersions);
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      request: requestFor(conflictingScenario, craftedVersions),
      result: compatibleResult,
    } as const;

    expect(recalculated.result.status).toBe('unsupported');
    expect(recalculated.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(recalculated.input.powerMod).toBe(0);
    expect(() => validateCalculationShareSnapshot(snapshot, craftedMaster)).toThrow(
      'share_storedResultMismatch',
    );

    const invalidContextScenario = {
      ...selected,
      canonicalInputValues: {
        'field:enemyCount': { kind: 'integer' as const, value: 0 },
      },
    };
    const invalidContext = calculateScenario(
      invalidContextScenario,
      craftedMaster,
      craftedVersions,
    );
    const invalidSnapshot = {
      ...snapshot,
      request: requestFor(invalidContextScenario, craftedVersions),
      result: compatibleResult,
    };
    const decoded = readCurrentShare(`#${createShareFragment(invalidSnapshot)}`);
    if (decoded.request.scenario.mode !== 'resolved') throw new Error('resolved share required');
    expect(decoded.request.scenario.canonicalInputValues).toEqual({
      'field:enemyCount': { kind: 'integer', value: 0 },
    });
    expect(invalidContext.result).toMatchObject({ status: 'inputRequired', rows: [] });
    expect(() => validateCalculationShareSnapshot(decoded, craftedMaster)).toThrow(
      'share_storedResultMismatch',
    );
  });
});
