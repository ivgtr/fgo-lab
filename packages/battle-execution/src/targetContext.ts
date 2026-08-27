import {
  attributeAffinity,
  classAffinity,
  targetAttributeCandidates,
  targetClassCandidates,
  type CombatAttribute,
} from '@fgo-lab/calc-core';
import type { CanonicalTargetDomain } from '@fgo-lab/master-data';
import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  CanonicalTargetFamilyId,
  DamageResolutionInput,
  TargetContext,
} from '@fgo-lab/schema';
import type { ConstraintValidationIssue, TargetPredicateAssertion } from './contracts';
import { validateConstraintSet, type SatisfiableConditionConstraint } from './constraints';
import { targetCandidateAssertions } from './targetCandidateConstraint';
import { targetPredicateKey } from './targetPredicate';

export {
  validateTargetCandidateConstraint,
  type TargetCandidateConstraintResult,
} from './targetCandidateConstraint';

export const MAX_TARGET_CANDIDATES = 4_096;

export interface TargetCandidate {
  classId: CanonicalTargetClassId;
  attribute: CanonicalTargetAttribute;
  families: readonly CanonicalTargetFamilyId[];
  facts: readonly TargetPredicateAssertion[];
}

export type TargetResolution =
  | { kind: 'candidates'; candidates: readonly TargetCandidate[] }
  | { kind: 'impossible'; sourceKeys: readonly string[] }
  | { kind: 'unsupported'; reason: 'targetSearchLimit'; sourceKeys: readonly string[] }
  | {
      kind: 'unsupported';
      reason: 'targetConstraintUnsupported';
      issue: ConstraintValidationIssue;
    };

function collectReferencedFamilies(
  expression: SatisfiableConditionConstraint['expression'],
): CanonicalTargetFamilyId[] {
  if (expression.kind === 'targetPredicate')
    return expression.scope === 'target' && expression.predicate.kind === 'familyMembership'
      ? [expression.predicate.familyId]
      : [];
  if (expression.kind === 'all' || expression.kind === 'any')
    return expression.expressions.flatMap(collectReferencedFamilies);
  return expression.kind === 'not' ? collectReferencedFamilies(expression.expression) : [];
}

function collectReferencedPredicates(
  expression: SatisfiableConditionConstraint['expression'],
): TargetPredicate[] {
  if (expression.kind === 'targetPredicate')
    return expression.scope === 'target' ? [expression.predicate] : [];
  if (expression.kind === 'all' || expression.kind === 'any')
    return expression.expressions.flatMap(collectReferencedPredicates);
  return expression.kind === 'not' ? collectReferencedPredicates(expression.expression) : [];
}

function familySelections(
  required: ReadonlySet<CanonicalTargetFamilyId>,
  optional: readonly CanonicalTargetFamilyId[],
): readonly (readonly CanonicalTargetFamilyId[])[] | null {
  const combinationCount = 2 ** optional.length;
  if (!Number.isSafeInteger(combinationCount) || combinationCount > MAX_TARGET_CANDIDATES)
    return null;
  return Array.from({ length: combinationCount }, (_, mask) => [
    ...required,
    ...optional.filter((_, index) => (mask & (1 << index)) !== 0),
  ]);
}

