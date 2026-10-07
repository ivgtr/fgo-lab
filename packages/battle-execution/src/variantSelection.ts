import { readOperationCondition } from './condition';
import { conditionWriteProof, procIsGuaranteed } from './conditionRead';
import {
  actorFormEquals,
  noblePhantasmVariantKey,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import type { BattleOperation, ExecutableBattleState, ExecutionIssue } from './contracts';
import type { EffectDecision } from './contracts';
import { activationRequirementsSatisfied } from './condition';
import type { OperationActivation } from './candidateSelection';
import type { PreparedOrderedScenario } from './executionTypes';
import { validateActorFormWorldFacts } from './formConstraintValidation';
import {
  applyActorFormTransition,
  applyInitialTraitSuppression,
  applyNoblePhantasmVariantSelection,
  applyTraitAddition,
  applyTraitRemoval,
} from './state';

type SelectionOperation = Extract<BattleOperation, { kind: 'selectNoblePhantasmVariant' }>;

export interface ActiveVariantTransactions {
  finalSelection: SelectionOperation | undefined;
  preappliedOperationIds: ReadonlySet<string>;
  supersededTransactionKeys: ReadonlySet<string>;
}

const constraintValidatedOperationKinds = new Set<BattleOperation['kind']>([
  'addTrait',
  'removeTrait',
  'suppressInitialTrait',
  'selectNoblePhantasmVariant',
  'transformActorForm',
]);

export function needsMutationValidation(operation: BattleOperation): boolean {
  return constraintValidatedOperationKinds.has(operation.kind);
}

function transactionKey(operation: BattleOperation): string {
  return (
    operation.source.transactionGroupId ??
    `${operation.source.skillId}:${operation.source.effectOccurrenceId}`
  );
}

export function resolveActiveVariantTransactions(
  operations: readonly BattleOperation[],
  activations: ReadonlyMap<string, OperationActivation>,
  decisions: ReadonlyMap<string, EffectDecision>,
  state: ExecutableBattleState,
): ActiveVariantTransactions {
  const selections = operations.filter((operation): operation is SelectionOperation => {
    if (operation.kind !== 'selectNoblePhantasmVariant') return false;
    if (activations.get(operation.operationId)?.enabled !== true) return false;
    if (operation.decisionPlan.condition !== 'userMayAssume') return true;
    const evaluated = readOperationCondition(operation, state).truth;
    if (evaluated === true) return true;
    const decision = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
    return (
      evaluated === null &&
      decision?.conditionSatisfaction === 'assumeSatisfied' &&
      activationRequirementsSatisfied(operation.condition, state)
    );
  });
  const finalSelection = selections.at(-1);
  const finalTransactionKey = finalSelection ? transactionKey(finalSelection) : null;
  const preappliedOperationIds = new Set(
    finalTransactionKey
      ? operations
          .filter((operation) => transactionKey(operation) === finalTransactionKey)
          .filter((operation) =>
            [
              'selectNoblePhantasmVariant',
              'transformActorForm',
              'addTrait',
              'removeTrait',
              'suppressInitialTrait',
            ].includes(operation.kind),
          )
          .map(({ operationId }) => operationId)
      : [],
  );
  return {
    finalSelection,
    preappliedOperationIds,
    supersededTransactionKeys: new Set(
      selections
        .filter(({ operationId }) => operationId !== finalSelection?.operationId)
        .map(transactionKey),
    ),
  };
}

export type ResolvedVariantSelection =
  | { status: 'selected'; variant: NoblePhantasmVariant }
  | { status: 'rejected'; issue: ExecutionIssue };

export function applyRuntimeNoblePhantasmVariantSelection(
  state: ExecutableBattleState,
  operation: SelectionOperation,
  variants: readonly NoblePhantasmVariant[],
): { state: ExecutableBattleState; issue: ExecutionIssue | null } {
  const variant = variants.find(
    (candidate) =>
      noblePhantasmVariantKey(candidate.ref) === noblePhantasmVariantKey(operation.variant),
  );
  if (!variant || !actorFormEquals(variant.ref.actorFormId, state.actorFormId))
    return {
      state,
      issue: variantIssue(operation, variant ? 'formMismatch' : 'unknownVariant'),
    };
  return { state: applyNoblePhantasmVariantSelection(state, variant), issue: null };
}

function variantIssue(
  selection: SelectionOperation | undefined,
  detail: Extract<ExecutionIssue, { kind: 'invalidNoblePhantasmVariant' }>['detail'],
): ExecutionIssue {
  return {
    kind: 'invalidNoblePhantasmVariant',
    operationId: selection?.operationId ?? 'np:base',
    detail,
  };
}

export function resolveSelectedNoblePhantasmVariant(
  prepared: PreparedOrderedScenario,
  selection: SelectionOperation | undefined,
): ResolvedVariantSelection {
  const variant = selection
    ? prepared.noblePhantasmVariants.find(
        (candidate) =>
          noblePhantasmVariantKey(candidate.ref) === noblePhantasmVariantKey(selection.variant),
      )
    : prepared.baseNoblePhantasmVariant;
  if (!variant) return { status: 'rejected', issue: variantIssue(selection, 'unknownVariant') };
  if (variant.kind === 'nonAttack')
    return { status: 'rejected', issue: variantIssue(selection, 'nonAttackDamage') };
  return { status: 'selected', variant };
}

export function applySelectedNoblePhantasmContext(
  initialState: ExecutableBattleState,
  variant: NoblePhantasmVariant,
  selection: SelectionOperation | undefined,
  operations: readonly BattleOperation[],
  preappliedOperationIds: ReadonlySet<string>,
  activations: ReadonlyMap<string, OperationActivation>,
): { state: ExecutableBattleState; issue: ExecutionIssue | null } {
  const preapplied = operations.filter(
    ({ operationId }) =>
      preappliedOperationIds.has(operationId) && activations.get(operationId)?.enabled === true,
  );
  const transitions = preapplied.filter(
    (operation): operation is Extract<BattleOperation, { kind: 'transformActorForm' }> =>
      operation.kind === 'transformActorForm',
  );
  let state = initialState;
  for (const transition of transitions) {
    const issue = validateActorFormWorldFacts(state, transition);
    if (issue) return { state: initialState, issue };
    state = applyActorFormTransition(state, transition);
  }
  if (!actorFormEquals(state.actorFormId, variant.ref.actorFormId))
    return { state: initialState, issue: variantIssue(selection, 'formMismatch') };
  state = applyNoblePhantasmVariantSelection(state, variant);
  for (const operation of preapplied) {
    const proof = conditionWriteProof(
      readOperationCondition(operation, state),
      procIsGuaranteed(operation.proc, operation.procRatePermille),
    );
    if (operation.kind === 'addTrait')
      state = applyTraitAddition(state, operation.scope, operation.trait, proof);
    if (operation.kind === 'removeTrait')
      state = applyTraitRemoval(state, operation.scope, operation.trait, proof);
    if (operation.kind === 'suppressInitialTrait')
      state = applyInitialTraitSuppression(state, operation.scope, operation.trait, proof);
  }
  return { state, issue: null };
}
