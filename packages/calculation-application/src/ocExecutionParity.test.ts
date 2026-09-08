import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { describe, expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  masterEffectSchema,
  type OcExecutionOperation,
} from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  calculationResultSchema,
  type CalculationScenario,
} from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import { stackEffectTemplate } from './stackQuantityFixture';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { compileRankingContributionPolicy } from './contributionPolicy';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  createCalculatorPortableRequest,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  reapplyPreparedCalculationPolicy,
} from './scenario';

function ocMaster(applicationRatePermille = 1000) {
  const master = masterSnapshotSchema.parse(fixture);
  const servant = master.servants[0]!;
  const effect = masterEffectSchema.parse({
    ...stackEffectTemplate,
    id: 'oc',
    occurrenceId: 'oc:0',
    label: 'OC',
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    execution: [
      {
        kind: 'grantOcBoost',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
        lifetime: 'active',
        stacking: 'additive',
        stateTraits: ['positive'],
        cells: [
          Array.from({ length: 10 }, () => ({
            stages: 2,
            applicationRatePermille,
            turns: { kind: 'unlimited' },
            uses: { kind: 'finite', remaining: 1 },
          })),
          [],
          [],
          [],
          [],
        ] as Extract<OcExecutionOperation, { kind: 'grantOcBoost' }>['cells'],
      },
    ],
  });
  servant.skills = [
    {
      id: 'oc-skill',
      name: 'OC skill',
      detail: '',
      imageKey: null,
      priority: 0,
      slot: 1,
      resourceRequirement: null,
      effects: [effect],
    },
  ];
  for (const form of servant.actorFormGraph.forms) form.skillIds = ['oc-skill'];
  master.servants = [servant];
  return masterSnapshotSchema.parse(master);
}
function scenarioFor(
  master: ReturnType<typeof ocMaster>,
): Extract<CalculationScenario, { mode: 'resolved' }> {
  return {
    ...createDefaultResolvedScenario(master, undefined),
    preNoblePhantasmPlan: [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 10, choice: null },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
}
function versions(master: ReturnType<typeof ocMaster>) {
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    masterDataVersion: master.version,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
}

describe('canonical OC application and portable parity', () => {
  it.each(['commandCard', 'commandCardAttack'] as const)(
    'replays %s non-execution through all ranking policies, calculator and portable recovery',
    (triggerScope) => {
      const master = ocMaster();
      master.servants[0]!.skills[0]!.effects[0]!.triggerScope = triggerScope;
      for (const selfBuffs of ['included', 'excluded'] as const) {
        for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
          const ranking = calculateRankingPolicy(
            master,
            { servantBuilds: {} },
            { ...DEFAULT_RANKING_POLICY_CONDITIONS, selfBuffs, conditionalEffects },
            versions(master),
          );
          expect(ranking.exclusions).toEqual([]);
          const result = Object.values(ranking.profileResults)[0]!;
          expect(result.status).toBe('calculated');
          if (result.status !== 'calculated') throw new Error(result.status);
          const request = createRankingPortableRequest(
            result.detail,
            currentCalculationVersionContext(master),
          );
          const replay = executePortableCalculation(request, master);
          const calculator = calculateScenario(result.detail.scenario, master, versions(master));
          expect(replay.status).toBe('executed');
          if (replay.status !== 'executed') throw new Error(replay.status);
          expect(replay.execution.result).toEqual(result.detail.result);
          expect(calculator.result.status).toBe('calculated');
          if (calculator.result.status !== 'calculated') throw new Error(calculator.result.status);
          expect(calculator.result.rows).toEqual(result.detail.result.rows);
          expect(replay.execution.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
            effectiveOc: 1,
            boostUses: [],
          });
        }
      }
      const explicitSkill = calculateScenario(scenarioFor(master), master, versions(master));
      expect(explicitSkill.result.status).toBe('calculated');
      expect(explicitSkill.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
        effectiveOc: 1,
        boostUses: [],
      });
    },
  );

  it('keeps the human-readable OC source name in the NP-use evidence', () => {
    const master = ocMaster();
    const execution = calculateScenario(scenarioFor(master), master, versions(master));
    expect(execution.appliedPreparationActions.at(-1)?.ocUse?.boostUses).toMatchObject([
      { skillName: 'OC skill', label: 'OC', stages: 2 },
    ]);
  });

  it('defers an unread passive rate and repairs its actual grant query from the original request', () => {
    const master = ocMaster(500);
    const scenario = scenarioFor(master);
    const servant = master.servants[0]!;
    const boost = servant.skills[0]!.effects[0]!;
    const rate = masterEffectSchema.parse({
      ...boost,
      id: 'rate',
      occurrenceId: 'rate:0',
      gameActivation: 'constant',
      requirement: {
        recipient: 'sourceSelf',
        expression: {
          kind: 'trait',
          scope: 'field',
          trait: 'sunlight',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
      },
      execution: [
        {
          kind: 'grantOcApplicationRate',
          route: {
            target: 'sourceSelf',
            contributionScope: 'personal',
            eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
          },
          lifetime: 'constant',
          stacking: 'additive',
          stateTraits: ['positive'],
          role: 'casterGrant',
          sign: 1,
          selector: 'positive',
          cells: [
            [
              {
                applicationRatePermille: 1000,
                amount: { kind: 'fixed', value: 500 },
                turns: { kind: 'unlimited' },
                uses: { kind: 'unlimited' },
              },
            ],
            [],
            [],
            [],
            [],
          ],
        },
      ],
    });
    servant.passives = [
      {
        id: 'passive-rate',
        name: 'Rate',
        detail: '',
        imageKey: null,
        priority: 0,
        resourceRequirement: null,
        effects: [rate],
      },
    ];
    for (const form of servant.actorFormGraph.forms) form.passiveIds = ['passive-rate'];
    const unread = {
      ...scenario,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
    };
    expect(calculateScenario(unread, master, versions(master)).result.status).toBe('calculated');
    const missing = calculateScenario(scenario, master, versions(master));
    expect(missing.result.status).toBe('inputRequired');
    expect(missing.appliedPreparationActions).toHaveLength(0);
    const definition = missing.inputDefinitions.find(
      (input) => input.kind === 'worldTraitPresence',
    );
    expect(definition).toBeDefined();
    if (!definition) return;
    const repaired = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: definition.key,
      value: 1,
    });
    const replay = calculateScenario(repaired, master, versions(master));
    expect(replay.result.status).toBe('calculated');
    expect(replay.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
      boostTotal: 2,
      effectiveOc: 3,
    });
    expect(calculateScenario(scenario, master, versions(master))).toEqual(missing);
    expect(calculateScenario(repaired, master, versions(master))).toEqual(replay);
    const portable = executePortableCalculation(
      createCalculatorPortableRequest(repaired, currentCalculationVersionContext(master)),
      master,
    );
    expect(portable.status).toBe('executed');
    if (portable.status === 'executed') expect(portable.execution).toEqual(replay);
  });
  it('repairs a grant outcome through the input command and replays the same receipt', () => {
    const master = ocMaster(500);
    const scenario = scenarioFor(master);
    const missing = calculateScenario(scenario, master, versions(master));
    expect(missing.result.status).toBe('inputRequired');
    expect(calculationResultSchema.parse(missing.result)).toEqual(missing.result);
    if (missing.result.status !== 'inputRequired') return;
    const definition = missing.result.requiredInputs.find((input) =>
      input.key.startsWith('oc:proc:'),
    );
    expect(definition).toBeDefined();
    if (!definition) return;
    const repaired = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: definition.key,
      value: 1,
    });
    const calculated = calculateScenario(repaired, master, versions(master));
    expect(calculated.result.status).toBe('calculated');
    expect(calculated.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
      gaugeBefore: 10000,
      baseOc: 1,
      boostTotal: 2,
      effectiveOc: 3,
    });
    const request = createCalculatorPortableRequest(
      repaired,
      currentCalculationVersionContext(master),
    );
    const portable = executePortableCalculation(request, master);
    expect(portable.status).toBe('executed');
    if (portable.status !== 'executed') return;
    expect(portable.execution.result).toEqual(calculated.result);
    expect(portable.execution.status).toBe('executable');
    if (portable.execution.status !== 'executable' || calculated.status !== 'executable') return;
    expect(portable.execution.input).toEqual(calculated.input);
    expect(portable.execution.appliedPreparationActions).toEqual(
      calculated.appliedPreparationActions,
    );
  });
  it('repairs a world-trait condition without keeping a second input value', () => {
    const master = ocMaster();
    const effect = master.servants[0]!.skills[0]!.effects[0]!;
    effect.requirement.expression = {
      kind: 'trait',
      scope: 'field',
      trait: 'sunlight',
      present: true,
      provenance: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'exclude',
        unremovableStateTraits: 'include',
      },
    };
    const scenario = scenarioFor(master);
    const missing = calculateScenario(scenario, master, versions(master));
    expect(missing.result.status).toBe('inputRequired');
    if (missing.result.status !== 'inputRequired') return;
    const definition = missing.inputDefinitions.find(
      (input) => input.kind === 'worldTraitPresence',
    );
    expect(definition).toBeDefined();
    if (!definition) return;
    for (const value of [0, 1]) {
      const repaired = applyCanonicalInputCommand(scenario, {
        kind: 'setCanonicalIntegerInput',
        key: definition.key,
        value,
      });
      expect(repaired.canonicalInputValues).not.toHaveProperty(definition.key);
      expect(repaired.worldFactAssertions).toMatchObject([
        { fact: { kind: 'trait', scope: 'field', trait: 'sunlight', present: value === 1 } },
      ]);
      const execution = calculateScenario(repaired, master, versions(master));
      expect(execution.result.status).toBe('calculated');
      expect(execution.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(
        value === 1 ? 3 : 1,
      );
    }
  });
  it('does not require an unknown condition excluded by the baseline policy', () => {
    const master = ocMaster();
    master.servants[0]!.skills[0]!.effects[0]!.requirement.expression = {
      kind: 'trait',
      scope: 'field',
      trait: 'sunlight',
      present: true,
      provenance: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'exclude',
        unremovableStateTraits: 'include',
      },
    };
    const prepared = prepareCalculationScenarioWithPolicy(
      scenarioFor(master),
      master,
      compileRankingContributionPolicy(DEFAULT_RANKING_POLICY_CONDITIONS, 'included'),
    );
    expect(prepared.status).toBe('executable');
    expect(prepared.resolved.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(1);
    expect(prepared.resolved.appliedPreparationActions[0]?.ocOutcomes).toContainEqual(
      expect.objectContaining({ outcome: 'policyExcluded' }),
    );
  });
  it('reprepares original commands with the new policy instead of reusing consumed OC', () => {
    const master = ocMaster();
    const scenario = scenarioFor(master);
    const included = compileRankingContributionPolicy(
      DEFAULT_RANKING_POLICY_CONDITIONS,
      'included',
    );
    const excluded = compileRankingContributionPolicy(
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, selfBuffs: 'excluded' },
      'included',
    );
    const prepared = prepareCalculationScenarioWithPolicy(scenario, master, included);
    const changed = reapplyPreparedCalculationPolicy(prepared, excluded);
    const fresh = prepareCalculationScenarioWithPolicy(scenario, master, excluded);
    expect(changed.resolved).toEqual(fresh.resolved);
    expect(prepared.resolved.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(3);
    expect(changed.resolved.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(1);
    expect(reapplyPreparedCalculationPolicy(changed, included).resolved).toEqual(prepared.resolved);
  });
});

