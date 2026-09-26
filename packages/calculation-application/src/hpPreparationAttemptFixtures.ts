import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
const base = masterSnapshotSchema.parse(fixture);
type Spec = {
  name: string;
  initial: number;
  writes: number[][];
  final: number;
  failure?: 'unsupported' | 'inputRequired' | 'invalid' | 'before' | 'none';
  separateFailure?: boolean;
  reset?: boolean;
  outside?: boolean;
  floor?: 'zero' | 'oneIfAlive';
  choice?: boolean;
  omitted?: boolean;
  noReader?: boolean;
  noNp?: boolean;
  disabled?: boolean;
};
const effect = {
  label: 'HP preparation fixture',
  availability: 'allLimitBreakStates',
  inclusionPolicy: { default: 'include' },
  gameActivation: 'skillUse',
  triggerScope: null,
  interaction: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  proc: { kind: 'guaranteed' },
  selection: null,
  inputDefinitions: [],
  requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
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
const modifier = {
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
  values: [Array.from({ length: 10 }, () => 100), [], [], [], []],
  valueExpressions: [Array.from({ length: 10 }, () => null), [], [], [], []],
  semanticSupport: 'supported',
};
function fixtureMaster(spec: Spec): MasterDataSnapshot {
  const servant = base.servants[0]!;
  const skills = spec.writes.map((writes, index) => ({
    id: `hp-skill-${index}`,
    slot: index + 1,
    priority: 1,
    name: 'HP fixture',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects: [
      {
        ...effect,
        ...(spec.disabled
          ? {
              requirement: {
                recipient: 'sourceSelf',
                expression: {
                  kind: 'quantity',
                  quantity: 'attackerHpPermille',
                  comparison: 'atMost',
                  value: 0,
                },
              },
            }
          : {}),
        id: `hp-write-${index}`,
        occurrenceId: `hp-write-${index}:0`,
        ...(spec.choice
          ? {
              selection: {
                kind: 'playerChoice',
                group: { key: 'hp-choice', candidate: 'selected' },
              },
            }
          : {}),
        execution: writes.flatMap((amount) => {
          const operations = [
            {
              kind: 'resourceMutation',
              resource: 'hp',
              direction: amount >= 0 ? 'gain' : 'loss',
              unit: 'fixed',
              recipient: 'sourceSelf',
              selection: 'direct',
              subjectId: null,
              ...(amount < 0 ? { lossFloor: spec.floor ?? 'zero' } : {}),
              amount: {
                kind: 'fixed',
                values: [
                  Array.from({ length: 10 }, (_, i) => Math.max(0, Math.abs(amount) + i - 3)),
                  [],
                  [],
                  [],
                  [],
                ],
              },
            },
          ];
          return operations.map((operation) =>
            spec.omitted && operation.kind === 'resourceMutation'
              ? Object.fromEntries(Object.entries(operation).filter(([key]) => key !== 'selection'))
              : operation,
          );
        }),
      },
    ],
  }));
  if (spec.choice)
    for (const skill of skills)
      skill.effects.push({
        ...skill.effects[0]!,
        id: 'hp-unselected',
        occurrenceId: 'hp-unselected:0',
        selection: { kind: 'playerChoice', group: { key: 'hp-choice', candidate: 'other' } },
        execution: [
          {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            selection: 'direct',
            subjectId: null,
            amount: {
              kind: 'fixed',
              values: [Array.from({ length: 10 }, () => 9999), [], [], [], []],
            },
          },
        ],
      });
  if (spec.outside) Reflect.set(skills.at(-1)!.effects[0]!.execution.at(-1)!, 'unit', 'percent');
  if (spec.reset)
    skills.at(-1)!.effects[0]!.execution.push({
      kind: 'grantOcBoost',
      route: modifier.route,
      lifetime: 'active',
      stacking: 'additive',
      stateTraits: ['positive'],
      cells: Array.from({ length: 5 }, () =>
        Array.from({ length: 10 }, () => ({
          stages: 1,
          applicationRatePermille: 500,
          turns: { kind: 'unlimited' },
          uses: { kind: 'finite', remaining: 1 },
        })),
      ),
    } as unknown as (typeof skills)[number]['effects'][number]['execution'][number]);
  if (spec.failure !== 'none') {
    const failure =
      spec.failure === 'invalid'
        ? {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'loss',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            lossFloor: 'zero',
            amount: {
              kind: 'fixed',
              values: [Array.from({ length: 10 }, () => -1), [], [], [], []],
            },
          }
        : spec.failure === 'inputRequired'
          ? {
              kind: 'grantOcBoost',
              route: modifier.route,
              lifetime: 'active',
              stacking: 'additive',
              stateTraits: ['positive'],
              cells: Array.from({ length: 5 }, () =>
                Array.from({ length: 10 }, () => ({
                  stages: 1,
                  applicationRatePermille: 500,
                  turns: { kind: 'unlimited' },
                  uses: { kind: 'finite', remaining: 1 },
                })),
              ),
            }
          : {
              kind: 'unsupported',
              route: modifier.route,
              reason: 'ocExecutionSemantics',
              damageRelevant: true,
            };
    const selected = skills.at(-1)!.effects[0]!;
    if (spec.separateFailure)
      skills.at(-1)!.effects.push({
        ...selected,
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
        id: 'hp-refusal',
        occurrenceId: 'hp-refusal:0',
        execution: [failure],
      } as typeof selected);
    else if (spec.failure === 'before')
      selected.execution.unshift(failure as (typeof selected.execution)[number]);
    else selected.execution.push(failure as (typeof selected.execution)[number]);
  }
  return masterSnapshotSchema.parse({
    ...base,
    servants: [
      {
        ...servant,
        hpByLevel: { ...servant.hpByLevel, 90: 9010 },
        skills,
        passives: [],
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
            passiveIds: [],
          })),
        },
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) =>
            variant.kind !== 'attack'
              ? variant
              : {
                  ...variant,
                  effects: spec.noReader
                    ? []
                    : [
                        {
                          ...effect,
                          id: 'hp-reader',
                          occurrenceId: 'hp-reader:0',
                          gameActivation: 'npBeforeDamage',
                          timing: 'beforeDamage',
                          requirement: {
                            recipient: 'sourceSelf',
                            expression: {
                              kind: 'quantity',
                              quantity: 'attackerHpPermille',
                              comparison: 'atMost',
                              value: 500,
                            },
                          },
                          execution: [modifier],
                        },
                      ],
                  damage: variant.damage.map((damage) => ({
                    ...damage,
                    kind: spec.noNp ? 'standard' : 'hpRatioLow',
                    rawFunctionType: spec.noNp ? 'damageNp' : 'damageNpHpratioLow',
                    parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                      row.map((cell) => ({ ...cell, targetId: 9000 })),
                    ),
                  })),
                },
          ),
        })),
      },
    ],
  });
}

export { fixtureMaster };
export type { Spec };
