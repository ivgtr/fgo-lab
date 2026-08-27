import type { TargetPredicate } from '@fgo-lab/schema';

export function targetPredicateKey(predicate: TargetPredicate): string {
  return predicate.kind === 'classIdentity'
    ? `class:${predicate.classId}`
    : predicate.kind === 'attributeIdentity'
      ? `attribute:${predicate.attribute}`
      : `family:${predicate.familyId}`;
}
