import {
  getNoblePhantasmVariants,
  noblePhantasmVariantKey,
  type CanonicalEffectRequirement,
  type MasterDataSnapshot,
  type MasterEffect,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import { isHpOperation, type ConditionExpression } from '@fgo-lab/battle-execution';
import {
  isFixedSelfHpWriter,
  type HpPreparationProgram,
  type auditHpPreparation,
} from './productionHpPreparationAudit';

type Operation = MasterEffect['execution'][number];
type Origin = 'attacker' | 'passive' | 'np' | 'craftEssence' | 'mysticCode';
export const HP_PROOF_DECLARATION_KINDS = [
  'writer',
  'condition',
  'modifierUseCondition',
  'valueExpression',
  'ocRateExpression',
  'hpConditionedNpGauge',
  'hpRatioLow',
] as const;
export type HpProofDeclarationKind = (typeof HP_PROOF_DECLARATION_KINDS)[number];
export interface HpProofDeclaration {
  identity: {
    origin: Origin;
    owner: string;
    skill: string;
    variant: Pick<NoblePhantasmVariant, 'canonicalId' | 'ref'> | null;
    occurrence: string | null;
    path: string;
    kind: HpProofDeclarationKind;
  };
  effect: MasterEffect | null;
  operation: Operation | null;
  value: object;
}

/** The same source leaf paths define the inventory and native audit correspondence. */
export function hpRequirementLeaves(
  requirement: CanonicalEffectRequirement,
  path: string,
): { path: string; value: CanonicalEffectRequirement }[] {
  if (requirement.kind === 'all' || requirement.kind === 'any')
    return requirement.requirements.flatMap((child, index) =>
      hpRequirementLeaves(child, `${path}.requirements.${index}`),
    );
  if (requirement.kind === 'not')
    return hpRequirementLeaves(requirement.requirement, `${path}.requirement`);
  return requirement.kind === 'quantity' && requirement.quantity === 'attackerHpPermille'
    ? [{ path, value: requirement }]
    : [];
}

/** Correlate preserved HP condition leaves by original path and compiled object identity. */
export function pairedHpRequirementLeaves(
  original: CanonicalEffectRequirement,
  compiled: ConditionExpression,
  path: string,
):
  | {
      path: string;
      original: CanonicalEffectRequirement;
      compiled: Extract<ConditionExpression, { kind: 'quantity' }>;
    }[]
  | null {
  if (original.kind === 'all' || original.kind === 'any') {
    if (
      compiled.kind !== original.kind ||
      compiled.expressions.length !== original.requirements.length
    )
      return null;
    const children = original.requirements.map((child, index) =>
      pairedHpRequirementLeaves(
        child,
        compiled.expressions[index]!,
        `${path}.requirements.${index}`,
      ),
    );
    return children.some((child) => child === null) ? null : children.flatMap((child) => child!);
  }
  if (original.kind === 'not')
    return compiled.kind === 'not'
      ? pairedHpRequirementLeaves(original.requirement, compiled.expression, `${path}.requirement`)
      : null;
  if (original.kind !== 'quantity' || original.quantity !== 'attackerHpPermille') return [];
  return compiled.kind === 'quantity' &&
    compiled.quantity === 'attackerHpPermille' &&
    compiled.comparison === original.comparison &&
    compiled.value === original.value
    ? [{ path, original, compiled }]
    : null;
}

/** Declaration inventory only. No expected HP values, requests or native outcomes are generated. */
export function hpProofCoverageInventory(master: MasterDataSnapshot): HpProofDeclaration[] {
  const declarations: HpProofDeclaration[] = [];
  const addEffect = (
    origin: Origin,
    owner: string,
    skill: string,
    effect: MasterEffect,
    variant: NoblePhantasmVariant | null,
  ) => {
    const add = (
      kind: HpProofDeclarationKind,
      path: string,
      value: object,
      operation: Operation | null,
    ) =>
      declarations.push({
        identity: {
          origin,
          owner,
          skill,
          variant: variant ? { canonicalId: variant.canonicalId, ref: variant.ref } : null,
          occurrence: effect.occurrenceId,
          path,
          kind,
        },
        effect,
        operation,
        value,
      });
    const conditions = hpRequirementLeaves(effect.requirement.expression, 'requirement.expression');
    for (const leaf of conditions) add('condition', leaf.path, leaf.value, null);
    effect.execution.forEach((operation, index) => {
      const path = `execution.${index}`;
      if (isHpOperation(operation)) add('writer', path, operation, operation);
      if (operation.kind === 'hpModifier' && operation.useCondition)
        for (const leaf of hpRequirementLeaves(operation.useCondition, `${path}.useCondition`))
          add('modifierUseCondition', leaf.path, leaf.value, operation);
      if (operation.kind === 'resourceMutation' && operation.resource === 'npGauge')
        for (const leaf of conditions)
          add('hpConditionedNpGauge', `${path}:${leaf.path}`, leaf.value, operation);
      if (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange')
        for (const [field, sets] of [
          ['valueExpressions', operation.valueExpressions],
          ['limitBreakValueExpressions', operation.limitBreakValueExpressions],
        ] as const)
          sets?.forEach((row, setIndex) =>
            row.forEach((value, valueIndex) => {
              if (value?.kind === 'inverseHpLinear' || value?.kind === 'hpRangeLinear')
                add(
                  'valueExpression',
                  `${path}.${field}.${setIndex}.${valueIndex}`,
                  value,
                  operation,
                );
            }),
          );
      if (operation.kind === 'grantOcApplicationRate' || operation.kind === 'ocRemovalResistance')
        for (const [field, sets] of [
          ['cells', operation.cells],
          ['limitBreakCells', operation.limitBreakCells],
        ] as const)
          sets?.forEach((row, setIndex) =>
            row.forEach((cell, valueIndex) => {
              if (cell.amount.kind === 'inverseHpLinear' || cell.amount.kind === 'hpRangeLinear')
                add(
                  'ocRateExpression',
                  `${path}.${field}.${setIndex}.${valueIndex}.amount`,
                  cell.amount,
                  operation,
                );
            }),
          );
    });
  };
  for (const actor of master.servants) {
    for (const skill of actor.skills)
      for (const effect of skill.effects) addEffect('attacker', actor.id, skill.id, effect, null);
    for (const skill of actor.passives)
      for (const effect of skill.effects) addEffect('passive', actor.id, skill.id, effect, null);
    for (const variant of getNoblePhantasmVariants(actor)) {
      for (const effect of variant.effects)
        addEffect('np', actor.id, variant.ref.noblePhantasmId, effect, variant);
      if (variant.kind === 'attack')
        variant.damage.forEach((damage, index) => {
          if (damage.kind === 'hpRatioLow')
            declarations.push({
              identity: {
                origin: 'np',
                owner: actor.id,
                skill: variant.ref.noblePhantasmId,
                variant: { canonicalId: variant.canonicalId, ref: variant.ref },
                occurrence: null,
                path: `damage.${index}`,
                kind: 'hpRatioLow',
              },
              effect: null,
              operation: null,
              value: damage,
            });
        });
    }
  }
  for (const ce of master.craftEssences)
    for (const effect of ce.effects) addEffect('craftEssence', ce.id, ce.id, effect, null);
  for (const code of master.mysticCodes)
    for (const skill of code.skills)
      for (const effect of skill.effects) addEffect('mysticCode', code.id, skill.id, effect, null);
  return declarations;
}

export interface HpProofCoverageBinding {
  declaration: HpProofDeclaration;
  proofIdentity: string;
  family: 'fixedSelf';
  stage: 'selectedWriter' | 'actualConditionRead' | 'npEvaluation';
  actor: string;
  sourceInstanceId: string;
  position: number;
  sequence: number | null;
  operationId: string | null;
  group: number | null;
  /** Original owner/capture object; equal foreign values cannot replace this reference. */
  reference: object;
  disposition: 'selected' | 'read' | 'consumed' | 'excluded' | 'missing' | 'invalid';
}
export type HpProofCoverageReason =
  | 'duplicateDeclaration'
  | 'missingBinding'
  | 'duplicateBinding'
  | 'unmatchedBinding'
  | 'foreignDeclaration'
  | 'foreignReference'
  | 'bindingMismatch'
  | 'orderMismatch';
const key = (binding: HpProofCoverageBinding) =>
  JSON.stringify([
    binding.declaration.identity,
    binding.proofIdentity,
    binding.stage,
    binding.position,
  ]);
const isFixedSelfFamily = (family: unknown) => family === 'fixedSelf';

/** Correspondence gate, deliberately separate from product coverage and the original proof gate. */
export function reconcileHpProofCoverage(
  declarations: readonly HpProofDeclaration[],
  expected: readonly HpProofCoverageBinding[],
  observed: readonly HpProofCoverageBinding[],
) {
  const failures: { reason: HpProofCoverageReason; path: string }[] = [];
  const fail = (reason: HpProofCoverageReason, path: string) => failures.push({ reason, path });
  const declared = new Set<string>();
  for (const [index, declaration] of declarations.entries()) {
    const identity = JSON.stringify(declaration.identity);
    if (declared.has(identity)) fail('duplicateDeclaration', `declarations.${index}`);
    declared.add(identity);
  }
  const expectedByKey = new Map<string, { binding: HpProofCoverageBinding; index: number }>();
  for (const [index, binding] of expected.entries()) {
    if (!declarations.includes(binding.declaration))
      fail('foreignDeclaration', `expected.${index}`);
    if (expectedByKey.has(key(binding))) fail('duplicateBinding', `expected.${index}`);
    const kind = binding.declaration.identity.kind;
    if (
      !isFixedSelfFamily(binding.family) ||
      (binding.stage === 'selectedWriter' &&
        (kind !== 'writer' || binding.disposition !== 'selected')) ||
      (binding.stage === 'actualConditionRead' &&
        (kind !== 'condition' || binding.disposition !== 'read')) ||
      (binding.stage === 'npEvaluation' &&
        (kind !== 'hpRatioLow' ||
          binding.disposition === 'read' ||
          binding.disposition === 'selected'))
    )
      fail('bindingMismatch', `expected.${index}`);
    expectedByKey.set(key(binding), { binding, index });
  }
  const seen = new Set<string>();
  observed.forEach((binding, index) => {
    const identity = key(binding),
      original = expectedByKey.get(identity);
    if (seen.has(identity)) fail('duplicateBinding', `observed.${index}`);
    seen.add(identity);
    if (!declarations.includes(binding.declaration))
      fail('foreignDeclaration', `observed.${index}`);
    if (!original) {
      fail('unmatchedBinding', `observed.${index}`);
      return;
    }
    if (original.index !== index) fail('orderMismatch', `observed.${index}`);
    if (binding.reference !== original.binding.reference)
      fail('foreignReference', `observed.${index}`);
    if (
      binding.declaration !== original.binding.declaration ||
      !isFixedSelfFamily(binding.family) ||
      binding.actor !== original.binding.actor ||
      binding.sourceInstanceId !== original.binding.sourceInstanceId ||
      binding.operationId !== original.binding.operationId ||
      binding.sequence !== original.binding.sequence ||
      binding.group !== original.binding.group ||
      binding.disposition !== original.binding.disposition
    )
      fail('bindingMismatch', `observed.${index}`);
  });
  for (const [identity, { index }] of expectedByKey)
    if (!seen.has(identity)) fail('missingBinding', `expected.${index}`);
  return {
    rows: declarations.map((declaration) => ({
      identity: declaration.identity,
      bindings: observed.flatMap((binding, index) =>
        binding.declaration === declaration ? [index] : [],
      ),
      qualification:
        'Bindings certify correspondence within the original proof scope only; absence is unobserved, not zero or product exclusion.',
    })),
    bindings: observed.map(({ declaration, reference: _reference, ...binding }) => ({
      ...binding,
      declaration: declaration.identity,
    })),
    unobserved: [
      'availableActionInventory',
      'wholeNativeNoncommitCoverage',
      'successfulRecoveryCoverage',
      'valueExpressionActualReadCoverage',
    ] as const,
    productClosure: false as const,
    gate: { passed: failures.length === 0, failures, firstDifference: failures[0] ?? null },
  };
}

/** Borrow one already-evaluated fixedSelf proof. Never broadens its selector or reruns its owner. */
export function fixedSelfHpProofCoverage(
  declarations: readonly HpProofDeclaration[],
  program: HpPreparationProgram,
  gate: ReturnType<typeof auditHpPreparation>,
) {
  const { selection, references } = program;
  const failures: {
    reason: 'ownerGateFailed' | 'outsideProofScope' | 'unmatchedDeclaration';
    path: string;
  }[] = [];
  if (gate.status !== 'passed' || !gate.expected.includes(selection.identity))
    failures.push({ reason: 'ownerGateFailed', path: 'owner.gate' });
  if (
    selection.canonical.scopeBoundaries.length ||
    selection.canonical.writers.some((writer) => !isFixedSelfHpWriter(writer.operation)) ||
    gate.boundaries.some(
      (boundary) =>
        boundary.identity === selection.identity && boundary.reason.startsWith('outside'),
    )
  )
    failures.push({ reason: 'outsideProofScope', path: 'owner.scope' });
  const bindings: HpProofCoverageBinding[] = [];
  const bind = (
    matches: HpProofDeclaration[],
    binding: Omit<HpProofCoverageBinding, 'declaration' | 'family' | 'proofIdentity'>,
  ) => {
    if (matches.length !== 1) {
      failures.push({
        reason: 'unmatchedDeclaration',
        path: `${binding.stage}.${binding.position}`,
      });
      return;
    }
    bindings.push({
      ...binding,
      declaration: matches[0]!,
      family: 'fixedSelf',
      proofIdentity: selection.identity,
    });
  };
  selection.canonical.writers.forEach((writer, position) =>
    bind(
      declarations.filter(
        (d) =>
          d.identity.kind === 'writer' &&
          d.identity.origin === writer.origin &&
          d.identity.owner === writer.sourceId &&
          d.identity.skill === writer.skillId &&
          d.identity.path === `execution.${writer.operationIndex}` &&
          d.effect === writer.effect &&
          d.operation === writer.operation,
      ),
      {
        stage: 'selectedWriter',
        actor: writer.actor,
        sourceInstanceId: writer.sourceInstanceId,
        position,
        sequence: null,
        operationId: writer.actionId,
        group: null,
        reference: writer,
        disposition: 'selected',
      },
    ),
  );
  for (const [position, read] of (references.candidate?.reads ?? []).entries()) {
    const canonical = selection.canonical.readers.find(
      (r) =>
        r.operationId === read.operationId &&
        r.sequence === read.operationSequence &&
        r.leaf === read.leaf,
    );
    if (!canonical) {
      failures.push({ reason: 'unmatchedDeclaration', path: `actualConditionRead.${position}` });
      continue;
    }
    const sourceDeclarations = declarations.filter(
      (d) =>
        d.identity.kind === 'condition' &&
        d.identity.owner === canonical.source.sourceId &&
        d.identity.origin === canonical.source.origin &&
        d.identity.occurrence === canonical.source.effectOccurrenceId &&
        d.effect?.id === canonical.source.effectId &&
        (d.identity.origin !== 'np' ||
          JSON.stringify(d.identity.variant?.ref) ===
            JSON.stringify(selection.prepared.resolved.noblePhantasmVariant?.ref)),
    );
    const sourceEffect = sourceDeclarations[0]?.effect;
    const operation = selection.prepared.orderedScenario?.operations[read.operationSequence];
    let compiledCondition = operation?.condition;
    if (canonical.source.origin === 'np' && compiledCondition) {
      const wrapper = compiledCondition;
      compiledCondition =
        wrapper.kind === 'all' &&
        wrapper.expressions.length === 2 &&
        wrapper.expressions[1]?.kind === 'noblePhantasmVariant' &&
        selection.prepared.resolved.noblePhantasmVariant &&
        noblePhantasmVariantKey(wrapper.expressions[1].variant) ===
          noblePhantasmVariantKey(selection.prepared.resolved.noblePhantasmVariant.ref)
          ? wrapper.expressions[0]
          : undefined;
    }
    const paired =
      sourceEffect &&
      compiledCondition &&
      sourceDeclarations.every((declaration) => declaration.effect === sourceEffect)
        ? pairedHpRequirementLeaves(
            sourceEffect.requirement.expression,
            compiledCondition,
            'requirement.expression',
          )?.find((entry) => entry.compiled === read.leaf)
        : undefined;
    const natural = selection.canonical.naturalReaders.some(
      (r) => r.occurrenceId === canonical.source.effectOccurrenceId && r.leaf === paired?.original,
    );
    bind(
      sourceDeclarations.filter(
        (d) =>
          paired &&
          natural &&
          d.identity.path === paired.path &&
          d.value === paired.original &&
          read.comparison === read.leaf.comparison &&
          read.expectedValue === read.leaf.value,
      ),
      {
        stage: 'actualConditionRead',
        actor: read.actor,
        sourceInstanceId: canonical.source.sourceInstanceId,
        position,
        sequence: read.operationSequence,
        operationId: read.operationId,
        group: read.operationGroupIndex,
        reference: read,
        disposition: 'read',
      },
    );
  }
  for (const [position, np] of (references.candidate?.nps ?? []).entries()) {
    const canonical = selection.canonical.nps.find(
      (n) => n.operation.operationId === np.operationId && n.sequence === np.operationSequence,
    );
    if (!canonical) {
      failures.push({ reason: 'unmatchedDeclaration', path: `npEvaluation.${position}` });
      continue;
    }
    bind(
      declarations.filter(
        (d) =>
          d.identity.kind === 'hpRatioLow' &&
          d.value === canonical.operation.damage &&
          d.identity.owner === selection.canonical.servantId &&
          JSON.stringify(d.identity.variant?.ref) ===
            JSON.stringify(selection.prepared.resolved.noblePhantasmVariant?.ref),
      ),
      {
        stage: 'npEvaluation',
        actor: 'attacker',
        sourceInstanceId: canonical.operation.source.sourceInstanceId,
        position,
        sequence: np.operationSequence,
        operationId: np.operationId,
        group: np.operationGroupIndex,
        reference: np,
        disposition: np.disposition,
      },
    );
  }
  const correspondence = reconcileHpProofCoverage(declarations, bindings, bindings);
  return {
    ownerGate: gate,
    correspondence,
    failures,
    passed: failures.length === 0 && correspondence.gate.passed,
    qualification:
      'Existing fixedSelf forward proof only. Native noncommit and successful recovery are not supplied by this connection.',
  };
}
