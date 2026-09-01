import { describe, expect, it } from 'vitest';
import type {
  CalculationResult,
  CalculationScenario,
  LocalProfile,
  PortableCalculationRequest,
} from '@fgo-lab/schema';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  canonicalize,
  filterRanking,
  finalizeHistory,
  portableCalculationFingerprint,
} from './index';

const scenario = {
  mode: 'manual',
  manual: {
    attackerId: 'attacker',
    attackerLevel: 90,
    attackerAtk: 10000,
    fouAtk: 1000,
    craftEssenceId: null,
    craftEssenceAtk: 0,
    npLevel: 1,
    overcharge: 1,
    npMultipliers: [300, 400, 450, 475, 500],
    damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
    cardType: 'buster',
    classAttackRate: 1,
    classAffinity: 1,
    attributeAffinity: 1,
    attackBuff: 0,
    defenseBuff: 0,
    cardBuff: 0,
    cardResistance: 0,
    npDamageBuff: 0,
    npResistance: 0,
    powerMod: 0,
    eventDamageBuff: 0,
    npSpecialMultipliers: [1, 1, 1, 1, 1],
    specialDamageBuff: 0,
    specialResistance: 0,
    flatDamage: 0,
    damageCut: 0,
    ignoreDamageCut: false,
    fieldTraits: [],
    attackerStateTraits: [],
    attackerHpPermille: null,
    targetRarity: null,
    targetStateTraits: [],
    battlePointPhase: null,
    target: { classId: null, attribute: 'unknown', traits: [] },
  },
} satisfies CalculationScenario;

const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: 'test-master',
  engineVersion: ENGINE_VERSION,
  appVersion: 'test',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;

const request = {
  versionContext: { masterDataVersion: versions.masterDataVersion, engineVersion: ENGINE_VERSION },
  scenario,
  executionIntent: { kind: 'manual' },
} satisfies PortableCalculationRequest;

const calculatedResult = {
  status: 'calculated',
  precision: 'approximate',
  rows: [1, 2, 3, 4, 5].map((npLevel) => ({
    npLevel,
    minimum: npLevel,
    average: npLevel,
    maximum: npLevel,
  })) as CalculationResult extends { status: 'calculated'; rows: infer Rows } ? Rows : never,
  breakdown: [],
  effects: [],
  assumptions: [],
  issues: [],
  trace: [],
  evidence: [
    {
      key: 'input:manual-final-modifiers',
      subject: 'manual',
      status: 'provisional',
      sources: ['test'],
      goldenCaseIds: ['test'],
      differentialCaseIds: [],
      reviewedAt: '2026-08-25',
      engineVersion: ENGINE_VERSION,
    },
  ],
  versions,
} satisfies CalculationResult;

function profile(): LocalProfile {
  return {
    profileId: '00000000-0000-4000-8000-000000000001',
    name: 'test',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    servantBuilds: {},
    servantTargets: {},
    craftEssences: [],
    supportTemplates: [],
    draft: null,
    history: [],
  };
}

