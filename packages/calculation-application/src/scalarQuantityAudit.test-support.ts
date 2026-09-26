import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { ScalarQuantityBoundary } from './productionScalarQuantityAudit';

export type Spec = {
  name: string;
  initial: number;
  amounts: number[];
  final: number;
  consumed: number;
  sameGroup?: boolean;
  maximum?: number;
  boundary?: ScalarQuantityBoundary;
  timing?: 'representedByCurrentInput';
  wrongSubject?: boolean;
  wrongTarget?: boolean;
  standard?: boolean;
};
export function fixtureMaster(spec: Spec) {
  const base = masterSnapshotSchema.parse(fixture);
  const servant = base.servants[0]!;
  const id = '810000';
  const domainId = spec.wrongTarget ? '810001' : id;
  const domain = {
    id: domainId,
    phaseScale: 'point' as const,
    phases: Array.from({ length: 11 }, (_, phase) => ({ phase, threshold: phase })),
    eligibility: [{ kind: 'traits' as const, all: [servant.traits[0]!] }],
    capacity: { default: 10, maximum: 10, traitOverrides: [] },
  };
  const template = {
    availability: 'allLimitBreakStates' as const,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
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
  const execution = spec.amounts.map((amount) => ({
    kind: 'contextMutation' as const,
    mutation: 'addQuantity' as const,
    quantity: 'battlePointPhase' as const,
    subjectId: spec.wrongSubject ? '810002' : id,
    amount,
    applicationTiming: spec.timing ?? ('duringExecution' as const),
    damageRelevant: true,
  }));
  const effects = (spec.sameGroup ? [execution] : execution.map((operation) => [operation])).map(
    (operations, index) => ({
      ...template,
      id: `scalar-write-${index}`,
      occurrenceId: `scalar-write-${index}:0`,
      label: 'scalar fixture',
      gameActivation: 'skillUse' as const,
      inclusionPolicy: { default: 'include' as const },
      proc: { kind: 'guaranteed' as const },
      selection: null,
      inputDefinitions: [],
      requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
      execution: operations,
    }),
  );
  const skillId = 'scalar-fixture-skill';
  const skills = (spec.sameGroup ? [effects] : effects.map((effect) => [effect])).map(
    (members, index) => ({
      id: `${skillId}-${index}`,
      slot: index + 1,
      priority: 1,
      name: 'scalar fixture',
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: members,
    }),
  );
  const groups = servant.noblePhantasmVariantGroups.map((group) => ({
    ...group,
    variants: group.variants.map((variant) => {
      if (variant.kind !== 'attack') return variant;
      return {
        ...variant,
        effects: [],
        damage: variant.damage.map((damage) =>
          spec.standard
            ? damage
            : {
                ...damage,
                kind: 'battlePointPhase' as const,
                rawFunctionType: 'damageNpBattlePointPhase' as const,
                maximumBattlePointPhase: spec.maximum ?? 10,
                parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                  row.map((cell) => ({
                    ...cell,
                    targetId: Number(domainId),
                    secondaryValuePermille: 1000,
                    correctionPermille: 100,
                  })),
                ),
              },
        ),
      };
    }),
  }));
  return masterSnapshotSchema.parse({
    ...base,
    battlePointDomains: spec.boundary === 'nullScalar' ? [] : [domain],
    servants: [
      {
        ...servant,
        id,
        passives: [],
        battlePointDomains: spec.boundary === 'nullScalar' ? [] : [domain],
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map((skill) => skill.id),
            passiveIds: [],
          })),
        },
        noblePhantasmVariantGroups: groups,
        skills,
      },
    ],
  });
}
