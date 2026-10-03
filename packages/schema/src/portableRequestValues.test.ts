import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  resolvedScenarioSchema,
} from './index';

const versionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: 'fixture',
  engineVersion: ENGINE_VERSION,
};
const scenario = resolvedScenarioSchema.parse({
  mode: 'resolved',
  attacker: {
    servantId: '1',
    initialActorFormId: { actorId: '1', limitCount: 0 },
    source: 'master',
    level: 90,
    npLevel: 1,
    fouAtk: 1000,
  },
  initialOvercharge: 1,
  targetContext: {
    class: { kind: 'concrete', classId: 'lancer' },
    attribute: { kind: 'concrete', attribute: 'earth' },
    families: [],
  },
  attackerHpPermille: null,
  battleState: { battlePointPhase: null },
  enemyDefenseBuff: 0,
  canonicalInputValues: {},
  craftEssence: null,
  preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
  mysticCode: null,
  support: null,
  effectDecisions: [],
  activationFacts: [],
  worldFactAssertions: [],
  explicitOverrides: {},
});
const calculatorRequest = portableCalculationRequestSchema.parse({
  versionContext,
  scenario,
  executionIntent: { kind: 'calculator', initialNpGauge: 10000 },
});
const rankingRequest = portableCalculationRequestSchema.parse({
  versionContext,
  scenario,
  executionIntent: {
    kind: 'ranking',
    initialNpGauge: 10000,
    policy: {
      growthBasis: 'common',
      population: 'all',
      levelBasis: 'uniformLevel90',
      npLevelBasis: { kind: 'specified', npLevel: 1 },
      initialOvercharge: 1,
      classAffinity: 'neutral',
      selfBuffs: 'included',
      conditionalEffects: 'baseline',
    },
    basis: {
      servantId: '1',
      level: 90,
      npLevel: 1,
      initialOvercharge: 1,
      growthBasis: 'common',
      levelSource: 'uniformLevel90',
      npSource: 'specified',
      fouAtk: 1000,
      skillLevels: {},
    },
  },
});
const manualRequest = portableCalculationRequestSchema.parse({
  versionContext,
  executionIntent: { kind: 'manual' },
  scenario: {
    mode: 'manual',
    manual: {
      attackerId: '1',
      attackerLevel: 90,
      attackerAtk: 10000,
      fouAtk: 1000,
      craftEssenceId: null,
      craftEssenceAtk: 0,
      npLevel: 1,
      overcharge: 1,
      npMultipliers: [300, 400, 450, 475, 500],
      damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
      cardType: 'buster',
      classAttackRate: 1,
      classAffinity: 1,
      attributeAffinity: 1,
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
      powerMod: 0,
      npSpecialMultipliers: [1, 1, 1, 1, 1],
      specialResistance: 0,
      flatDamage: 0,
      attackerStateTraits: [],
      attackerHpPermille: null,
      targetRarity: null,
      targetStateTraits: [],
      battlePointPhase: null,
      target: { classId: null, attribute: 'unknown', traits: [] },
    },
  },
});

describe('current portable request values', () => {
  it.each([calculatorRequest, rankingRequest, manualRequest])(
    'preserves JSON roundtrip values for $executionIntent.kind',
    (request) => {
      expect(portableCalculationRequestSchema.parse(JSON.parse(JSON.stringify(request)))).toEqual(
        request,
      );
    },
  );

  it.each(['attackerAtk', 'fouAtk', 'craftEssenceAtk', 'classAttackRate'])(
    'distinguishes omitted, undefined and zero %s',
    (key) => {
      expect(resolvedScenarioSchema.parse(scenario).explicitOverrides).toEqual({});
      expect(
        resolvedScenarioSchema.safeParse({ ...scenario, explicitOverrides: { [key]: undefined } })
          .success,
      ).toBe(false);
      expect(
        resolvedScenarioSchema.parse({ ...scenario, explicitOverrides: { [key]: 0 } })
          .explicitOverrides,
      ).toEqual({ [key]: 0 });
      for (const request of [calculatorRequest, rankingRequest])
        expect(
          portableCalculationRequestSchema.safeParse({
            ...request,
            scenario: { ...scenario, explicitOverrides: { [key]: undefined } },
          }).success,
        ).toBe(false);
    },
  );

  it('distinguishes omitted origin from undefined without inventing provenance', () => {
    const absent = { ...scenario, canonicalInputValues: { count: { kind: 'integer', value: 0 } } };
    expect(resolvedScenarioSchema.parse(absent).canonicalInputValues['count']).toEqual({
      kind: 'integer',
      value: 0,
    });
    expect(
      resolvedScenarioSchema.safeParse({
        ...scenario,
        canonicalInputValues: { count: { kind: 'integer', value: 0, origin: undefined } },
      }).success,
    ).toBe(false);
  });

  it('permits absent or empty initial battle points and rejects explicit undefined', () => {
    expect(resolvedScenarioSchema.parse(scenario)).not.toHaveProperty('initialBattlePointPoints');
    expect(
      resolvedScenarioSchema.parse({ ...scenario, initialBattlePointPoints: {} })
        .initialBattlePointPoints,
    ).toEqual({});
    expect(
      resolvedScenarioSchema.safeParse({ ...scenario, initialBattlePointPoints: undefined })
        .success,
    ).toBe(false);
  });

  it('permits absent stack counts and rejects explicit undefined in manual requests', () => {
    if (manualRequest.scenario.mode !== 'manual') throw new Error('manual required');
    expect(manualRequest.scenario.manual).not.toHaveProperty('stackStateCounts');
    expect(
      portableCalculationRequestSchema.safeParse({
        ...manualRequest,
        scenario: {
          mode: 'manual',
          manual: { ...manualRequest.scenario.manual, stackStateCounts: undefined },
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    'defenseBuff',
    'cardResistance',
    'npResistance',
    'eventDamageBuff',
    'specialDamageBuff',
    'damageCut',
    'ignoreDamageCut',
    'fieldTraits',
  ])('rejects explicit undefined before the declared default for %s', (key) => {
    if (manualRequest.scenario.mode !== 'manual') throw new Error('manual required');
    expect(
      portableCalculationRequestSchema.safeParse({
        ...manualRequest,
        scenario: {
          mode: 'manual',
          manual: { ...manualRequest.scenario.manual, [key]: undefined },
        },
      }),
    ).toMatchObject({ success: false });
  });

  it('retains zero, false and null values while preserving the declared omission defaults', () => {
    if (manualRequest.scenario.mode !== 'manual') throw new Error('manual required');
    expect(manualRequest.scenario.manual).toMatchObject({
      defenseBuff: 0,
      damageCut: 0,
      ignoreDamageCut: false,
      fieldTraits: [],
      craftEssenceId: null,
    });
  });
});
