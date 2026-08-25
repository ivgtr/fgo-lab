import { describe, expect, it } from 'vitest';
import { assumptionsForProjection } from '@fgo-lab/battle-execution';
import fixture from '../../test-fixtures/master/fixture.json';
import effectSourcesGolden from '../../test-fixtures/golden/ordered-effect-execution-v1.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculationScenarioSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const master = masterSnapshotSchema.parse(fixture);
const versions: VersionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};
const unconditionalConditions = {
  recipient: [{ operator: 'any' as const, traits: [] }],
  holder: { operator: 'any' as const, traits: [] },
  opponent: { operator: 'any' as const, traits: [] },
  field: { operator: 'any' as const, traits: [] },
};

function modifierEffect(
  id: string,
  buffType: string,
  value: number,
  cardTypes: ('buster' | 'arts' | 'quick')[] = [],
  target = 'self',
  conditions = unconditionalConditions,
) {
  return {
    id,
    type: 'addStateShort',
    target,
    label: id,
    parameterSets: [Array.from({ length: 10 }, () => ({ Value: value })), [], [], [], []],
    buffTypes: [buffType],
    conditions,
    contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
    cardTypes,
  };
}

function traitConditions(opponent: string, field: string) {
  return {
    ...unconditionalConditions,
    opponent: {
      operator: 'all' as const,
      traits: [{ name: opponent, negative: false }],
    },
    field: {
      operator: 'all' as const,
      traits: [{ name: field, negative: false }],
    },
  };
}

