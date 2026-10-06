import type { BattleOperation, ExecutableBattleState, ExecutionIssue } from './contracts';
import type { TargetPredicateAssertion, WorldFactAssertion } from './contracts';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type FixedConstraintFact,
  type SatisfiableConditionConstraint,
} from './constraints';

export function initialSelectionFixedFacts(
  state: ExecutableBattleState,
  targetFacts: readonly TargetPredicateAssertion[],
  worldFacts: readonly WorldFactAssertion[],
  variant: NoblePhantasmVariant,
  selection: Extract<BattleOperation, { kind: 'selectNoblePhantasmVariant' }> | undefined,
): FixedConstraintFact[] {
  return [
    ...fixedConstraintFactsFromState(state, 'initial').filter(
      ({ fact }) => !selection || fact.kind !== 'card',
    ),
    ...(selection && variant.kind === 'attack'
      ? [
          {
            sourceKey: selection.decisionKey ?? selection.operationId,
            fact: { kind: 'card' as const, card: variant.card },
          },
        ]
      : []),
    ...targetFacts.map((assertion) => ({
      sourceKey: assertion.sourceKey,
      fact: {
        kind: 'targetPredicate' as const,
        scope: 'target' as const,
        predicate: assertion.predicate,
        present: assertion.present,
      },
    })),
    ...worldFacts.map((assertion) => ({ sourceKey: assertion.decisionKey, fact: assertion.fact })),
  ];
}

/** Form intrinsic facts and external initial-layer facts must agree before a transition commits. */
export function validateActorFormWorldFacts(
  state: ExecutableBattleState,
  operation: Extract<BattleOperation, { kind: 'transformActorForm' }>,
): ExecutionIssue | null {
  const validation = validateConstraintSet({
    fixedFacts: [
      ...[...operation.targetTraits, 'cardNP'].map((trait) => ({
        sourceKey: `${operation.operationId}:form:${trait}`,
        fact: { kind: 'trait' as const, scope: 'attacker' as const, trait, present: true },
      })),
      ...[...state.traitFactLayers.externalInitial.attacker].map(([trait, fact]) => ({
        sourceKey: `${operation.operationId}:world:${trait}`,
        fact: {
          kind: 'trait' as const,
          scope: 'attacker' as const,
          trait,
          present: fact.kind === 'present',
        },
      })),
    ],
    expressions: [],
  });
  return validation.status === 'satisfied' ? null : validation.issue;
}

export function validateSelectedFormConstraints(
  state: ExecutableBattleState,
  expressions: readonly SatisfiableConditionConstraint[],
): ExecutionIssue | null {
  const validation = validateConstraintSet({
    fixedFacts: fixedConstraintFactsFromState(state, 'selected-form'),
    expressions,
  });
  return validation.status === 'satisfied' ? null : validation.issue;
}