describe('OC grant and existing damage state coexistence', () => {
  it.each(['skill', 'terminalNp', 'passive', 'craftEssence', 'support', 'mysticCode'] as const)(
    'projects the committed %s grant outcome once to a later damage reader',
    (path) => {
      const outputs: number[] = [];
      for (const applicationRatePermille of [0, 1000]) {
        const master = ocMaster();
        const scenario = scenarioFor(master);
        const servant = master.servants[0]!;
        const template = servant.skills[0]!.effects[0]!;
        const route = {
          target: 'enemy',
          contributionScope: 'enemyApplied',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        } as const;
        const grant = masterEffectSchema.parse({
          ...template,
          id: 'rate-context',
          occurrenceId: 'rate-context:0',
          gameActivation: path === 'terminalNp' ? 'npBeforeDamage' : 'skillUse',
          execution: [
            {
              kind: 'contextMutation',
              mutation: 'addTrait',
              scope: 'recipientState',
              route,
              trait: 'buffNegativeEffect',
              damageRelevant: true,
            },
            {
              kind: 'grantOcApplicationRate',
              route,
              lifetime: 'active',
              stacking: 'additive',
              stateTraits: ['negative'],
              role: 'recipientResistance',
              sign: 1,
              selector: 'positive',
              cells: Array.from({ length: 5 }, () =>
                Array.from({ length: 10 }, () => ({
                  applicationRatePermille,
                  amount: { kind: 'fixed', value: 200 },
                  turns: { kind: 'unlimited' },
                  uses: { kind: 'unlimited' },
                })),
              ),
            },
          ],
        });
        const reader = masterEffectSchema.parse({
          ...template,
          id: 'reader',
          occurrenceId: 'reader:0',
          gameActivation: 'npBeforeDamage',
          requirement: {
            recipient: 'sourceSelf',
            expression: {
              kind: 'trait',
              scope: 'opponent',
              trait: 'buffNegativeEffect',
              present: true,
              provenance: {
                stateSources: 'activeOnly',
                ignoredStateTraits: 'exclude',
                unremovableStateTraits: 'include',
              },
            },
          },
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
                  onMismatch: 'ignore',
                },
              },
              values: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 500)),
              valueExpressions: Array.from({ length: 5 }, () =>
                Array.from({ length: 5 }, () => null),
              ),
              semanticSupport: 'supported',
            },
          ],
        });
        if (path === 'skill') servant.skills[0]!.effects.push(grant);
        if (path === 'passive') {
          servant.passives = [
            {
              id: 'passive-context',
              name: 'Passive',
              detail: '',
              imageKey: null,
              priority: 0,
              resourceRequirement: null,
              effects: [grant],
            },
          ];
          for (const form of servant.actorFormGraph.forms) form.passiveIds = ['passive-context'];
        }
        if (path === 'craftEssence') {
          master.craftEssences[0]!.effects = [grant];
          scenario.craftEssence = {
            craftEssenceId: master.craftEssences[0]!.id,
            level: 1,
            limitBreak: 0,
          };
        }
        if (path === 'support') {
          servant.skills[0]!.effects.push(grant);
          scenario.preNoblePhantasmPlan = [{ kind: 'executeAttackNoblePhantasm' }];
          scenario.support = {
            sourceTemplateId: null,
            composition: {
              effectInclusions: [],
              sources: [
                {
                  sourceInstanceId: 'support-fixture',
                  servantId: servant.id,
                  skills: [{ skillId: servant.skills[0]!.id, skillLevel: 10, enabled: true }],
                },
              ],
            },
          };
        }
        if (path === 'mysticCode') {
          master.mysticCodes = [
            {
              id: 'mystic-fixture',
              name: 'Mystic',
              maxLevel: 10,
              imageKey: null,
              skills: [{ ...servant.skills[0]!, effects: [grant] }],
            },
          ];
          scenario.mysticCode = {
            mysticCodeId: master.mysticCodes[0]!.id,
            skills: [
              { skillId: master.mysticCodes[0]!.skills[0]!.id, skillLevel: 1, enabled: true },
            ],
          };
        }

        for (const group of servant.noblePhantasmVariantGroups)
          for (const variant of group.variants) {
            variant.effects = [
              ...(path === 'terminalNp' ? [{ ...grant, timing: 'beforeDamage' as const }] : []),
              { ...reader, timing: 'beforeDamage' as const },
            ];
          }
        scenario.worldFactAssertions = [
          {
            decisionKey: 'target-absence',
            fact: { kind: 'trait', scope: 'target', trait: 'buffNegativeEffect', present: false },
          },
          {
            decisionKey: 'state-absence',
            fact: {
              kind: 'trait',
              scope: 'targetState',
              trait: 'buffNegativeEffect',
              present: false,
            },
          },
        ];
        const execution = calculateScenario(scenario, master, versions(master));
        expect(execution.result.status).toBe('calculated');
        if (execution.result.status !== 'calculated' || execution.status !== 'executable') continue;
        outputs.push(execution.input.attackBuff);
        expect(
          execution.effects.filter(
            (effect) =>
              effect.source.effectOccurrenceId === 'reader:0' && effect.outcome === 'applied',
          ),
        ).toHaveLength(applicationRatePermille === 0 ? 0 : 1);
        const portable = executePortableCalculation(
          createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
          master,
        );
        expect(portable.status).toBe('executed');
        if (portable.status === 'executed') expect(portable.execution).toEqual(execution);
      }
      expect(outputs[1]! - outputs[0]!).toBe(0.5);
    },
  );
});
