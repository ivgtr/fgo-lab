import { describe, expect, it } from 'vitest';
import type { CanonicalTargetDomain } from '@fgo-lab/master-data';
import { resolveTargetCandidates, validateTargetCandidateConstraint } from './targetContext';

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

  it('exposes both polarities of a damage read without constraining a relative target', () => {
    const resolved = resolveTargetCandidates({
      context: {
        class: { kind: 'relative', relation: 'neutral' },
        attribute: { kind: 'relative', relation: 'neutral' },
        families: [],
      },
      attackerClass: 'shielder',
      attackerAttribute: 'star',
      domain,
      constraints: [],
      readExpressions: [
        {
          kind: 'targetPredicate',
          scope: 'target',
          predicate: { kind: 'classIdentity', classId: 'saber' },
          present: true,
        },
        {
          kind: 'targetPredicate',
          scope: 'target',
          predicate: { kind: 'attributeIdentity', attribute: 'sky' },
          present: true,
        },
      ],
    });
    expect(resolved.kind).toBe('candidates');
    if (resolved.kind !== 'candidates') return;
    expect(resolved.candidates).toHaveLength(4);
    expect(
      new Set(
        resolved.candidates.map(
          (candidate) =>
            candidate.facts.find(
              ({ predicate }) =>
                predicate.kind === 'classIdentity' && predicate.classId === 'saber',
            )?.present,
        ),
      ),
    ).toEqual(new Set([true, false]));
    expect(
      new Set(
        resolved.candidates.map(
          (candidate) =>
            candidate.facts.find(
              ({ predicate }) =>
                predicate.kind === 'attributeIdentity' && predicate.attribute === 'sky',
            )?.present,
        ),
      ),
    ).toEqual(new Set([true, false]));
  });
});
