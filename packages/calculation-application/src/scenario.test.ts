import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import effectSourcesGolden from '../../test-fixtures/golden/ordered-effect-execution-v1.json';
import { executeOrderedScenario, prepareOrderedScenario } from '@fgo-lab/battle-execution';
import { masterSnapshotSchema, type MasterEffect } from '@fgo-lab/master-data';
import {
  calculationScenarioSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  applyEffectConditionDecision,
  applyEffectPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
import { resolveCanonicalInputValues } from './canonicalInputs';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const master = masterSnapshotSchema.parse(fixture);

type MutableEffectContainer = { effects?: Record<string, unknown>[] };
type MutableServant = {
  skills?: MutableEffectContainer[];
  passives?: MutableEffectContainer[];
  noblePhantasms?: MutableEffectContainer[];
};

function parseTestMaster(input: unknown) {
  const candidate = structuredClone(input) as {
    servants: MutableServant[];
    craftEssences: MutableEffectContainer[];
    mysticCodes: { skills: MutableEffectContainer[] }[];
  };
  const decorate = (
    containers: readonly MutableEffectContainer[],
    gameActivation: 'constant' | 'skillUse' | 'npBeforeDamage',
    defaultInclusion: 'include' | 'exclude',
  ) => {
    for (const container of containers)
      for (const effect of container.effects ?? []) {
        effect['inclusionPolicy'] ??= { default: defaultInclusion };
        effect['gameActivation'] ??= gameActivation;
        effect['proc'] ??= { kind: 'guaranteed' };
        effect['procSelection'] ??= { kind: 'effectInclusion' };
      }
  };
  for (const servant of candidate.servants) {
    decorate(servant.skills ?? [], 'skillUse', 'include');
    decorate(servant.passives ?? [], 'constant', 'include');
    decorate(servant.noblePhantasms ?? [], 'npBeforeDamage', 'include');
  }
  decorate(candidate.craftEssences, 'constant', 'include');
  for (const code of candidate.mysticCodes) decorate(code.skills, 'skillUse', 'include');
  return masterSnapshotSchema.parse(candidate);
}
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
const emptyParameterSemantics = {
  value: [],
  lifecycle: [],
  presentation: [],
  condition: [],
  contextMutation: [],
  choice: [],
  valueExpression: [],
  buffIdentity: [],
  unresolved: [],
};

function modifierEffect(
  id: string,
  buffType: string,
  value: number,
  cardTypes: ('buster' | 'arts' | 'quick')[] = [],
  target = 'self',
  conditions: MasterEffect['conditions'] = unconditionalConditions,
) {
  const targetPolicy = target.startsWith('enemy')
    ? ('enemy' as const)
    : target === 'ptOther' || target === 'ptOtherFull'
      ? ('partyOther' as const)
      : target === 'ptOne' || target === 'ptAll' || target === 'ptFull'
        ? ('partyMember' as const)
        : ('sourceSelf' as const);
  const modifier =
    buffType === 'upAtk'
      ? ('attackBuff' as const)
      : buffType === 'upDamage'
        ? ('powerMod' as const)
        : buffType === 'upNpdamage'
          ? ('npDamageBuff' as const)
          : buffType === 'upCommandall' && cardTypes.length > 0
            ? ('cardBuff' as const)
            : null;
  const values = [Array.from({ length: 10 }, () => value), [], [], [], []] as const;
  return {
    id,
    occurrenceId: `${id}:0`,
    availability: 'allLimitBreakStates' as const,
    interaction: null,
    label: id,
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
    conditions,
    conditionTargetPolicy: targetPolicy,
    execution:
      buffType === 'pierceDefence' || buffType === 'pierceSubdamage'
        ? [
            {
              kind:
                buffType === 'pierceDefence'
                  ? ('ignoreDefense' as const)
                  : ('ignoreDamageCut' as const),
              targetPolicy,
              expectedRecipient: 'attacker' as const,
              targetMismatch: 'unsupported' as const,
              semanticSupport: 'supported' as const,
            },
          ]
        : modifier
          ? [
              {
                kind: 'damageModifier' as const,
                modifier,
                sign: 1 as const,
                targetPolicy,
                expectedRecipient: 'attacker' as const,
                targetMismatch: 'unsupported' as const,
                card: cardTypes[0] ?? null,
                values,
                limitBreakValues: values,
                valueExpressions: [[], [], [], [], []] as const,
                limitBreakValueExpressions: [[], [], [], [], []] as const,
                semanticSupport: 'supported' as const,
              },
            ]
          : [{ kind: 'nonDamage' as const }],
    atlasEvidence: {
      functionType: 'addStateShort',
      target,
      parameterSets: [Array.from({ length: 10 }, () => ({ Value: value })), [], [], [], []],
      parameterSemantics: emptyParameterSemantics,
      unresolvedSemanticKeys: [],
      buffTypes: [buffType],
      buffRateTargets: [],
      buffConditionKeys: [],
    },
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
  it('keeps repeated Function IDs as independent decisions and operations', () => {
    const first = modifierEffect('shared-function', 'upAtk', 100);
    const second = {
      ...modifierEffect('shared-function', 'upAtk', 200),
      occurrenceId: 'shared-function:1',
      availability: 'allLimitBreakStates' as const,
    };
    const baseServant = fixture.servants[0]!;
    const occurrenceMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'occurrence-skill',
              slot: 1,
              priority: 1,
              name: 'occurrence skill',
              detail: '',
              imageKey: null,
              effects: [first, second],
            },
          ],
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(occurrenceMaster, undefined),
      attackerSkills: [{ skillId: 'occurrence-skill', skillLevel: 10 }],
    };
    const inactive = calculateScenario(scenario, occurrenceMaster, {
      ...versions,
      masterDataVersion: occurrenceMaster.version,
    });
    const effects = inactive.effects.filter(
      (effect) => effect.source.effectId === 'shared-function',
    );

    expect(effects.map((effect) => effect.source.effectOccurrenceId)).toEqual([
      'shared-function:0',
      'shared-function:1',
    ]);
    expect(new Set(effects.map((effect) => effect.projectionKey)).size).toBe(2);

    const selected = effects.reduce(
      (current, effect) => applyEffectProjectionDecision(current, effect, true),
      scenario,
    );
    const calculation = calculateScenario(selected, occurrenceMaster, {
      ...versions,
      masterDataVersion: occurrenceMaster.version,
    });
    expect(calculation.input.attackBuff).toBe(0.3);
    expect(
      calculation.effects.filter(
        (effect) => effect.source.effectId === 'shared-function' && effect.outcome === 'applied',
      ),
    ).toHaveLength(2);
  });

  it('executes hidden automatic field mutations before dependent modifiers', () => {
    const fieldEffect = {
      ...modifierEffect('field-sunshine', 'fieldIndividuality', 2_038),
      label: 'field mutation',
      timing: 'beforeDamage' as const,
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          targetPolicy: 'sourceSelf' as const,
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
      ],
    };
    const conditional = {
      ...modifierEffect('sunshine-power', 'upAtk', 300, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'all',
          traits: [{ name: 'fieldSunlight', negative: false }],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const classRelation = {
      ...modifierEffect('class-relation', 'overwriteClassRelation', 0),
      type: 'addState',
      label: 'class relation override',
    };
    const baseServant = fixture.servants[0]!;
    const fieldMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          noblePhantasms: baseServant.noblePhantasms.map((np) => ({
            ...np,
            effects: [fieldEffect, conditional],
          })),
          passives: [
            {
              id: 'class-passive',
              slot: 0,
              priority: 1,
              name: 'class passive',
              detail: '',
              imageKey: null,
              effects: [classRelation],
            },
          ],
        },
      ],
    });
    const scenario = createDefaultResolvedScenario(fieldMaster, undefined);
    const calculation = calculateScenario(scenario, fieldMaster, {
      ...versions,
      masterDataVersion: fieldMaster.version,
    });

    expect(
      calculation.effects.find((effect) => effect.label === 'field mutation')?.visibility,
    ).toBe('hidden');
    expect(calculation.effects.some((effect) => effect.label === 'class relation override')).toBe(
      false,
    );
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.input.attackBuff).toBe(0.3);
    expect(calculation.input.fieldTraits).toContain('fieldSunlight');
    expect(calculation.effects.find((effect) => effect.label === 'field mutation')?.outcome).toBe(
      'applied',
    );
  });

  it('gates skill mutations by source use and terminal modifiers by inclusion', () => {
    const fieldEffect = {
      ...modifierEffect('field-sunshine', 'fieldIndividuality', 2_038),
      label: 'field mutation',
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          targetPolicy: 'sourceSelf' as const,
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
      ],
    };
    const recipientEffect = {
      ...modifierEffect('recipient-blessing', 'addIndividuality', 2_038, [], 'self'),
      label: 'recipient mutation',
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          targetPolicy: 'sourceSelf' as const,
          trait: 'blessedByKur',
          damageRelevant: false,
        },
      ],
    };
    const conditional = {
      ...modifierEffect('sunshine-power', 'upAtk', 300, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'all',
          traits: [{ name: 'fieldSunlight', negative: false }],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const alternativeField = {
      ...modifierEffect('alternative-field-power', 'upNpdamage', 250, [], 'self', {
        ...unconditionalConditions,
        field: {
          operator: 'any',
          traits: [
            { name: 'fieldSunlight', negative: false },
            { name: 'fieldShore', negative: false },
          ],
        },
      }),
      timing: 'beforeDamage' as const,
    };
    const sameSkillPower = {
      ...modifierEffect('skill-power', 'upDamage', 200),
      label: 'same-skill-power',
    };
    const siblingSkillPower = {
      ...modifierEffect('skill-np-power', 'upNpdamage', 100),
      label: 'sibling-skill-power',
    };
    const baseServant = fixture.servants[0]!;
    const linkedMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'mutation-skill',
              slot: 1,
              priority: 1,
              name: 'mutation skill',
              detail: '',
              imageKey: null,
              effects: [fieldEffect, recipientEffect, sameSkillPower, siblingSkillPower],
            },
          ],
          noblePhantasms: baseServant.noblePhantasms.map((np) => ({
            ...np,
            effects: [conditional, alternativeField],
          })),
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(linkedMaster, undefined),
      attackerSkills: [{ skillId: 'mutation-skill', skillLevel: 10 }],
    };
    const versionContext = { ...versions, masterDataVersion: linkedMaster.version };
    const initial = calculateScenario(scenario, linkedMaster, versionContext);
    expect(initial.input.fieldTraits).toEqual([]);
    expect(initial.input.attackerStateTraits).toEqual([]);
    expect(initial.effects.find((effect) => effect.label === 'field mutation')).toMatchObject({
      visibility: 'hidden',
      outcome: 'notApplied',
    });
    expect(initial.effects.find((effect) => effect.label === 'recipient mutation')).toMatchObject({
      visibility: 'hidden',
      outcome: 'notApplied',
    });

    const sameSkillPowerProjection = initial.effects.find(
      (effect) => effect.label === 'same-skill-power',
    )!;
    const siblingSkillPowerProjection = initial.effects.find(
      (effect) => effect.label === 'sibling-skill-power',
    )!;
    const usedScenario = applyEffectPresentationDecision(
      applyEffectPresentationDecision(scenario, sameSkillPowerProjection, true, initial.effects),
      siblingSkillPowerProjection,
      true,
      initial.effects,
    );
    const used = calculateScenario(usedScenario, linkedMaster, versionContext);
    expect(used.result.status).toBe('calculated');
    expect(used.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(used.input.attackerStateTraits).toEqual(['blessedByKur']);
    expect(used.input.attackBuff).toBe(0.3);
    expect(used.input.npDamageBuff).toBe(0.35);
    expect(used.input.powerMod).toBe(0.2);
    expect(used.effects.find((effect) => effect.label === 'recipient mutation')?.outcome).toBe(
      'applied',
    );

    const sunshine = used.effects.find((effect) => effect.label === 'same-skill-power')!;
    const siblingMaintainedScenario = applyEffectProjectionDecision(usedScenario, sunshine, false);
    const siblingMaintained = calculateScenario(
      siblingMaintainedScenario,
      linkedMaster,
      versionContext,
    );
    expect(siblingMaintained.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(siblingMaintained.input.attackerStateTraits).toEqual(['blessedByKur']);
    expect(siblingMaintained.input.attackBuff).toBe(0.3);
    expect(siblingMaintained.input.npDamageBuff).toBe(0.35);
    expect(siblingMaintained.input.powerMod).toBe(0);

    const sibling = siblingMaintained.effects.find(
      (effect) => effect.label === 'sibling-skill-power',
    )!;
    const excluded = calculateScenario(
      applyEffectProjectionDecision(siblingMaintainedScenario, sibling, false),
      linkedMaster,
      versionContext,
    );
    expect(excluded.input.fieldTraits).toEqual([]);
    expect(excluded.input.attackBuff).toBe(0);
    expect(excluded.input.powerMod).toBe(0);
    expect(excluded.input.attackerStateTraits).toEqual([]);
  });

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
    const conditionalMaster = parseTestMaster({
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
                  targetTrait: { kind: 'trait', name: 'dragon' },
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
      explanation: { code: 'unresolved' },
      value: 1.5,
      controllability: 'user',
      decision: { state: 'enabled', plan: { activation: 'user' } },
    });
    expect(inactive.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);

    const active = calculateScenario(
      applyEffectConditionDecision(
        applyEffectProjectionDecision(scenario, condition!, true),
        condition!,
        true,
      ),
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

    const excluded = calculateScenario(
      applyEffectProjectionDecision(
        applyEffectConditionDecision(scenario, condition!, true),
        condition!,
        false,
      ),
      conditionalMaster,
      { ...versions, masterDataVersion: conditionalMaster.version },
    );
    expect(excluded.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(
      excluded.effects.find((effect) => effect.projectionKey === condition!.projectionKey),
    ).toMatchObject({ outcome: 'notApplied', explanation: { code: 'disabled' } });
    expect(excluded.result.status).toBe('calculated');
  });

  it('applies one exclusive conditional modifier and fails closed when both are selected', () => {
    const baseServant = fixture.servants[0]!;
    const exclusiveMaster = parseTestMaster({
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
                modifierEffect(
                  'earth-power-b',
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
    const earthB = inactive.effects.find((effect) => effect.label === 'earth-power-b')!;
    const skyScenario = applyEffectConditionDecision(
      applyEffectProjectionDecision(scenario, sky, true),
      sky,
      true,
      inactive.effects,
    );

    const skyOnly = calculateScenario(skyScenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    expect(skyOnly.result.status).toBe('calculated');
    expect(skyOnly.input).toMatchObject({
      powerMod: 0.5,
      fieldTraits: [],
      target: { traits: [] },
    });
    expect(skyOnly.effects.find((effect) => effect.label === 'sky-power')?.outcome).toBe('applied');
    expect(skyOnly.effects.find((effect) => effect.label === 'earth-power')?.outcome).toBe(
      'notApplied',
    );

    const earthIncluded = applyEffectProjectionDecision(skyScenario, earth, true);
    const earthScenario = applyEffectConditionDecision(
      earthIncluded,
      earth,
      true,
      inactive.effects,
    );
    const earthOnly = calculateScenario(earthScenario, exclusiveMaster, {
      ...versions,
      masterDataVersion: exclusiveMaster.version,
    });
    expect(earthOnly.result.status).toBe('calculated');
    expect(earthOnly.input.powerMod).toBe(0.5);
    expect(
      earthOnly.effects.find((effect) => effect.label === 'sky-power')?.conditionDecision,
    ).toBe('evaluate');

    const conflict = calculateScenario(
      {
        ...earthScenario,
        effectDecisions: earthScenario.effectDecisions.map((decision) =>
          decision.decisionKey === sky.projectionKey
            ? { ...decision, conditionSatisfaction: 'assumeSatisfied' as const }
            : decision,
        ),
      },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(
      conflict.effects
        .filter((effect) => ['sky-power', 'earth-power'].includes(effect.label))
        .map((effect) => effect.outcome),
    ).toEqual(['notApplied', 'notApplied']);

    const fixedFactConflict = calculateScenario(
      {
        ...applyEffectConditionDecision(
          applyEffectConditionDecision(
            applyEffectProjectionDecision(
              applyEffectProjectionDecision(scenario, earth, true),
              earthB,
              true,
            ),
            earth,
            true,
          ),
          earthB,
          true,
        ),
        worldFactAssertions: [
          {
            decisionKey: 'world:sky',
            fact: {
              kind: 'trait',
              scope: 'target',
              trait: 'attributeSky',
              present: true,
            },
          },
        ],
      },
      exclusiveMaster,
      { ...versions, masterDataVersion: exclusiveMaster.version },
    );
    expect(fixedFactConflict.result.status).toBe('unsupported');
    expect(fixedFactConflict.input.powerMod).toBe(0);
    expect(
      fixedFactConflict.effects
        .filter((effect) => ['earth-power', 'earth-power-b'].includes(effect.label))
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
    const supportMaster = parseTestMaster({
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
              skills: [{ skillId: 'support-condition-skill', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [],
        },
      },
    };
    const inactive = calculateScenario(scenario, supportMaster, {
      ...versions,
      masterDataVersion: supportMaster.version,
    });
    const projection = inactive.effects.find((effect) => effect.label === 'support-sky-power')!;
    const active = calculateScenario(
      applyEffectConditionDecision(
        applyEffectProjectionDecision(scenario, projection, true),
        projection,
        true,
      ),
      supportMaster,
      { ...versions, masterDataVersion: supportMaster.version },
    );

    expect(projection).toMatchObject({
      controllability: 'user',
      decision: {
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
    });
    expect(active.result.status).toBe('calculated');
    expect(active.input).toMatchObject({
      powerMod: 0.3,
      fieldTraits: [],
      target: { traits: [] },
    });
    expect(active.effects.find((effect) => effect.label === 'support-sky-power')).toMatchObject({
      outcome: 'applied',
      decision: { state: 'enabled' },
    });
  });

  it('validates context mutations transactionally against selected conditions', () => {
    const baseServant = fixture.servants[0]!;
    const heavenContext = {
      ...modifierEffect('heaven-context', 'nonDamageContext', 0),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'field' as const,
          targetPolicy: 'sourceSelf' as const,
          trait: 'fieldHeaven',
          damageRelevant: false,
        },
      ],
    };
    const transactionalMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          passives: [
            {
              id: 'realm-passive',
              slot: 0,
              priority: 0,
              name: 'realm passive',
              detail: '',
              imageKey: null,
              effects: [heavenContext],
            },
          ],
          skills: [
            {
              id: 'hell-power-skill',
              slot: 1,
              priority: 1,
              name: 'hell power',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect('hell-power', 'upDamage', 500, [], 'self', {
                  ...unconditionalConditions,
                  field: {
                    operator: 'all',
                    traits: [{ name: 'fieldHell', negative: false }],
                  },
                }),
              ],
            },
          ],
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(transactionalMaster, undefined),
      attackerSkills: [{ skillId: 'hell-power-skill', skillLevel: 10 }],
    };
    const initial = calculateScenario(scenario, transactionalMaster, {
      ...versions,
      masterDataVersion: transactionalMaster.version,
    });
    const hell = initial.effects.find((effect) => effect.label === 'hell-power')!;
    const conflict = calculateScenario(
      {
        ...scenario,
        effectDecisions: [
          {
            decisionKey: hell.projectionKey,
            operationEnabled: true,
            conditionSatisfaction: 'assumeSatisfied' as const,
          },
        ],
      },
      transactionalMaster,
      { ...versions, masterDataVersion: transactionalMaster.version },
    );
    const context = conflict.effects.find((effect) => effect.label === 'heaven-context')!;

    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(context).toMatchObject({ visibility: 'hidden', outcome: 'unsupported' });
    expect(conflict.effects.find((effect) => effect.label === 'hell-power')?.outcome).toBe(
      'notApplied',
    );
    expect(conflict.input.fieldTraits).toEqual([]);
    expect(conflict.input.powerMod).toBe(0);
  });

  it('rolls back every operation in an effect when a later runtime value is unresolved', () => {
    const baseServant = fixture.servants[0]!;
    const staticModifier = modifierEffect('compound', 'upAtk', 100).execution[0]!;
    const hpValues = [Array.from({ length: 10 }, () => 200), [], [], [], []] as const;
    const hpExpressions = [
      Array.from({ length: 10 }, () => ({
        kind: 'inverseHpLinear' as const,
        basePermille: 200,
        bonusAtZeroHpPermille: 300,
      })),
      [],
      [],
      [],
      [],
    ] as const;
    const compoundEffect = {
      ...modifierEffect('compound', 'upAtk', 100),
      execution: [
        staticModifier,
        {
          ...staticModifier,
          modifier: 'powerMod' as const,
          values: hpValues,
          limitBreakValues: hpValues,
          valueExpressions: hpExpressions,
          limitBreakValueExpressions: hpExpressions,
        },
      ],
    };
    const compoundMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          skills: [
            {
              id: 'compound-skill',
              slot: 1,
              priority: 1,
              name: 'compound skill',
              detail: '',
              imageKey: null,
              effects: [compoundEffect],
            },
          ],
        },
      ],
    });
    const scenario = {
      ...createDefaultResolvedScenario(compoundMaster, undefined),
      attackerHpPermille: null,
      attackerSkills: [{ skillId: 'compound-skill', skillLevel: 10 }],
    };
    const initial = calculateScenario(scenario, compoundMaster, {
      ...versions,
      masterDataVersion: compoundMaster.version,
    });
    const projection = initial.effects.find((effect) => effect.label === 'compound')!;
    const selectedScenario = applyEffectProjectionDecision(scenario, projection, true);
    const prepared = prepareOrderedScenario(
      initial.scenarioInput,
      selectedScenario,
      compoundMaster,
    );
    const execution = executeOrderedScenario(
      prepared,
      resolveCanonicalInputValues(prepared.inputDefinitions, selectedScenario.canonicalInputValues),
    );
    const compoundOperations = execution.operations.filter(
      ({ operation }) => operation.source.effectOccurrenceId === 'compound:0',
    );

    expect(execution.precision).toBe('unsupported');
    expect(compoundOperations).toHaveLength(2);
    expect(compoundOperations.every((result) => result.outcome === 'unsupported')).toBe(true);
    expect(execution.state.modifiers).toEqual([]);
    expect(execution.input.attackBuff).toBe(0);
    expect(execution.input.powerMod).toBe(0);
  });

  it('routes conditional passives and craft essences through the same effect-local decision', () => {
    const baseServant = fixture.servants[0]!;
    const orCondition = {
      ...unconditionalConditions,
      opponent: {
        operator: 'any' as const,
        traits: [
          { name: 'dragon', negative: false },
          { name: 'lamia', negative: false },
        ],
      },
    };
    const conditionalMaster = parseTestMaster({
      ...fixture,
      servants: [
        {
          ...baseServant,
          passives: [
            {
              id: 'conditional-passive',
              slot: 0,
              priority: 1,
              name: 'conditional passive',
              detail: '',
              imageKey: null,
              effects: [
                modifierEffect('passive-or-power', 'upDamage', 200, [], 'self', orCondition),
              ],
            },
          ],
        },
      ],
      craftEssences: fixture.craftEssences.map((craftEssence) => ({
        ...craftEssence,
        effects: [modifierEffect('ce-or-power', 'upDamage', 300, [], 'self', orCondition)],
      })),
    });
    const baseScenario = {
      ...createDefaultResolvedScenario(conditionalMaster, undefined),
      craftEssence: {
        craftEssenceId: conditionalMaster.craftEssences[0]!.id,
        level: 1,
        limitBreak: 0,
      },
    };
    const initial = calculateScenario(baseScenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    const passive = initial.effects.find((effect) => effect.label === 'passive-or-power')!;
    const craftEssence = initial.effects.find((effect) => effect.label === 'ce-or-power')!;
    expect([passive, craftEssence]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ controllability: 'user', outcome: 'notApplied' }),
      ]),
    );
    const includedScenario = applyEffectProjectionDecision(
      applyEffectProjectionDecision(baseScenario, passive, true),
      craftEssence,
      true,
    );
    const selectedScenario = applyEffectConditionDecision(
      applyEffectConditionDecision(includedScenario, passive, true),
      craftEssence,
      true,
    );
    const selected = calculateScenario(selectedScenario, conditionalMaster, {
      ...versions,
      masterDataVersion: conditionalMaster.version,
    });
    expect(selected.result.status).toBe('calculated');
    expect(selected.input.powerMod).toBe(0.5);
    expect(selected.input.target.traits).toEqual([]);
  });

  it('derives world-fact exclusivity canonically without scenario metadata', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const externallyParsed = calculationScenarioSchema.parse({
      ...scenario,
      worldFactAssertions: [
        {
          decisionKey: 'world:sky',
          fact: {
            kind: 'trait',
            scope: 'target',
            trait: 'attributeSky',
            present: true,
            exclusiveGroup: null,
          },
        },
        {
          decisionKey: 'world:earth',
          fact: {
            kind: 'trait',
            scope: 'target',
            trait: 'attributeEarth',
            present: true,
            exclusiveGroup: null,
          },
        },
      ],
    });
    if (externallyParsed.mode !== 'resolved') throw new Error('resolved scenario expected');
    expect('exclusiveGroup' in externallyParsed.worldFactAssertions[0]!.fact).toBe(false);
    const conflict = calculateScenario(externallyParsed, master, versions);
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );
    expect(conflict.input.target.traits).toEqual([]);
  });

  it('preserves repeated state-trait stacks through ordered NP execution', () => {
    const baseServant = fixture.servants[0]!;
    const burn = { kind: 'trait' as const, name: 'buffBurn' };
    const stackEffect = (id: string) => ({
      ...modifierEffect(id, 'addIndividuality', 0, [], 'enemyAll'),
      execution: [
        {
          kind: 'contextMutation' as const,
          mutation: 'addTrait' as const,
          scope: 'recipientState' as const,
          targetPolicy: 'enemy' as const,
          trait: burn.name,
          damageRelevant: false,
        },
      ],
      timing: 'beforeDamage' as const,
    });
    const stackedMaster = parseTestMaster({
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
                  targetIds: [99],
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
    const combinationMaster = parseTestMaster({
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
      targetContext: {
        class: { kind: 'relative' as const, relation: 'neutral' as const },
        attribute: { kind: 'relative' as const, relation: 'neutral' as const },
        families: [],
      },
      craftEssence: { craftEssenceId: 'fixture-ce', level: 1, limitBreak: 0 },
      attackerSkills: [{ skillId: 'attacker-skill', skillLevel: 10 }],
      mysticCode: {
        mysticCodeId: 'combo-mc',
        skills: [{ skillId: 'mc-skill', skillLevel: 10, enabled: true }],
      },
      effectDecisions: [
        {
          decisionKey: 'attacker:attacker:fixture-saber:attacker-skill:attacker-attack:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
        {
          decisionKey: 'mysticCode:mysticCode:combo-mc:mc-skill:mc-card:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
        {
          decisionKey: 'support:support-1:support-skill:support-power:0',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support-1',
              servantId: 'combo-support',
              skills: [{ skillId: 'support-skill', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [
            {
              sourceInstanceId: 'support-1',
              skillId: 'support-skill',
              effectId: 'support-power',
              effectOccurrenceId: 'support-power:0',
              included: false as const,
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
