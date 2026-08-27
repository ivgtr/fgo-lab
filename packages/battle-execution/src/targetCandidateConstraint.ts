import type { CanonicalTargetDomain } from '@fgo-lab/master-data';
import type { TargetPredicate } from '@fgo-lab/schema';
import type { ConstraintValidationIssue, TargetPredicateAssertion } from './contracts';
import { validateConstraintSet, type SatisfiableConditionConstraint } from './constraints';
import type { TargetCandidate } from './targetContext';

export type TargetCandidateConstraintResult =
  | { kind: 'compatible' }
  | { kind: 'conflict' }
  | { kind: 'unsupported'; issue: ConstraintValidationIssue };

export function targetCandidateAssertions(
  candidate: Pick<TargetCandidate, 'classId' | 'attribute' | 'families'>,
  domain: CanonicalTargetDomain,
): TargetPredicateAssertion[] {
  const selectedFamilies = new Set(candidate.families);
  const predicates: TargetPredicate[] = [
    ...domain.classIdentities.map((classId) => ({ kind: 'classIdentity' as const, classId })),
    ...domain.attributeIdentities.map((attribute) => ({
      kind: 'attributeIdentity' as const,
      attribute,
    })),
    ...domain.families.map(({ familyId }) => ({
      kind: 'familyMembership' as const,
      familyId,
    })),
  ];
  return predicates.map((predicate) => {
    let present: boolean;
    switch (predicate.kind) {
      case 'classIdentity':
        present = predicate.classId === candidate.classId;
        break;
      case 'attributeIdentity':
        present = predicate.attribute === candidate.attribute;
        break;
      case 'familyMembership':
        present = selectedFamilies.has(predicate.familyId);
        break;
    }
    return { sourceKey: `target-context:${predicate.kind}`, predicate, present };
  });
}

export function validateTargetCandidateConstraint(
  candidate: Pick<TargetCandidate, 'classId' | 'attribute' | 'families'>,
  domain: CanonicalTargetDomain,
  expression: SatisfiableConditionConstraint['expression'],
): TargetCandidateConstraintResult {
  const validation = validateConstraintSet({
    fixedFacts: targetCandidateAssertions(candidate, domain).map((assertion) => ({
      sourceKey: assertion.sourceKey,
      fact: {
        kind: 'targetPredicate' as const,
        scope: 'target' as const,
        predicate: assertion.predicate,
        present: assertion.present,
      },
    })),
    expressions: [{ sourceKey: 'ranking-target-candidate', expression }],
  });
  if (validation.status === 'unsupported') return { kind: 'unsupported', issue: validation.issue };
  return validation.status === 'conflict' ? { kind: 'conflict' } : { kind: 'compatible' };
}
