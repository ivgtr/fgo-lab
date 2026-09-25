import fixture from '../../test-fixtures/master/fixture.json';
import {
  masterSnapshotSchema,
  stackInputSchema,
  type StackInputDefinition,
} from '@fgo-lab/master-data';
export const source: StackInputDefinition = stackInputSchema.parse({
  kind: 'effectStackCount',
  key: 'stack:attackerState:fixture-stack',
  owner: 'attacker',
  label: '試験状態の付与数',
  description: '準備開始時の仮定',
  minimum: 0,
  maximum: 4,
  step: 1,
  defaultValue: 0,
  defaultReason: '外部付与なし',
  quantitySource: { scope: 'attackerState', trait: 'fixture-stack' },
});
export function createStackMaster(
  stackInput: StackInputDefinition = source,
  correctionPermille = 250,
  stateTraitNames: readonly string[] = [],
) {
  const original = masterSnapshotSchema.parse(fixture);
  const servant = original.servants[0]!;
  return masterSnapshotSchema.parse({
    ...original,
    servants: [
      {
        ...servant,
        skills: [],
        passives: [],
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) =>
            variant.kind !== 'attack'
              ? variant
              : {
                  ...variant,
                  effects: [],
                  damage: [
                    {
                      ...variant.damage[0],
                      kind: 'traitCount',
                      rawFunctionType: 'damageNpIndividualSum',
                      quantity: { kind: 'stacks', inputs: [stackInput] },
                      stateTraitNames,
                      parametersByOvercharge: Array.from({ length: 5 }, () =>
                        Array.from({ length: 5 }, () => ({
                          ratePermille: 1000,
                          valuePermille: 3000,
                          secondaryValuePermille: 1000,
                          correctionPermille,
                          targetId: 0,
                          targetIds: [1],
                          targetTraits: [{ kind: 'trait', name: 'fixture-stack' }],
                          maximumTargetCount: stackInput.maximum,
                        })),
                      ),
                    },
                  ],
                },
          ),
        })),
      },
    ],
  });
}
export const master = createStackMaster();
export const servant = master.servants[0]!;

export const stackEffectTemplate = {
  label: '状態解除',
  availability: 'allLimitBreakStates',
  inclusionPolicy: { default: 'include' },
  interaction: null,
  triggerScope: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  atlasEvidence: {
    functionType: 'subState',
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
