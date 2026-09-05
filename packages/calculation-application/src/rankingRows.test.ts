import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import type { RankingPolicyDetail } from './rankingContracts';
import { createRankingRow } from './rankingRows';

describe('ranking row canonical contribution derivation', () => {
  it('counts distinct presentation groups, ignores NP base, and derives the badge from that set', () => {
    const servant = masterSnapshotSchema.parse(fixture).servants[0]!;
    const source = {
      origin: 'attacker' as const,
      sourceInstanceId: 'attacker',
      sourceId: servant.id,
      skillId: 'skill',
      effectId: 'effect',
      effectOccurrenceId: 'effect:0',
    };
    const decision = { kind: 'included' as const };
    const contribution = (component: 'modifier' | 'modifierRate') => ({
      contributionId: `operation:${component}`,
      presentationGroupId: 'logical-effect',
      operationId: 'operation',
      component,
      modifier: 'powerMod' as const,
      resolvedValue: 500,
      outputAddress: `damage.${component}` as const,
      source,
      executionOutcome: 'applied' as const,
      selfDecision: decision,
      conditionDecision: decision,
      areaViewDecision: decision,
      effective: true,
      presentationCounted: true,
    });
    const detail = {
      scenario: { attacker: { level: 90, npLevel: 1 } },
      result: { precision: 'exact', rows: [{ minimum: 1, average: 2, maximum: 3 }] },
      effectiveContributions: {
        contributions: [
          contribution('modifier'),
          contribution('modifierRate'),
          {
            ...contribution('modifier'),
            contributionId: 'np:base',
            presentationGroupId: 'np-base',
            component: 'npBase',
            modifier: null,
            outputAddress: 'damage.npBase',
            presentationCounted: false,
          },
        ],
      },
      entryId: 'entry',
      npCard: 'buster',
      npTarget: 'all',
      noblePhantasmVariant: servant.noblePhantasmVariantGroups[0]!.baseVariant,
      noblePhantasmName: 'NP',
      attackProfile: {},
    } as unknown as RankingPolicyDetail;
    const row = createRankingRow(servant, detail, {
      servantBuilds: {},
    });
    expect(row.appliedEffectCount).toBe(1);
    expect(row.specialDamageApplied).toBe(true);
  });
});