describe('scenario calculation facade', () => {
  it('calculates a resolved scenario without a UI selection adapter', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const calculation = calculateScenario(scenario, master, versions);

    expect(calculation.scenario).toEqual(scenario);
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.result.rows).toHaveLength(5);
  });

  it('uses the natural level cap for an unsaved servant build', () => {
    const fourStarServant = {
      ...master.servants[0]!,
      rarity: 4,
      atkByLevel: { ...master.servants[0]!.atkByLevel, '80': 9_000 },
    };
    const scenario = createDefaultResolvedScenario(master, undefined, fourStarServant);

    expect(scenario.attacker).toMatchObject({ level: 80, source: 'master' });
  });

  it('applies a conditional NP from the same explicit effect decision contract', () => {
    const baseServant = fixture.servants[0]!;
    const conditionalMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasms: baseServant.noblePhantasms.map((np) => ({
            ...np,
            damage: np.damage.map((damage) => ({
              ...damage,
              kind: 'trait',
              rawFunctionType: 'damageNpIndividual',
              parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                row.map((parameter) => ({
                  ...parameter,
                  targetId: 1,
                  targetTrait: { id: 1, name: 'dragon' },
                  correctionPermille: 1_500,
                })),
              ),
            })),
          })),
        },
      ],
    });
    const scenario = createDefaultResolvedScenario(conditionalMaster, undefined);
    const inactive = calculateScenario(scenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    const condition = inactive.effects.find((effect) => effect.modifier === 'npSpecial');

    expect(condition).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'conditionNotMet' },
      value: 1.5,
    });
    expect(inactive.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);

    const active = calculateScenario(
      {
        ...scenario,
        effectAssumptions: assumptionsForProjection(condition!, true),
      },
      conditionalMaster,
      { ...versions, masterDataVersion: conditionalMaster.version },
    );

    expect(active.input.npSpecialMultipliers).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(
      active.effects.find((effect) => effect.projectionKey === condition!.projectionKey),
    ).toMatchObject({
      outcome: 'applied',
      explanation: { code: 'applied' },
    });
    expect(active.result.status).toBe('calculated');
  });

  it('applies one exclusive conditional modifier and fails closed when both are selected', () => {
    const baseServant = fixture.servants[0]!;
    const exclusiveMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'realm-skill',
              slot: 1,
              priority: 1,
              name: 'realm skill',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect(
                  'sky-power',
                  'upDamage',
                  500,
                  [],
                  'self',
                  traitConditions('attributeSky', 'fieldHeaven'),
                ),
                modifierEffect(
                  'earth-power',
                  'upDamage',
                  500,
                  [],
                  'self',
                  traitConditions('attributeEarth', 'fieldHell'),
                ),
              ],
            },
          ],
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(exclusiveMaster, undefined),
      attackerSkills: [{ skillId: 'realm-skill', skillLevel: 10 }],
    };
    const inactive = calculateScenario(scenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    const sky = inactive.effects.find((effect) => effect.label === 'sky-power')!;
    const earth = inactive.effects.find((effect) => effect.label === 'earth-power')!;
    const skyAssumptions = assumptionsForProjection(sky, true);
    const earthAssumptions = assumptionsForProjection(earth, true);

    const skyOnly = calculateScenario(
      { ...scenario, effectAssumptions: skyAssumptions },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(skyOnly.result.status).toBe('calculated');
    expect(skyOnly.input).toMatchObject({
      powerMod: 0.5,
      fieldTraits: ['fieldHeaven'],
      target: { traits: ['attributeSky'] },
    });
    expect(skyOnly.effects.find((effect) => effect.label === 'sky-power')?.outcome).toBe('applied');
    expect(skyOnly.effects.find((effect) => effect.label === 'earth-power')?.outcome).toBe(
      'notApplied',
    );

    const conflict = calculateScenario(
      { ...scenario, effectAssumptions: [...skyAssumptions, ...earthAssumptions] },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exclusiveAssumptionConflict:target:worldAttribute'),
        expect.stringContaining('exclusiveAssumptionConflict:field:fieldRealm'),
      ]),
    );
    expect(
      conflict.effects
        .filter((effect) => ['sky-power', 'earth-power'].includes(effect.label))
        .map((effect) => effect.outcome),
    ).toEqual(['notApplied', 'notApplied']);
  });

  it('uses the same condition assertion path for a support effect', () => {
    const attacker = fixture.servants[0]!;
    const support = {
      ...attacker,
      id: 'conditional-support',
      name: 'conditional support',
      passives: [],
      noblePhantasms: [],
      skills: [
        {
          id: 'support-condition-skill',
          slot: 1,
          priority: 1,
          name: 'support condition',
          detail: '',
          imageKey: null,
          effects: [
            modifierEffect(
              'support-sky-power',
              'upDamage',
              300,
              [],
              'ptOne',
              traitConditions('attributeSky', 'fieldHeaven'),
            ),
          ],
        },
      ],
    };
    const supportMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [attacker, support],
    });
    const scenario = {
      ...createDefaultResolvedScenario(supportMaster, undefined),
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support-source',
              servantId: support.id,
              skills: [{ skillId: 'support-condition-skill', skillLevel: 10 }],
            },
          ],
          selectedEffects: [],
        },
      },
    };
    const inactive = calculateScenario(scenario, supportMaster, {
      ...versions,
      masterDataVersion: supportMaster.version,
    });
    const projection = inactive.effects.find((effect) => effect.label === 'support-sky-power')!;
    const active = calculateScenario(
      { ...scenario, effectAssumptions: assumptionsForProjection(projection, true) },
      supportMaster,
      { ...versions, masterDataVersion: supportMaster.version },
    );

    expect(projection).toMatchObject({
      controllability: 'user',
      decision: { mode: 'enableAndAssert' },
    });
    expect(active.result.status).toBe('calculated');
    expect(active.input).toMatchObject({
      powerMod: 0.3,
      fieldTraits: ['fieldHeaven'],
      target: { traits: ['attributeSky'] },
    });
    expect(active.effects.find((effect) => effect.label === 'support-sky-power')).toMatchObject({
      outcome: 'applied',
      decision: { state: 'enabled' },
    });
  });

  it('preserves repeated state-trait stacks through ordered NP execution', () => {
    const baseServant = fixture.servants[0]!;
    const burn = { id: 99, name: 'buffBurn' };
    const stackEffect = (id: string) => ({
      ...modifierEffect(id, 'addIndividuality', 0, [], 'enemyAll'),
      contextChanges: { addedFieldTraits: [], addedRecipientTraits: [burn.name] },
      timing: 'beforeDamage' as const,
    });
    const stackedMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasms: baseServant.noblePhantasms.map((np) => ({
            ...np,
            effects: [stackEffect('burn-one'), stackEffect('burn-two')],
            damage: np.damage.map((damage) => ({
              ...damage,
              kind: 'traitCount',
              rawFunctionType: 'damageNpIndividualSum',
              parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                row.map((parameter) => ({
                  ...parameter,
                  targetId: 1,
                  targetIds: [burn.id],
                  targetTraits: [burn],
                  secondaryValuePermille: 1_000,
                  correctionPermille: 200,
                  maximumTargetCount: 3,
                })),
              ),
            })),
          })),
        },
      ],
    });

    const calculation = calculateScenario(
      createDefaultResolvedScenario(stackedMaster, undefined),
      stackedMaster,
      { ...versions, masterDataVersion: stackedMaster.version },
    );

    expect(calculation.input.targetStateTraits).toEqual(['buffBurn', 'buffBurn']);
    expect(calculation.input.npSpecialMultipliers).toEqual([1.4, 1.4, 1.4, 1.4, 1.4]);
  });

  it('returns identical NP rows for equivalent resolved and manual inputs', () => {
    const resolvedScenario = createDefaultResolvedScenario(master, undefined);
    const resolved = calculateScenario(resolvedScenario, master, versions);
    const manualScenario: CalculationScenario = {
      mode: 'manual',
      manual: resolved.input,
    };
    const manual = calculateScenario(manualScenario, master, versions);

    expect(manual.result.rows).toEqual(resolved.result.rows);
    expect(() =>
      calculationScenarioSchema.parse({
        ...manualScenario,
        attacker: resolvedScenario.attacker,
      }),
    ).toThrow();
  });

  it('fails closed when a resolved scenario references a missing craft essence', () => {
    const scenario = {
      ...createDefaultResolvedScenario(master, undefined),
      craftEssence: { craftEssenceId: 'missing', level: 1, limitBreak: 0 },
    };
    const calculation = calculateScenario(scenario, master, versions);

    expect(calculation.result.status).toBe('unsupported');
    expect(calculation.effectWarnings).toContain(
      'unsupportedOperation:craftEssence:missing:source_missing',
    );
  });

  it('marks user-supplied manual final modifiers as provisional evidence', () => {
    const resolved = calculateScenario(
      createDefaultResolvedScenario(master, undefined),
      master,
      versions,
    );
    const manual = calculateScenario({ mode: 'manual', manual: resolved.input }, master, versions);

    expect(manual.result).toMatchObject({ status: 'calculated', precision: 'approximate' });
    expect(manual.result.evidence.map((entry) => entry.key)).toContain(
      'input:manual-final-modifiers',
    );
  });

  it('matches the all-source single-aggregation golden through the scenario facade', () => {
    const baseServant = fixture.servants[0]!;
    const attacker = {
      ...baseServant,
      passives: [
        {
          id: 'passive-skill',
          slot: 0,
          priority: 0,
          name: 'passive',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('passive-card', 'upCommandall', 100, ['buster'])],
        },
      ],
      skills: [
        {
          id: 'attacker-skill',
          slot: 1,
          priority: 1,
          name: 'attacker',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('attacker-attack', 'upAtk', 200)],
        },
      ],
      noblePhantasms: baseServant.noblePhantasms.map((np) => ({
        ...np,
        effects: [
          { ...modifierEffect('np-attack', 'upAtk', 600), timing: 'beforeDamage' as const },
          {
            ...modifierEffect('np-ignore-defense', 'pierceDefence', 0),
            timing: 'beforeDamage' as const,
          },
          {
            ...modifierEffect('np-ignore-damage-cut', 'pierceSubdamage', 0),
            timing: 'beforeDamage' as const,
          },
        ],
      })),
    };
    const support = {
      ...baseServant,
      id: 'combo-support',
      name: 'support',
      passives: [],
      noblePhantasms: [],
      skills: [
        {
          id: 'support-skill',
          slot: 1,
          priority: 1,
          name: 'support',
          detail: '',
          imageKey: null,
          effects: [modifierEffect('support-power', 'upDamage', 500, [], 'ptOne')],
        },
      ],
    };
    const combinationMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [attacker, support],
      craftEssences: [
        {
          ...fixture.craftEssences[0]!,
          effects: [modifierEffect('ce-np', 'upNpdamage', 300)],
        },
      ],
      mysticCodes: [
        {
          id: 'combo-mc',
          name: 'mystic',
          maxLevel: 10,
          imageKey: null,
          skills: [
            {
              id: 'mc-skill',
              slot: 1,
              priority: 1,
              name: 'mystic',
              detail: '',
              imageKey: null,
              effects: [modifierEffect('mc-card', 'upCommandall', 400, ['buster'], 'ptOne')],
            },
          ],
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(combinationMaster, undefined),
      assumptions: { classAffinity: 1, attributeAffinity: 1 },
      craftEssence: { craftEssenceId: 'fixture-ce', level: 1, limitBreak: 0 },
      attackerSkills: [{ skillId: 'attacker-skill', skillLevel: 10 }],
      mysticCode: {
        mysticCodeId: 'combo-mc',
        skills: [{ skillId: 'mc-skill', skillLevel: 10 }],
      },
      effectAssumptions: [
        {
          decisionKey: 'attacker:attacker:fixture-saber:attacker-skill:attacker-attack',
          enabled: true,
          assertion: null,
        },
        {
          decisionKey: 'mysticCode:mysticCode:combo-mc:mc-skill:mc-card',
          enabled: true,
          assertion: null,
        },
      ],
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support-1',
              servantId: 'combo-support',
              skills: [{ skillId: 'support-skill', skillLevel: 10 }],
            },
          ],
          selectedEffects: [
            {
              sourceInstanceId: 'support-1',
              skillId: 'support-skill',
              effectId: 'support-power',
            },
          ],
        },
      },
    };
    const calculation = calculateScenario(scenario, combinationMaster, {
      ...versions,
      masterDataVersion: combinationMaster.version,
    });

    expect(calculation.scenarioInput).toMatchObject({
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
      powerMod: 0,
      flatDamage: 0,
    });
    expect(calculation.input).toMatchObject({
      ...effectSourcesGolden.expectedModifiers,
      damageFunction: { ignoreDefense: effectSourcesGolden.expectedIgnoreDefense },
      ignoreDamageCut: effectSourcesGolden.expectedIgnoreDamageCut,
    });
    expect(calculation.effects.map((effect) => effect.source.origin)).toEqual([
      'passive',
      'attacker',
      'craftEssence',
      'support',
      'mysticCode',
      'np',
      'np',
      'np',
      'np',
    ]);
    expect(calculation.result).toMatchObject({
      status: 'calculated',
      precision: 'approximate',
      rows: effectSourcesGolden.expectedRows,
    });
  });
});
