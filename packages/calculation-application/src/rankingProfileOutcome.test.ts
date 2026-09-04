import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import { unresolvedProfileResult } from './rankingProfileOutcome';

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

function mixedCandidateSet(order: readonly ('input' | 'unsupported' | 'unavailable')[]) {
  const byKind = {
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
        status: 'unsupported' as const,
        missingEvidence: ['preparation:insufficientNpGauge'],
      },
    },
  };
  return {
    details: new Map(),
    executions: order.map((kind) => byKind[kind]),
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
      attackProfiles: order.map(() => attackProfile),
      candidateKeys: order.map((kind) => `candidate:${kind}`),
      preparedRankingScenarios: order.map((kind) => ({
        resolved: {
          preparationRejection: kind === 'unavailable' ? { code: 'insufficientNpGauge' } : null,
        },
      })),
    },
  } as unknown as RankingCandidateCalculation;
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

  it('lets unsupported block a calculated maximum but lets calculated dominate unavailable', () => {
    const blocked = mixedCandidateSet(['unsupported', 'unavailable']);
    blocked.details = new Map([[attackProfileKey(attackProfile), {} as never]]);
    expect(unresolvedProfileResult(blocked, attackProfile).status).toBe('unsupported');

    const available = mixedCandidateSet(['unavailable']);
    available.details = new Map([[attackProfileKey(attackProfile), {} as never]]);
    expect(unresolvedProfileResult(available, attackProfile).status).toBe('calculated');
  });
});
