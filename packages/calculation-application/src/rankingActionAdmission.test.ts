import {
  activeServantSkillSchema,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
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
  const selectedChoice = effects.find(
    (
      candidate,
    ): candidate is MasterEffect & {
      selection: Extract<MasterEffect['selection'], { kind: 'playerChoice' }>;
    } => candidate.selection?.kind === 'playerChoice',
  )?.selection;
  return {
    key,
    attackProfile,
    initialFormId: formId,
    expectedTerminalFormId: formId,
    commands: [
      {
        kind: 'useSkillSlot',
        slot: 1,
        skillLevel: 10,
        choice: selectedChoice
          ? {
              groupKey: selectedChoice.group.key,
              candidateKey: selectedChoice.group.candidate,
            }
          : null,
      },
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
  classAffinity: 'neutral',
  population: 'all',
  initialOvercharge: 1,
  levelBasis: 'naturalLimit',
  npLevelBasis: { kind: 'specified', npLevel: 1 },
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
  it.each(['commandCard', 'commandCardAttack'] as const)(
    'uses the same %s non-execution proof for unknown siblings and positive contributions',
    (triggerScope) => {
      const inactive = {
        ...effect('inactive', [
          { kind: 'unsupported', route, reason: 'operationSemantics', damageRelevant: true },
        ]),
        triggerScope,
      };
      for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
        const result = compileCandidateLocalActionAdmission(
          [withoutAction, program([positive, inactive])],
          { ...baseline, conditionalEffects },
        );
        expect(result.programs.map(({ key }) => key)).toEqual(['without-action', 'with-action']);
        expect(result.unsupportedAttackProfileKeys.size).toBe(0);
        const noContribution = compileCandidateLocalActionAdmission(
          [withoutAction, program([{ ...positive, triggerScope }, inactive])],
          { ...baseline, conditionalEffects },
        );
        expect(noContribution.programs.map(({ key }) => key)).toEqual(['without-action']);
        expect(noContribution.unsupportedAttackProfileKeys.size).toBe(0);
        expect(
          compileCandidateLocalActionAdmission(
            [withoutAction, program([positive, { ...inactive, triggerScope: null }])],
            { ...baseline, conditionalEffects },
          ).unsupportedAttackProfileKeys.size,
        ).toBe(1);
      }
    },
  );

  it('admits a safe card-qualified action when the selected AttackProfile proves it intrinsic', () => {
    const buster = effect('buster:0', positive.execution, {
      kind: 'card',
      card: attackProfile.cardType,
      present: true,
    });
    const otherCard = effect('other-card:0', positive.execution, {
      kind: 'card',
      card: attackProfile.cardType === 'buster' ? 'arts' : 'buster',
      present: true,
    });

    expect(
      compileCandidateLocalActionAdmission(
        [withoutAction, program([buster])],
        baseline,
      ).programs.map(({ key }) => key),
    ).toEqual(['without-action', 'with-action']);
    expect(
      compileCandidateLocalActionAdmission(
        [withoutAction, program([otherCard])],
        baseline,
      ).programs.map(({ key }) => key),
    ).toEqual(['without-action']);
  });

  it('admits a nested terminal-trait, selected-choice, and operation-trigger action', () => {
    const trait =
      attackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits[0] ?? 'servant';
    const nested = {
      ...effect('nested:0', positive.execution, {
        kind: 'all',
        requirements: [
          { kind: 'card', card: attackProfile.cardType, present: true },
          {
            kind: 'trait',
            scope: 'recipient',
            trait,
            present: true,
            provenance: {
              stateSources: 'activeOnly',
              ignoredStateTraits: 'exclude',
              unremovableStateTraits: 'include',
            },
          },
          { kind: 'choice', family: 'mode', candidate: 'selected' },
          { kind: 'operationTrigger', position: 7 },
        ],
      }),
      selection: {
        kind: 'playerChoice' as const,
        group: { key: 'mode', candidate: 'selected' },
      },
      operationTrigger: { kind: 'functionPosition' as const, position: 7 },
    };

    expect(
      compileCandidateLocalActionAdmission(
        [withoutAction, program([nested])],
        baseline,
      ).programs.map(({ key }) => key),
    ).toEqual(['without-action', 'with-action']);
  });

  it('admits a deterministic baseline contribution without classifying represented adversity', () => {
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
    ).toEqual(['without-action', 'with-action']);

    const adverse = effect('adverse:0', [
      {
        kind: 'damageModifier',
        modifier: 'attackBuff',
        sign: -1,
        card: null,
        route,
        semanticSupport: 'supported',
        values: [[100], [], [], [], []],
        valueExpressions: [[null], [], [], [], []],
      },
      {
        kind: 'stateMutation',
        mutation: 'add',
        recipient: 'sourceSelf',
        polarity: 'detrimental',
      },
    ]);
    expect(
      compileCandidateLocalActionAdmission(
        [withoutAction, program([adverse])],
        baseline,
      ).programs.map(({ key }) => key),
    ).toEqual(['without-action', 'with-action']);
  });

  it('keeps unsupported cost distinct from a policy no-op', () => {
    const unknownCost = effect('unknown-cost:0', [
      ...positive.execution,
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'loss',
        unit: 'fixed',
        recipient: 'sourceSelf',
        amount: { kind: 'dependent', reason: 'matchingTargetCount' },
        subjectId: null,
      },
    ]);
    const result = compileCandidateLocalActionAdmission(
      [withoutAction, program([unknownCost])],
      baseline,
    );
    expect(result.programs.map(({ key }) => key)).toEqual(['without-action']);
    expect(result.unsupportedAttackProfileKeys).toEqual(new Set([attackProfileKey(attackProfile)]));
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

it('joins HP admission to the affected actor instead of admitting an unrelated ally writer', () => {
  for (const recipient of ['sourceSelf', 'partyOther'] as const) {
    const writer = program([
      effect('hp-writer', [
        {
          kind: 'resourceMutation',
          resource: 'hp',
          direction: 'loss',
          unit: 'fixed',
          recipient,
          subjectId: null,
          amount: { kind: 'fixed', values: [[1000], [], [], [], []] },
          lossFloor: 'oneIfAlive',
        },
      ]),
    ]);
    writer.terminalHpReaders = [{ kind: 'attacker' }];
    const admission = compileCandidateLocalActionAdmission([withoutAction, writer], baseline);
    expect(admission.programs.some(({ key }) => key === writer.key)).toBe(
      recipient === 'sourceSelf',
    );
  }
});