export function resolveTargetCandidates({
  context,
  attackerClass,
  attackerAttribute,
  domain,
  constraints,
}: {
  context: TargetContext;
  attackerClass: string;
  attackerAttribute: CombatAttribute;
  domain: CanonicalTargetDomain;
  constraints: readonly SatisfiableConditionConstraint[];
}): TargetResolution {
  const knownFamilies = new Set(domain.families.map(({ familyId }) => familyId));
  const requiredFamilies = new Set(context.families.map(({ familyId }) => familyId));
  const unknownFamilies = [...requiredFamilies].filter((familyId) => !knownFamilies.has(familyId));
  if (unknownFamilies.length > 0)
    return {
      kind: 'impossible',
      sourceKeys: unknownFamilies.map((familyId) => `target-family:${familyId}`),
    };
  const referencedFamilies = [
    ...new Set(constraints.flatMap(({ expression }) => collectReferencedFamilies(expression))),
  ].filter((familyId) => !requiredFamilies.has(familyId));
  const referencedPredicates = constraints.flatMap(({ expression }) =>
    collectReferencedPredicates(expression),
  );
  const exposeClass =
    context.class.kind === 'concrete' ||
    referencedPredicates.some(({ kind }) => kind === 'classIdentity');
  const exposeAttribute =
    context.attribute.kind === 'concrete' ||
    referencedPredicates.some(({ kind }) => kind === 'attributeIdentity');
  const exposedFamilies = new Set([...requiredFamilies, ...referencedFamilies]);
  const selections = familySelections(requiredFamilies, referencedFamilies);
  const sourceKeys = constraints.map(({ sourceKey }) => sourceKey);
  if (!selections) return { kind: 'unsupported', reason: 'targetSearchLimit', sourceKeys };
  const classIds = targetClassCandidates(attackerClass, context.class).filter((classId) =>
    domain.classIdentities.includes(classId),
  );
  const attributes = targetAttributeCandidates(attackerAttribute, context.attribute).filter(
    (attribute) => domain.attributeIdentities.includes(attribute),
  );
  if (classIds.length * attributes.length * selections.length > MAX_TARGET_CANDIDATES)
    return { kind: 'unsupported', reason: 'targetSearchLimit', sourceKeys };
  const candidates: TargetCandidate[] = [];
  for (const classId of classIds)
    for (const attribute of attributes)
      for (const families of selections) {
        const unresolvedCandidate = { classId, attribute, families };
        const allAssertions = targetCandidateAssertions(unresolvedCandidate, domain);
        const validation = validateConstraintSet({
          fixedFacts: allAssertions.map((assertion) => ({
            sourceKey: assertion.sourceKey,
            fact: {
              kind: 'targetPredicate' as const,
              scope: 'target' as const,
              predicate: assertion.predicate,
              present: assertion.present,
            },
          })),
          expressions: constraints,
        });
        if (validation.status === 'unsupported')
          return {
            kind: 'unsupported',
            reason: 'targetConstraintUnsupported',
            issue: validation.issue,
          };
        if (validation.status === 'satisfied')
          candidates.push({
            ...unresolvedCandidate,
            facts: allAssertions.filter(({ predicate }) => {
              if (predicate.kind === 'classIdentity') return exposeClass;
              if (predicate.kind === 'attributeIdentity') return exposeAttribute;
              return exposedFamilies.has(predicate.familyId);
            }),
          });
      }
  const executionCandidates = [
    ...new Map(
      candidates.map((candidate) => [
        JSON.stringify({
          classAffinity: classAffinity(attackerClass, candidate.classId),
          attributeAffinity: attributeAffinity(attackerAttribute, candidate.attribute),
          facts: candidate.facts.map((fact) => [targetPredicateKey(fact.predicate), fact.present]),
        }),
        candidate,
      ]),
    ).values(),
  ];
  return executionCandidates.length > 0
    ? { kind: 'candidates', candidates: executionCandidates }
    : { kind: 'impossible', sourceKeys };
}

export function materializeTargetCandidate(
  input: DamageResolutionInput,
  attackerClass: string,
  attackerAttribute: CombatAttribute,
  candidate: TargetCandidate,
): { input: DamageResolutionInput; facts: readonly TargetPredicateAssertion[] } {
  return {
    input: {
      ...input,
      classAffinity: classAffinity(attackerClass, candidate.classId),
      attributeAffinity: attributeAffinity(attackerAttribute, candidate.attribute),
      target: { ...input.target, classId: candidate.classId, attribute: candidate.attribute },
    },
    facts: candidate.facts,
  };
}
