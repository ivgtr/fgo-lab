import type { DamageResolutionInput } from '@fgo-lab/schema';
import { stackInputKey, type NoblePhantasmVariant } from '@fgo-lab/master-data';
import type { ActivationContext, TargetPredicateAssertion } from './contracts';
import type { ConditionEvaluationState } from './condition';
import { targetPredicateKey } from './targetPredicate';
import type { ConditionFactProof, ConditionReadClock } from './conditionRead';
import { createTraitFactLayers } from './traitFactLayers';

export type ConditionStateInput = Pick<
  DamageResolutionInput,
  | 'cardType'
  | 'attackerStateTraits'
  | 'targetStateTraits'
  | 'fieldTraits'
  | 'stackStateCounts'
  | 'attackerHpPermille'
  | 'targetRarity'
  | 'battlePointPhase'
> & { target: Pick<DamageResolutionInput['target'], 'traits'> };

/** World/input facts do not require a damage calculation to exist. */
export function createConditionState<
  TActivationContext extends ActivationContext | null,
  TCard extends ConditionEvaluationState['card'],
>(
  input: Omit<ConditionStateInput, 'cardType'> & { cardType: TCard },
  noblePhantasmVariant: NoblePhantasmVariant,
  attackerTraits: readonly string[],
  resolvedInputValues: Readonly<Record<string, number>>,
  targetPredicateAssertions: readonly TargetPredicateAssertion[],
  attackerPredicateAssertions: readonly TargetPredicateAssertion[],
  activationContext: TActivationContext,
): Omit<ConditionEvaluationState, 'activationContext' | 'card'> & {
  activationContext: TActivationContext;
  card: TCard;
} {
  const attacker = [...attackerTraits, 'cardNP'];
  const clock: ConditionReadClock = {
    phase: 'initial',
    actorFormId: noblePhantasmVariant.ref.actorFormId,
    actor: 'attacker',
    actionId: null,
    operationId: null,
    sourceInstanceId: null,
    occurrenceId: null,
    valueSetIndex: null,
    valueIndex: null,
  };
  const intrinsic: ConditionFactProof = { kind: 'canonicalIntrinsic', clock };
  const external: ConditionFactProof = { kind: 'externalAssumption', clock };
  const initial: ConditionFactProof = { kind: 'selectedInitialResource', clock };
  const proofs = (traits: readonly string[], proof: ConditionFactProof) =>
    new Map(traits.map((trait) => [trait, proof]));
  return {
    traitFactLayers: createTraitFactLayers(
      attacker,
      {
        attackerState: input.attackerStateTraits,
        target: input.target.traits,
        targetState: input.targetStateTraits,
        field: input.fieldTraits,
      },
      intrinsic,
      external,
    ),
    conditionReadClock: clock,
    conditionFactProofs: {
      traits: {
        attacker: proofs(attacker, intrinsic),
        attackerState: proofs(input.attackerStateTraits, external),
        target: proofs(input.target.traits, external),
        targetState: proofs(input.targetStateTraits, external),
        field: proofs(input.fieldTraits, external),
      },
      completeTraits: {
        attacker: intrinsic,
        attackerState: null,
        target: null,
        targetState: null,
        field: null,
      },
      suppressions: { attacker: new Map(), target: new Map() },
      predicates: {
        attacker: new Map(
          attackerPredicateAssertions.map((fact) => [targetPredicateKey(fact.predicate), external]),
        ),
        target: new Map(
          targetPredicateAssertions.map((fact) => [targetPredicateKey(fact.predicate), external]),
        ),
      },
      quantities: new Map([
        ['attackerHpPermille', initial],
        ['targetRarity', external],
        ['battlePointPhase', external],
      ]),
      inputs: new Map(Object.keys(resolvedInputValues).map((key) => [key, external])),
      activations: new Map(),
      markers: new Map(),
    },
    noblePhantasmVariant,
    card: input.cardType,
    traits: {
      attacker: traitFacts(attacker),
      attackerState: traitFacts(input.attackerStateTraits),
      target: traitFacts(input.target.traits),
      targetState: traitFacts(input.targetStateTraits),
      field: traitFacts(input.fieldTraits),
    },
    actorPredicates: {
      attacker: new Map(
        attackerPredicateAssertions.map((assertion) => [
          targetPredicateKey(assertion.predicate),
          { predicate: assertion.predicate, present: assertion.present },
        ]),
      ),
      target: new Map(
        targetPredicateAssertions.map((assertion) => [
          targetPredicateKey(assertion.predicate),
          { predicate: assertion.predicate, present: assertion.present },
        ]),
      ),
    },
    stackQuantitySources: Object.fromEntries(
      (['attackerState', 'targetState', 'field'] as const).flatMap((scope) =>
        Object.keys(input.stackStateCounts?.[scope] ?? {}).map((trait) => {
          const source = { scope, trait };
          return [stackInputKey(source), source];
        }),
      ),
    ),
    traitCounts: {
      attacker: traitCounts(attacker),
      attackerState: {
        ...traitCounts(input.attackerStateTraits),
        ...input.stackStateCounts?.attackerState,
      },
      target: traitCounts(input.target.traits),
      targetState: {
        ...traitCounts(input.targetStateTraits),
        ...input.stackStateCounts?.targetState,
      },
      field: { ...traitCounts(input.fieldTraits), ...input.stackStateCounts?.field },
    },
    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    quantities: {
      attackerHpPermille: input.attackerHpPermille,
      targetRarity: input.targetRarity,
      battlePointPhase: input.battlePointPhase,
    },
    activationContext,
    resolvedInputValues: { ...resolvedInputValues },
  };
}

export function traitFacts(traits: Iterable<string>): ReadonlyMap<string, boolean> {
  return new Map([...traits].map((trait) => [trait, true] as const));
}
export function traitCounts(traits: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const trait of traits) result[trait] = (result[trait] ?? 0) + 1;
  return result;
}
