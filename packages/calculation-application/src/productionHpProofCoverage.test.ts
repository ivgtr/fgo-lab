import { expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  masterEffectSchema,
  masterSnapshotSchema,
  getNoblePhantasmVariants,
} from '@fgo-lab/master-data';
import {
  hpProofCoverageInventory,
  reconcileHpProofCoverage,
  type HpProofDeclaration,
  type HpProofCoverageBinding,
} from './productionHpProofCoverage';

const leaf = {
  kind: 'quantity' as const,
  quantity: 'attackerHpPermille' as const,
  comparison: 'atMost' as const,
  value: 500,
};
const declaration: HpProofDeclaration = {
  identity: {
    origin: 'attacker',
    owner: 'actor',
    skill: 'skill',
    variant: null,
    occurrence: 'effect:0',
    path: 'requirement.expression',
    kind: 'condition',
  },
  effect: null,
  operation: null,
  value: leaf,
};
const binding: HpProofCoverageBinding = {
  declaration,
  proofIdentity: 'proof:0',
  family: 'fixedSelf',
  stage: 'actualConditionRead',
  actor: 'attacker',
  sourceInstanceId: 'attacker:actor',
  position: 0,
  sequence: 2,
  operationId: 'reader:0',
  group: 0,
  reference: { permille: 500 },
  disposition: 'read',
};
const reasons = (
  observed: HpProofCoverageBinding[],
  declarations = [declaration],
  expected = [binding],
) => reconcileHpProofCoverage(declarations, expected, observed).gate.failures.map((f) => f.reason);

it('keeps unobserved declarations distinct from a passing correspondence gate and product closure', () => {
  const result = reconcileHpProofCoverage([declaration], [], []);
  expect(result.gate.passed).toBe(true);
  expect(result.rows[0]!.bindings).toEqual([]);
  expect(result.productClosure).toBe(false);
  expect(result.unobserved).toContain('successfulRecoveryCoverage');
});
it('rejects missing, duplicate and unmatched proof bindings', () => {
  expect(reasons([])).toContain('missingBinding');
  expect(reasons([binding, binding])).toContain('duplicateBinding');
  expect(reasons([{ ...binding, proofIdentity: 'foreign' }])).toContain('unmatchedBinding');
  expect(reasons([binding], [declaration, declaration])).toContain('duplicateDeclaration');
  expect(reasons([binding], [declaration], [binding, binding])).toContain('duplicateBinding');
});
it('rejects equal foreign declaration and capture references', () => {
  expect(reasons([{ ...binding, declaration: structuredClone(declaration) }])).toContain(
    'foreignDeclaration',
  );
  expect(reasons([{ ...binding, reference: structuredClone(binding.reference) }])).toContain(
    'foreignReference',
  );
  expect(reasons([binding], [], [binding])).toContain('foreignDeclaration');
});
it('rejects a wrong family, actor, instance, operation, group and read disposition', () => {
  // Invalid family is injected at the external assertion boundary without widening the accepted union.
  const family = { ...binding };
  Reflect.set(family, 'family', 'receive');
  for (const changed of [
    family,
    { ...binding, actor: 'support' },
    { ...binding, sourceInstanceId: 'foreign' },
    { ...binding, operationId: 'other' },
    { ...binding, group: 1 },
    { ...binding, disposition: 'excluded' as const },
  ])
    expect(reasons([changed])).toContain('bindingMismatch');
});
it('preserves proof order and keeps NP exclusion separate from an actual condition read', () => {
  const npDeclaration: HpProofDeclaration = {
    ...declaration,
    identity: { ...declaration.identity, kind: 'hpRatioLow', path: 'damage.0' },
  };
  const excluded: HpProofCoverageBinding = {
    ...binding,
    declaration: npDeclaration,
    stage: 'npEvaluation',
    position: 1,
    disposition: 'excluded',
  };
  expect(reasons([excluded, binding], [declaration, npDeclaration], [binding, excluded])).toContain(
    'orderMismatch',
  );
  const result = reconcileHpProofCoverage(
    [declaration, npDeclaration],
    [binding, excluded],
    [binding, excluded],
  );
  expect(result.gate.passed).toBe(true);
  expect(result.bindings.map((b) => b.disposition)).toEqual(['read', 'excluded']);
  expect(
    reasons([{ ...excluded, declaration }], [declaration], [{ ...excluded, declaration }]),
  ).toContain('bindingMismatch');
});

