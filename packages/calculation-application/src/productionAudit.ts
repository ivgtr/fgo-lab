import { naturalServantLevel, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import {
  canonicalAuditDigest,
  type CanonicalAuditRecord,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { createDefaultResolvedScenario, calculateScenario } from './scenario';
import type { CalculationApplicationResult } from './scenario';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
import { attackProfileKey } from './attackProfile';

export type ProductionAuditOutcome =
  | { status: 'calculated'; rows: CanonicalAuditValue }
  | { status: 'inputRequired'; issues: CanonicalAuditValue }
  | { status: 'unsupported'; issues: CanonicalAuditValue }
  | { status: 'invalid'; reason: string };

export interface CalculationApplicationAuditCounters {
  candidateCount: number;
  deduplicatedCandidateCount: number;
  damageRequestCount: number;
  distinctDamageRequestCount: number;
}

export interface CalculationApplicationProductionAudit {
  boundary: 'calculation-application';
  masterDataVersion: string;
  schemaVersion: number;
  engineVersion: string;
  records: readonly CanonicalAuditRecord[];
  digest: string;
  inventory: {
    attackServants: number;
    attackProfiles: number;
    preparationPlans: number;
    calculatorScenarios: number;
    rankingRows: number;
    rankingPolicy: 'current-default';
    calculated: number;
    inputRequired: number;
    unsupported: number;
    invalid: number;
    levelStatAvailability: {
      naturalPairs: number;
      naturalMissing: number;
      level90Pairs: number;
      level90Missing: number;
      referencedPairs: number;
      referencedMissing: number;
      missing: readonly string[];
    };
  };
  failures: readonly {
    kind: 'inputRequired' | 'unsupported' | 'invalid' | 'rankingFailure';
    identity: string;
    reason: string;
  }[];
  counters: CalculationApplicationAuditCounters;
}

const jsonValue = (value: unknown): CanonicalAuditValue =>
  JSON.parse(JSON.stringify(value)) as CanonicalAuditValue;

export function appliedOperationIds(effects: readonly EffectProjection[]): string[] {
  const applied = effects.flatMap(({ outcome, operationId }) =>
    outcome === 'applied' ? [operationId] : [],
  );
  return applied.filter((operationId, index) => applied.lastIndexOf(operationId) === index);
}

function auditOutcome(result: CalculationApplicationResult): ProductionAuditOutcome {
  switch (result.status) {
    case 'calculated':
      return { status: 'calculated', rows: jsonValue(result.rows) };
    case 'inputRequired':
      return { status: 'inputRequired', issues: jsonValue(result.requiredInputs) };
    case 'unsupported':
      return { status: 'unsupported', issues: jsonValue(result.issues) };
    case 'invalid':
      return {
        status: 'invalid',
        reason: `${result.issue.kind}:${result.issue.servantId}:${String(result.issue.level)}`,
      };
  }
}

export function compileCalculationApplicationProductionAudit(
  master: MasterDataSnapshot,
): CalculationApplicationProductionAudit {
  const versions: VersionContext = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
    masterDataVersion: master.version,
  };
  const candidateRecords: CanonicalAuditRecord[] = [];
  const calculatorRecords: CanonicalAuditRecord[] = [];
  const failures: CalculationApplicationProductionAudit['failures'][number][] = [];
  let generatedCandidateCount = 0;
  let deduplicatedCandidateCount = 0;
  let attackServants = 0;
  let calculated = 0;
  let inputRequired = 0;
  let unsupported = 0;
  let invalid = 0;
  const naturalLevelPairs = new Set<string>();
  const level90Pairs = new Set<string>();
  const referencedLevelPairs = new Set<string>();
  const levelPairKey = (servantId: string, level: number) => `${servantId}:${String(level)}`;

  for (const servant of master.servants) {
    const planned = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1);
    generatedCandidateCount += planned.inventory.generatedStateCount;
    deduplicatedCandidateCount += planned.inventory.deduplicatedStateCount;
    if (planned.candidates.length === 0) continue;
    attackServants += 1;
    naturalLevelPairs.add(levelPairKey(servant.id, naturalServantLevel(servant.rarity)));
    level90Pairs.add(levelPairKey(servant.id, 90));
    for (const candidate of planned.candidates)
      candidateRecords.push({
        identity: `preparation:${servant.id}:${candidate.semanticStateKey}`,
        value: {
          actions: jsonValue(candidate.commands),
          initialActorFormId: candidate.terminalState.initialFormId,
          selectedNoblePhantasmVariant: jsonValue(
            candidate.terminalState.selectedNoblePhantasmVariant,
          ),
        },
      });
    try {
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      referencedLevelPairs.add(levelPairKey(servant.id, scenario.attacker.level));
      const execution = calculateScenario(scenario, master, versions);
      const outcome = auditOutcome(execution.result);
      if (outcome.status === 'calculated') calculated += 1;
      else {
        if (outcome.status === 'inputRequired') inputRequired += 1;
        else if (outcome.status === 'unsupported') unsupported += 1;
        else invalid += 1;
        failures.push({
          kind: outcome.status,
          identity: `calculator:${servant.id}`,
          reason: outcome.status === 'invalid' ? outcome.reason : JSON.stringify(outcome.issues),
        });
      }
      calculatorRecords.push({
        identity: `calculator:${servant.id}`,
        value: {
          appliedEffects: appliedOperationIds(execution.effects),
          availableActions: jsonValue(planned.candidates.map(({ commands }) => commands)),
          executionIssues: jsonValue([...execution.effectWarnings, ...execution.result.issues]),
          executionTrace: jsonValue(
            execution.result.status === 'invalid' ? [] : execution.result.trace,
          ),
          outcome: jsonValue(outcome),
          usedInput: execution.status === 'executable' ? jsonValue(execution.input) : null,
        },
      });
    } catch (cause) {
      invalid += 1;
      const reason = cause instanceof Error ? cause.message : String(cause);
      failures.push({ kind: 'invalid', identity: `calculator:${servant.id}`, reason });
      calculatorRecords.push({
        identity: `calculator:${servant.id}`,
        value: { outcome: { status: 'invalid', reason } },
      });
    }
  }

  const ranking = calculateRankingPolicy(
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
    versions,
  );
  for (const exclusion of ranking.exclusions)
    if (exclusion.status !== 'unavailableUnderPolicy')
      failures.push({
        kind: 'rankingFailure',
        identity: `ranking:${exclusion.entryId}`,
        reason: `${exclusion.status}:${exclusion.reason}`,
      });
  const rankingEntryIds = ranking.rows.map(({ entryId }) => entryId);
  for (const result of Object.values(ranking.profileResults))
    if (result.status === 'calculated')
      referencedLevelPairs.add(
        levelPairKey(result.detail.servantId, result.detail.scenario.attacker.level),
      );
  if (new Set(rankingEntryIds).size !== rankingEntryIds.length)
    throw new TypeError('production_audit_duplicate_attack_profile_identity');
  const attackProfileRecords: CanonicalAuditRecord[] = Object.entries(ranking.profileResults).map(
    ([profileKey, result]) => {
      const attackProfile =
        result.status === 'calculated' ? result.detail.attackProfile : result.attackProfile;
      if (!attackProfile)
        throw new TypeError(`production_audit_attack_profile_missing:${profileKey}`);
      const canonicalIdentity = attackProfileKey(attackProfile);
      if (profileKey !== canonicalIdentity)
        throw new TypeError(`production_audit_attack_profile_identity_mismatch:${profileKey}`);
      return {
        identity: `attack-profile:${canonicalIdentity}`,
        value: {
          attributes: {
            cardType: attackProfile.cardType,
            targetScope: attackProfile.targetScope,
          },
          identity: jsonValue(attackProfile.id),
        },
      };
    },
  );
  const rankingRecords: CanonicalAuditRecord[] = Object.entries(ranking.profileResults).map(
    ([profileKey, result]) => {
      if (result.status !== 'calculated') {
        const reason =
          result.status === 'unavailableUnderPolicy' ||
          result.status === 'invalid' ||
          result.status === 'unsupported'
            ? result.reason
            : result.inputs.map(({ key }) => key).join(',');
        return {
          identity: `ranking:${profileKey}`,
          value: jsonValue({
            status: result.status,
            reason,
            diagnostics: result.diagnostics ?? null,
          }),
        };
      }
      const { detail } = result;
      return {
        identity: `ranking:${detail.entryId}`,
        value: {
          appliedEffects: appliedOperationIds(detail.effects),
          candidateEvidence: jsonValue(detail.candidateEvidence),
          executionIssues: jsonValue([...detail.warnings, ...detail.result.issues]),
          executionTrace: jsonValue(detail.result.trace),
          outcome: jsonValue(auditOutcome(detail.result)),
          policy: 'current-default',
          scenarioIdentity: detail.entryId,
          usedInput: jsonValue(detail.input),
        },
      };
    },
  );
  const servantById = new Map(master.servants.map((servant) => [servant.id, servant]));
  const missingPairs = (pairs: ReadonlySet<string>) =>
    [...pairs].filter((pair) => {
      const separator = pair.lastIndexOf(':');
      const servant = servantById.get(pair.slice(0, separator));
      return servant?.atkByLevel[pair.slice(separator + 1)] === undefined;
    });
  const naturalMissing = missingPairs(naturalLevelPairs);
  const level90Missing = missingPairs(level90Pairs);
  const referencedMissing = missingPairs(referencedLevelPairs);
  const inventory = {
    attackServants,
    attackProfiles: attackProfileRecords.length,
    preparationPlans: candidateRecords.length,
    calculatorScenarios: calculatorRecords.length,
    rankingRows: ranking.rows.length,
    rankingPolicy: 'current-default' as const,
    calculated,
    inputRequired,
    unsupported,
    invalid,
    levelStatAvailability: {
      naturalPairs: naturalLevelPairs.size,
      naturalMissing: naturalMissing.length,
      level90Pairs: level90Pairs.size,
      level90Missing: level90Missing.length,
      referencedPairs: referencedLevelPairs.size,
      referencedMissing: referencedMissing.length,
      missing: [...new Set([...naturalMissing, ...level90Missing, ...referencedMissing])].sort(),
    },
  };
  const records: CanonicalAuditRecord[] = [
    { identity: 'inventory', value: inventory },
    ...candidateRecords,
    ...calculatorRecords,
    ...attackProfileRecords,
    ...rankingRecords,
  ];
  return {
    boundary: 'calculation-application',
    masterDataVersion: master.version,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    records,
    digest: canonicalAuditDigest(records),
    inventory,
    failures,
    counters: {
      candidateCount: generatedCandidateCount,
      deduplicatedCandidateCount,
      damageRequestCount: ranking.damageCache.requestCount,
      distinctDamageRequestCount: ranking.damageCache.distinctDamageInputCount,
    },
  };
}
