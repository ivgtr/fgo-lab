import { describe, expect, it } from 'vitest';
import type { CanonicalTargetDomain } from '@fgo-lab/master-data';
import { validateTargetCandidateConstraint } from './targetContext';

const domain: CanonicalTargetDomain = {
  classIdentities: ['saber', 'lancer'],
  attributeIdentities: ['sky', 'earth'],
  families: [{ familyId: 'demonGodPillar', membershipConstraints: { kind: 'independent' } }],
};

describe('target candidate constraint validation', () => {
  const saberSkyPillar = {
    classId: 'saber' as const,
    attribute: 'sky' as const,
    families: ['demonGodPillar' as const],
  };

  it('uses the canonical constraint evaluator for identity and family predicates', () => {
    expect(
      validateTargetCandidateConstraint(saberSkyPillar, domain, {
        kind: 'all',
        expressions: [
          {
            kind: 'targetPredicate',
            scope: 'target',
            predicate: { kind: 'classIdentity', classId: 'saber' },
            present: true,
          },
          {
            kind: 'targetPredicate',
            scope: 'target',
            predicate: { kind: 'familyMembership', familyId: 'demonGodPillar' },
            present: true,
          },
        ],
      }),
    ).toEqual({ kind: 'compatible' });
  });

  it('rejects a candidate whose concrete identity conflicts with the condition', () => {
    expect(
      validateTargetCandidateConstraint(saberSkyPillar, domain, {
        kind: 'targetPredicate',
        scope: 'target',
        predicate: { kind: 'classIdentity', classId: 'lancer' },
        present: true,
      }),
    ).toEqual({ kind: 'conflict' });
  });
});