it('inventories nested reader-only effects, HP-conditioned gauge updates and full NP variant identity', () => {
  const master = masterSnapshotSchema.parse(fixture);
  const effect = masterEffectSchema.parse({
    id: 'reader',
    occurrenceId: 'reader:0',
    label: 'reader',
    execution: [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[100], [], [], [], []] },
      },
    ],
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
    requirement: {
      recipient: 'sourceSelf',
      expression: { kind: 'all', requirements: [leaf, { kind: 'not', requirement: { ...leaf } }] },
    },
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
  });
  const actor = master.servants[0]!;
  const variants = getNoblePhantasmVariants(actor);
  const attack = variants.find((variant) => variant.kind === 'attack')!;
  const damage = {
    ...attack.damage[0]!,
    kind: 'hpRatioLow' as const,
    rawFunctionType: 'damageNpHpratioLow' as const,
  };
  const input = {
    ...master,
    servants: [
      {
        ...actor,
        skills: [
          {
            id: 'reader-skill',
            slot: 1 as const,
            priority: 1,
            name: 'reader',
            detail: '',
            imageKey: null,
            resourceRequirement: null,
            effects: [effect],
          },
        ],
        noblePhantasmVariantGroups: actor.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) =>
            variant.kind === 'attack' ? { ...variant, damage: [damage] } : variant,
          ),
        })),
      },
    ],
    craftEssences: [],
    mysticCodes: [],
  };
  const declarations = hpProofCoverageInventory(input);
  expect(declarations.filter((d) => d.identity.kind === 'writer')).toEqual([]);
  expect(
    declarations.filter((d) => d.identity.kind === 'condition').map((d) => d.identity.path),
  ).toEqual([
    'requirement.expression.requirements.0',
    'requirement.expression.requirements.1.requirement',
  ]);
  expect(declarations.filter((d) => d.identity.kind === 'hpConditionedNpGauge')).toHaveLength(2);
  const nps = declarations.filter((d) => d.identity.kind === 'hpRatioLow');
  expect(nps).not.toHaveLength(0);
  expect(nps[0]!.value).toBe(damage);
  expect(nps[0]!.identity.variant).toEqual({ canonicalId: attack.canonicalId, ref: attack.ref });
  const route = {
    target: 'sourceSelf',
    contributionScope: 'personal',
    eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
  };
  const expression = { kind: 'inverseHpLinear', basePermille: 100, bonusAtZeroHpPermille: 200 };
  const expanded = masterEffectSchema.parse({
    ...effect,
    execution: [
      {
        kind: 'damageModifier',
        modifier: 'attackBuff',
        sign: 1,
        card: null,
        route,
        values: [[100], [], [], [], []],
        valueExpressions: [[expression], [], [], [], []],
        limitBreakValueExpressions: [[{ ...expression }], [], [], [], []],
        semanticSupport: 'supported',
      },
      {
        kind: 'hpModifier',
        action: 'receive',
        sign: 1,
        route,
        bounds: { minimum: null, maximum: null },
        traits: [],
        values: [[100], [], [], [], []],
        lifetime: 'active',
        useCondition: leaf,
      },
      {
        kind: 'ocRemovalResistance',
        route,
        cells: [
          [
            {
              applicationRatePermille: 1000,
              turns: { kind: 'unlimited' },
              uses: { kind: 'unlimited' },
              amount: expression,
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
  const extended = hpProofCoverageInventory({
    ...input,
    craftEssences: [{ ...master.craftEssences[0]!, effects: [expanded] }],
  });
  const expressions = extended.filter((d) => d.identity.kind === 'valueExpression');
  expect(expressions.map((d) => d.identity.path)).toEqual([
    'execution.0.valueExpressions.0.0',
    'execution.0.limitBreakValueExpressions.0.0',
  ]);
  expect(extended.filter((d) => d.identity.kind === 'modifierUseCondition')).toHaveLength(1);
  expect(extended.filter((d) => d.identity.kind === 'ocRateExpression')).toHaveLength(1);
  expect(expressions.every((d) => d.identity.origin === 'craftEssence')).toBe(true);
});