describe('workspace derivations', () => {
  it('canonicalizes object key order', () =>
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 })));
  it('combines ranking filters as an intersection', () =>
    expect(
      filterRanking(
        [
          { name: 'A', classId: 'saber', rarity: 5, npCard: 'buster', npTarget: 'all' },
          { name: 'B', classId: 'archer', rarity: 4, npCard: 'arts', npTarget: 'single' },
        ],
        { text: '', classes: ['saber'], rarities: [5], cards: [], targets: ['all'] },
      ),
    ).toHaveLength(1));

  it('fingerprints the complete portable request identity', async () => {
    const digest = (data: Uint8Array) => {
      const output = new Uint8Array(32);
      for (const [index, value] of data.entries()) {
        const position = index % output.length;
        output[position] = (output[position] ?? 0) ^ value;
      }
      return Promise.resolve(output.buffer);
    };
    const baseline = await portableCalculationFingerprint(request, digest);
    const differentMaster = await portableCalculationFingerprint(
      { ...request, versionContext: { ...request.versionContext, masterDataVersion: 'next' } },
      digest,
    );
    const resolvedRequest = {
      versionContext: request.versionContext,
      scenario: {
        mode: 'resolved' as const,
        attacker: {
          servantId: '1',
          initialActorFormId: { actorId: '1', limitCount: 0 },
          source: 'master' as const,
          level: 90,
          npLevel: 1,
          fouAtk: 1000,
        },
        overcharge: 1,
        targetContext: {
          class: { kind: 'relative' as const, relation: 'neutral' as const },
          attribute: { kind: 'relative' as const, relation: 'neutral' as const },
          families: [],
        },
        attackerHpPermille: null,
        battleState: { battlePointPhase: null },
        canonicalInputValues: {},
        craftEssence: null,
        preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
        mysticCode: null,
        support: null,
        effectDecisions: [],
        activationFacts: [],
        worldFactAssertions: [],
        explicitOverrides: {},
      },
      executionIntent: {
        kind: 'resolved' as const,
        origin: 'ranking' as const,
        initialNpGauge: 20_000,
        contribution: 'excludeVoluntarySkillModifiers' as const,
      },
    } satisfies PortableCalculationRequest;
    const ranking = await portableCalculationFingerprint(resolvedRequest, digest);
    const differentGauge = await portableCalculationFingerprint(
      {
        ...resolvedRequest,
        executionIntent: { ...resolvedRequest.executionIntent, initialNpGauge: 10_000 },
      },
      digest,
    );
    expect(new Set([baseline, differentMaster, ranking, differentGauge])).toHaveLength(4);
  });

  it('updates one history entry when the same session is finalized repeatedly', () => {
    const first = finalizeHistory(profile(), {
      sessionId: '00000000-0000-4000-8000-000000000010',
      request,
      result: calculatedResult,
      fingerprint: 'a'.repeat(64),
      now: '2026-08-25T01:00:00.000Z',
      historyId: '00000000-0000-4000-8000-000000000020',
    });
    const second = finalizeHistory(first, {
      sessionId: '00000000-0000-4000-8000-000000000010',
      request,
      result: calculatedResult,
      fingerprint: 'b'.repeat(64),
      now: '2026-08-25T02:00:00.000Z',
      historyId: '00000000-0000-4000-8000-000000000021',
    });

    expect(second.history).toHaveLength(1);
    expect(second.history[0]).toMatchObject({
      historyId: '00000000-0000-4000-8000-000000000020',
      requestFingerprint: 'b'.repeat(64),
      lastUsedAt: '2026-08-25T02:00:00.000Z',
    });
  });

  it('transfers a duplicate fingerprint to the latest session', () => {
    const first = finalizeHistory(profile(), {
      sessionId: '00000000-0000-4000-8000-000000000010',
      request,
      result: calculatedResult,
      fingerprint: 'a'.repeat(64),
      now: '2026-08-25T01:00:00.000Z',
      historyId: '00000000-0000-4000-8000-000000000020',
    });
    const second = finalizeHistory(first, {
      sessionId: '00000000-0000-4000-8000-000000000011',
      request,
      result: calculatedResult,
      fingerprint: 'a'.repeat(64),
      now: '2026-08-25T02:00:00.000Z',
      historyId: '00000000-0000-4000-8000-000000000021',
    });

    expect(second.history).toHaveLength(1);
    expect(second.history[0]?.calculationSessionId).toBe('00000000-0000-4000-8000-000000000011');
  });

  it('does not finalize an unsupported result', () => {
    const unsupported: CalculationResult = {
      ...calculatedResult,
      status: 'unsupported',
      rows: [],
      missingEvidence: ['test'],
    };
    expect(
      finalizeHistory(profile(), {
        sessionId: '00000000-0000-4000-8000-000000000010',
        request,
        result: unsupported,
        fingerprint: 'a'.repeat(64),
        now: '2026-08-25T01:00:00.000Z',
        historyId: '00000000-0000-4000-8000-000000000020',
      }).history,
    ).toEqual([]);
  });
});
