import type { RankingCandidateEvent } from './rankingCandidateBatch';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import { RankingProfileAccumulator } from './rankingProfileOutcome';

const master = masterSnapshotSchema.parse(fixture);
const attackProfile = createStaticAttackProfiles(master.servants[0]!)[0]!;
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const resultBase = {
  rows: [] as const,
  effects: [],
  assumptions: [],
  issues: [],
  trace: [],
  evidence: [],
  versions,
};

function mixedCandidateSet(
  order: readonly ('invalid' | 'input' | 'unsupported' | 'unavailable')[],
) {
  const byKind = {
    invalid: {
      result: {
        status: 'invalid' as const,
        issue: {
          kind: 'attackerLevelStatUnavailable' as const,
          servantId: master.servants[0]!.id,
          level: 90,
        },
        issues: [{ code: 'attackerLevelStatUnavailable', detail: `${master.servants[0]!.id}:90` }],
      },
    },
    input: {
      result: {
        ...resultBase,
        status: 'inputRequired' as const,
        requiredInputs: [
          {
            key: 'fixture:input',
            owner: 'attacker' as const,
            label: 'fixture',
            description: 'fixture',
            minimum: 0,
            maximum: 1,
            step: 1,
            effectOccurrenceIds: ['fixture:0'],
          },
        ],
      },
    },
    unsupported: {
      result: {
        ...resultBase,
        status: 'unsupported' as const,
        missingEvidence: ['resourceStateUnavailable:hp'],
      },
    },
    unavailable: {
      result: {
        ...resultBase,
        status: 'unavailable' as const,
        reason: 'insufficientNpGauge' as const,
      },
    },
  };
  return {
    details: new Map(),
    candidateEvents: order.map((kind, index) => ({
      index,
      descriptor: { attackProfile, key: `candidate:${kind}` },
      execution: structuredClone(byKind[kind]),
    })),
    plan: {
      candidateSpaces: [
        {
          status: 'ready',
          attackProfile,
          policyKey: 'fixture',
          programs: [{}],
          upperBound: order.length,
          certificate: {
            supportedMaximum: 4_096,
            programBounds: [],
            completeUpperBound: order.length,
          },
        },
      ],
      candidateDescriptors: order.map((kind) => ({ attackProfile, key: `candidate:${kind}` })),
    },
  } as unknown as RankingCandidateCalculation & { candidateEvents: RankingCandidateEvent[] };
}

function unresolvedProfileResult(
  candidateSet: RankingCandidateCalculation & { candidateEvents: RankingCandidateEvent[] },
  profile: typeof attackProfile,
) {
  const accumulator = new RankingProfileAccumulator(
    profile,
    candidateSet.plan.candidateSpaces.find(
      (space) => attackProfileKey(space.attackProfile) === attackProfileKey(profile),
    ),
  );
  for (const { descriptor, execution } of candidateSet.candidateEvents)
    accumulator.observe(descriptor.key, execution.result);
  return accumulator.result(candidateSet.details.get(attackProfileKey(profile)));
}

describe('ranking profile blocker aggregation', () => {
  it('uses canonical precedence and retains stable bounded class diagnostics', () => {
    const first = unresolvedProfileResult(
      mixedCandidateSet(['input', 'unsupported', 'unavailable']),
      attackProfile,
    );
    const reordered = unresolvedProfileResult(
      mixedCandidateSet(['unavailable', 'unsupported', 'input']),
      attackProfile,
    );

    expect(first.status).toBe('unsupported');
    expect(first).toMatchObject({
      diagnostics: {
        classes: {
          invalid: { count: 0 },
          unsupported: { count: 1 },
          inputRequired: { count: 1 },
          unavailableUnderPolicy: { count: 1 },
        },
      },
    });
    if (first.status === 'calculated' || reordered.status === 'calculated')
      throw new Error('mixed blockers must not calculate');
    expect(first.diagnostics).toEqual(reordered.diagnostics);
    expect(first.diagnostics?.classes.unsupported.representatives).toHaveLength(1);
  });

  it('classifies planner invalidity above all executable outcome classes', () => {
    const candidateSet = mixedCandidateSet(['unsupported', 'input']);
    candidateSet.plan.candidateSpaces = [
      {
        status: 'invalid',
        attackProfile,
        issue: { kind: 'semanticDomainInvalid', detail: 'fixture-invalid' },
      },
    ];

    expect(unresolvedProfileResult(candidateSet, attackProfile)).toMatchObject({
      status: 'invalid',
      diagnostics: { classes: { invalid: { count: 1 } } },
    });
  });

  it('classifies a shared level-stat invalid above numeric candidate selection', () => {
    const result = unresolvedProfileResult(
      mixedCandidateSet(['unavailable', 'invalid']),
      attackProfile,
    );

    expect(result).toMatchObject({
      status: 'invalid',
      reason: 'attackerLevelStatUnavailable',
      issues: [{ code: 'attackerLevelStatUnavailable' }],
      diagnostics: { classes: { invalid: { count: 1 } } },
    });
  });

  it('lets unsupported block a calculated maximum but lets calculated dominate unavailable', () => {
    const blocked = mixedCandidateSet(['unsupported', 'unavailable']);
    blocked.details = new Map([[attackProfileKey(attackProfile), {} as never]]);
    expect(unresolvedProfileResult(blocked, attackProfile).status).toBe('unsupported');

    const available = mixedCandidateSet(['unavailable']);
    available.details = new Map([[attackProfileKey(attackProfile), {} as never]]);
    expect(unresolvedProfileResult(available, attackProfile).status).toBe('calculated');
  });
});

it('preserves a common unavailable result without reading a preparation diagnostic', () => {
  const candidates = mixedCandidateSet(['unavailable']);
  expect(unresolvedProfileResult(candidates, attackProfile)).toMatchObject({
    status: 'unavailableUnderPolicy',
    reason: 'insufficientNpGauge',
  });
});

it('does not reinterpret an unsupported result from a coincident preparation diagnostic', () => {
  const candidates = mixedCandidateSet(['unavailable']);
  candidates.candidateEvents[0]!.execution.result = {
    ...resultBase,
    rows: [],
    status: 'unsupported',
    missingEvidence: ['unknown-resource'],
  };
  expect(unresolvedProfileResult(candidates, attackProfile)).toMatchObject({
    status: 'unsupported',
  });
});

it('preserves mixed unavailability reasons rather than asserting NP shortage', () => {
  const candidates = mixedCandidateSet(['unavailable', 'unavailable']);
  candidates.candidateEvents[1]!.execution.result = {
    ...resultBase,
    rows: [],
    status: 'unavailable',
    reason: 'npCapacityExceeded',
  };
  expect(unresolvedProfileResult(candidates, attackProfile)).toMatchObject({
    status: 'unavailableUnderPolicy',
    reason: 'noSatisfiableCandidate',
  });
});
