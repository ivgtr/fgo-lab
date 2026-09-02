import {
  activeServantSkillSchema,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { createStaticAttackProfiles } from './attackProfile';
import { compileCandidateLocalActionAdmission } from './rankingActionAdmission';
import type { RankingPolicyConditions } from './rankingContracts';
import type { StaticRankingPreparationProgram } from './rankingStaticPreparation';

const master = masterSnapshotSchema.parse(fixture);
const servant = master.servants[0]!;
const attackProfile = createStaticAttackProfiles(servant)[0]!;
const formId = servant.actorFormGraph.defaultInitialFormId;
const route = {
  target: 'sourceSelf' as const,
  contributionScope: 'personal' as const,
  eligibility: {
    kind: 'requiredRecipient' as const,
    recipient: 'attacker' as const,
    onMissing: 'ignore' as const,
    onMismatch: 'unsupported' as const,
  },
};

function effect(
  occurrenceId: string,
  execution: MasterEffect['execution'],
  requirement: MasterEffect['requirement']['expression'] = { kind: 'always' },
): MasterEffect {
  return {
    id: occurrenceId,
    occurrenceId,
    label: occurrenceId,
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: requirement },
    execution,
    atlasEvidence: {
      functionType: 'fixture',
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
}

function program(
  effects: readonly MasterEffect[],
  key = 'with-action',
): StaticRankingPreparationProgram {
  const skill = activeServantSkillSchema.parse({
    id: 'skill',
    priority: 0,
    name: 'skill',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    slot: 1,
    effects,
  });
  return {
    key,
    attackProfile,
    initialFormId: formId,
    expectedTerminalFormId: formId,
    commands: [
      { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
      { kind: 'executeAttackNoblePhantasm' },
    ],
    sourceUses: [{ kind: 'skill', actorFormId: formId, skill, effects, skillLevel: 10 }],
  };
}

const withoutAction: StaticRankingPreparationProgram = {
  key: 'without-action',
  attackProfile,
  initialFormId: formId,
  expectedTerminalFormId: formId,
  commands: [{ kind: 'executeAttackNoblePhantasm' }],
  sourceUses: [],
};
const baseline: RankingPolicyConditions = {
  npLevel: 1,
  classAffinity: 'neutral',
  comparisonMode: 'standard',
  selfBuffs: 'included',
  conditionalEffects: 'baseline',
};
const positive = effect('positive:0', [
  {
    kind: 'damageModifier',
    modifier: 'attackBuff',
    sign: 1,
    card: null,
    route,
    semanticSupport: 'supported',
    values: [[300], [], [], [], []],
    valueExpressions: [[null], [], [], [], []],
  },
]);

describe('candidate-local action admission', () => {
  it('admits only a proved positive, deterministic, cost-free optional baseline action', () => {
    const admitted = compileCandidateLocalActionAdmission(
      [withoutAction, program([positive])],
      baseline,
    );
    expect(admitted.programs.map(({ key }) => key)).toEqual(['without-action', 'with-action']);
    expect(admitted.programs[1]?.actionAdmissions).toEqual([
      { kind: 'admitted', role: 'optional' },
    ]);

    const costly = effect('costly:0', [
      ...positive.execution,
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'loss',
        unit: 'fixed',
        recipient: 'sourceSelf',
        amount: { kind: 'fixed', values: [[100], [], [], [], []] },
        subjectId: null,
      },
    ]);
    expect(
      compileCandidateLocalActionAdmission(
        [withoutAction, program([costly])],
        baseline,
      ).programs.map(({ key }) => key),
    ).toEqual(['without-action']);
  });

  it('omits optional condition enablers under self-excluded/satisfied policy', () => {
    const enabler = effect('enabler:0', [
      { kind: 'stateMutation', mutation: 'add', recipient: 'sourceSelf', polarity: 'beneficial' },
    ]);
    const result = compileCandidateLocalActionAdmission([withoutAction, program([enabler])], {
      ...baseline,
      selfBuffs: 'excluded',
      conditionalEffects: 'satisfied',
    });
    expect(result.programs.map(({ key }) => key)).toEqual(['without-action']);
  });

  it('derives structural role from the complete ordered-path family', () => {
    const structural = compileCandidateLocalActionAdmission([program([positive])], {
      ...baseline,
      selfBuffs: 'excluded',
    });
    expect(structural.programs[0]?.actionAdmissions).toEqual([
      { kind: 'admitted', role: 'structuralRequired' },
    ]);
  });
});
