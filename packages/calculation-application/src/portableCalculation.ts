import { validatePinnedRankingBasis } from './rankingPortableBasis';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  type CalculationResult,
  type CalculationHistoryEntry,
  type CalculationScenario,
  type CalculationVersionContext,
  type PortableCalculationRequest,
  type ServantBuild,
  type VersionContext,
} from '@fgo-lab/schema';
import type { RankingPolicyDetail } from './rankingContracts';
import {
  attackProfileForTerminalState,
  attackProfileKey,
  createStaticActorFormProfiles,
  type AttackProfile,
} from './attackProfile';
import { compileRankingContributionPolicy } from './contributionPolicy';
import {
  createDefaultResolvedScenario,
  createDefaultCalculatorScenario,
  excludeDefaultAttackerSkillContributions,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  type CalculationExecution,
} from './scenario';
import {
  materializePreNoblePhantasmPlan,
  planPreNoblePhantasmCandidates,
} from './preNoblePhantasmPlanner';

type PortableCalculationExecution = Exclude<CalculationExecution, { status: 'invalid' }>;

export type PortableCalculationOutcome =
  | {
      status: 'executed';
      request: PortableCalculationRequest;
      execution: PortableCalculationExecution;
    }
  | {
      status: 'invalid';
      request: PortableCalculationRequest;
      reason:
        | 'runtimeVersionMismatch'
        | 'initialNpGaugeExceedsCapacity'
        | 'attackerLevelStatUnavailable'
        | 'initialHpUnavailable'
        | 'scenarioInvalid'
        | 'requestResultVersionMismatch'
        | 'storedResultMismatch';
      detail?: string;
    }
  | {
      status: 'unsupported';
      request: PortableCalculationRequest;
      execution: PortableCalculationExecution;
    };

export type PortableCalculationRecovery =
  | PortableCalculationOutcome
  | {
      status: 'historicalOnly';
      reason: 'versionUnavailable';
      request: PortableCalculationRequest;
      result: CalculationResult;
    };

export type PortableCalculationFailure = Extract<
  PortableCalculationOutcome,
  { status: 'invalid' | 'unsupported' }
>;

export type PortableVersionUpgradeResult =
  | {
      status: 'committed';
      request: PortableCalculationRequest;
      result: CalculationResult;
      execution: CalculationExecution;
    }
  | {
      status: 'rejected';
      retainedRequest: PortableCalculationRequest;
      retainedResult: CalculationResult;
      attemptedRequest: PortableCalculationRequest;
      failure: PortableCalculationFailure;
    };

export type PortableCalculationAttemptResult<
  Retained extends CalculationResult | undefined = CalculationResult,
> =
  | Extract<PortableVersionUpgradeResult, { status: 'committed' }>
  | {
      status: 'rejected';
      retainedRequest: PortableCalculationRequest;
      retainedResult: Retained;
      attemptedRequest: PortableCalculationRequest | null;
      failure: PortableCalculationFailure;
    };

export function currentCalculationVersionContext(
  master: MasterDataSnapshot,
): CalculationVersionContext {
  return { masterDataVersion: master.version, engineVersion: ENGINE_VERSION };
}

export function createCalculatorPortableRequest(
  scenario: CalculationScenario,
  versionContext: CalculationVersionContext,
): PortableCalculationRequest {
  return portableCalculationRequestSchema.parse(
    scenario.mode === 'manual'
      ? { versionContext, scenario, executionIntent: { kind: 'manual' } }
      : {
          versionContext,
          scenario,
          executionIntent: {
            kind: 'calculator',
            initialNpGauge: scenario.initialOvercharge * 10000,
          },
        },
  );
}

export function createDefaultCalculatorPortableRequest(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): PortableCalculationRequest {
  return createCalculatorPortableRequest(
    createDefaultCalculatorScenario(master, build, servant),
    currentCalculationVersionContext(master),
  );
}

export function createCalculatorPortableRequestForAttackProfile(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster,
  attackProfile: AttackProfile,
): PortableCalculationRequest {
  if (attackProfile.id.servantLineageId !== servant.id)
    throw new TypeError('attack_profile_servant_mismatch');
  const npLevel = Math.max(1, build?.npLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
  const planned = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, npLevel, 1);
  const profiles = createStaticActorFormProfiles(servant);
  const targetKey = attackProfileKey(attackProfile);
  const candidate = planned.candidates.find((item) => {
    try {
      return (
        attackProfileKey(attackProfileForTerminalState(servant, profiles, item.terminalState)) ===
        targetKey
      );
    } catch {
      return false;
    }
  });
  if (!candidate) throw new TypeError('attack_profile_not_reachable');
  const base = createDefaultResolvedScenario(master, build, servant);
  const scenario = excludeDefaultAttackerSkillContributions(
    materializePreNoblePhantasmPlan(base, {
      ...candidate,
      commands: candidate.commands.map((command) =>
        command.kind === 'useSkillSlot'
          ? {
              ...command,
              skillLevel: build?.npLevel ? (build.skills[String(command.slot)] ?? 1) : 10,
            }
          : command,
      ),
    }),
    master,
  );
  return createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master));
}

export function createRankingPortableRequest(
  detail: Pick<RankingPolicyDetail, 'scenario' | 'candidateEvidence' | 'rankingPolicy' | 'basis'>,
  versionContext: CalculationVersionContext,
): PortableCalculationRequest {
  return portableCalculationRequestSchema.parse({
    versionContext,
    scenario: detail.scenario,
    executionIntent: {
      kind: 'ranking',
      initialNpGauge: detail.candidateEvidence.startNpGauge,
      policy: detail.rankingPolicy,
      basis: detail.basis,
    },
  });
}

export function replacePortableCalculationScenario(
  request: PortableCalculationRequest,
  scenario: CalculationScenario,
): PortableCalculationRequest {
  if (request.scenario.mode !== scenario.mode || request.executionIntent.kind === 'calculator')
    return createCalculatorPortableRequest(scenario, request.versionContext);
  return portableCalculationRequestSchema.parse({ ...request, scenario });
}

export function attemptPortableCalculationScenarioChange(
  retainedRequest: PortableCalculationRequest,
  retainedResult: CalculationResult | undefined,
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): PortableCalculationAttemptResult<CalculationResult | undefined> {
  let attemptedRequest: PortableCalculationRequest;
  try {
    attemptedRequest = replacePortableCalculationScenario(retainedRequest, scenario);
  } catch (cause) {
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest: null,
      failure: {
        status: 'invalid',
        request: retainedRequest,
        reason: 'scenarioInvalid',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
  const outcome = executePortableCalculation(attemptedRequest, master);
  if (outcome.status === 'invalid')
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest,
      failure: outcome,
    };
  return {
    status: 'committed',
    request: attemptedRequest,
    result: outcome.execution.result,
    execution: outcome.execution,
  };
}

export function resetPortableCalculationRequest(
  request: PortableCalculationRequest,
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster,
): PortableCalculationRequest {
  return createCalculatorPortableRequest(
    createDefaultCalculatorScenario(master, build, servant),
    currentCalculationVersionContext(master),
  );
}

export function attemptPortableCalculationReset(
  retainedRequest: PortableCalculationRequest,
  retainedResult: CalculationResult,
  master: MasterDataSnapshot,
  servantBuilds: Readonly<Record<string, ServantBuild>>,
): PortableCalculationAttemptResult {
  const retainedScenario = retainedRequest.scenario;
  const retainedAttackerId =
    retainedScenario.mode === 'resolved' ? retainedScenario.attacker.servantId : null;
  const subjects =
    retainedAttackerId === null
      ? []
      : master.servants.filter((candidate) => candidate.id === retainedAttackerId);
  const servant = subjects.length === 1 ? subjects[0] : undefined;
  if (!servant)
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest: null,
      failure: {
        status: 'invalid',
        request: retainedRequest,
        reason: 'scenarioInvalid',
        detail: 'retained_request_subject_unavailable',
      },
    };
  let attemptedRequest: PortableCalculationRequest;
  try {
    attemptedRequest = resetPortableCalculationRequest(
      retainedRequest,
      master,
      servantBuilds[servant.id],
      servant,
    );
  } catch (cause) {
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest: null,
      failure: {
        status: 'invalid',
        request: retainedRequest,
        reason: 'scenarioInvalid',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
  if (!resultMatchesRequestVersions(retainedRequest, retainedResult))
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest,
      failure: {
        status: 'invalid',
        request: attemptedRequest,
        reason: 'requestResultVersionMismatch',
      },
    };
  const outcome = executePortableCalculation(attemptedRequest, master);
  if (outcome.status !== 'executed')
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest,
      failure: outcome,
    };
  return {
    status: 'committed',
    request: attemptedRequest,
    result: outcome.execution.result,
    execution: outcome.execution,
  };
}

export function upgradePortableCalculationRequestVersion(
  request: PortableCalculationRequest,
  versionContext: CalculationVersionContext,
): PortableCalculationRequest {
  return portableCalculationRequestSchema.parse({ ...request, versionContext });
}

function resultVersions(request: PortableCalculationRequest): VersionContext {
  return {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: request.versionContext.masterDataVersion,
    engineVersion: request.versionContext.engineVersion,
    appVersion: APP_VERSION,
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
  };
}

export function resultMatchesRequestVersions(
  request: PortableCalculationRequest,
  result: CalculationResult,
): boolean {
  return (
    result.versions.masterDataVersion === request.versionContext.masterDataVersion &&
    result.versions.engineVersion === request.versionContext.engineVersion
  );
}

export function executePortableCalculation(
  requestValue: PortableCalculationRequest,
  master: MasterDataSnapshot,
): PortableCalculationOutcome {
  const parsed = portableCalculationRequestSchema.safeParse(requestValue);
  if (!parsed.success)
    return {
      status: 'invalid',
      request: requestValue,
      reason: 'scenarioInvalid',
      detail: parsed.error.issues.map(({ message }) => message).join(','),
    };
  const request = parsed.data;
  if (
    request.versionContext.masterDataVersion !== master.version ||
    request.versionContext.engineVersion !== ENGINE_VERSION
  )
    return { status: 'invalid', request, reason: 'runtimeVersionMismatch' };
  if (request.executionIntent.kind !== 'manual' && request.scenario.mode === 'resolved') {
    const capacity =
      master.npResourceSemantics.capacityByNpLevel[request.scenario.attacker.npLevel - 1];
    if (capacity === undefined || request.executionIntent.initialNpGauge > capacity)
      return { status: 'invalid', request, reason: 'initialNpGaugeExceedsCapacity' };
  }
  if (!validatePinnedRankingBasis(request, master))
    return {
      status: 'invalid',
      request,
      reason: 'scenarioInvalid',
      detail: 'ranking_basis_invalid',
    };
  try {
    const versions = resultVersions(request);
    const preparation =
      request.executionIntent.kind !== 'manual'
        ? { initialNpGauge: request.executionIntent.initialNpGauge }
        : undefined;
    const executable = prepareCalculationScenarioWithPolicy(
      request.scenario,
      master,
      request.executionIntent.kind === 'ranking'
        ? compileRankingContributionPolicy(request.executionIntent.policy, 'included')
        : { kind: 'calculator' },
      preparation,
    );
    const execution = evaluatePreparedCalculationScenario(executable, versions);
    if (execution.status === 'invalid')
      return {
        status: 'invalid',
        request,
        reason: execution.result.issue.kind,
        detail: `${execution.result.issue.servantId}:${String(execution.result.issue.level)}`,
      };
    if (!resultMatchesRequestVersions(request, execution.result))
      return { status: 'invalid', request, reason: 'requestResultVersionMismatch' };
    return execution.result.status === 'unsupported'
      ? { status: 'unsupported', request, execution }
      : { status: 'executed', request, execution };
  } catch (cause) {
    return {
      status: 'invalid',
      request,
      reason: 'scenarioInvalid',
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function attemptPortableCalculationVersionUpgrade(
  retainedRequest: PortableCalculationRequest,
  retainedResult: CalculationResult,
  versionContext: CalculationVersionContext,
  master: MasterDataSnapshot,
): PortableVersionUpgradeResult {
  const attemptedRequest = upgradePortableCalculationRequestVersion(
    retainedRequest,
    versionContext,
  );
  if (!resultMatchesRequestVersions(retainedRequest, retainedResult))
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest,
      failure: {
        status: 'invalid',
        request: attemptedRequest,
        reason: 'requestResultVersionMismatch',
      },
    };
  const outcome = executePortableCalculation(attemptedRequest, master);
  if (outcome.status !== 'executed')
    return {
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest,
      failure: outcome,
    };
  return {
    status: 'committed',
    request: attemptedRequest,
    result: outcome.execution.result,
    execution: outcome.execution,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}

function comparableResult(result: CalculationResult) {
  return {
    ...result,
    versions: {
      schemaVersion: result.versions.schemaVersion,
      masterDataVersion: result.versions.masterDataVersion,
      engineVersion: result.versions.engineVersion,
      gameRegion: result.versions.gameRegion,
      masterDataLocale: result.versions.masterDataLocale,
    },
  };
}

export function recoverPortableCalculation(
  request: PortableCalculationRequest,
  result: CalculationResult,
  master: MasterDataSnapshot,
): PortableCalculationRecovery {
  if (!resultMatchesRequestVersions(request, result))
    return { status: 'invalid', request, reason: 'requestResultVersionMismatch' };
  if (
    request.versionContext.masterDataVersion !== master.version ||
    request.versionContext.engineVersion !== ENGINE_VERSION
  )
    return { status: 'historicalOnly', reason: 'versionUnavailable', request, result };
  const outcome = executePortableCalculation(request, master);
  if (
    (outcome.status === 'executed' || outcome.status === 'unsupported') &&
    canonical(comparableResult(outcome.execution.result)) !== canonical(comparableResult(result))
  )
    return { status: 'invalid', request, reason: 'storedResultMismatch' };
  return outcome;
}

/** Regeneration preserves historical evidence and creates a new calculator request for its subject. */
export function regenerateHistoricalCalculatorRequest(
  entry: Extract<CalculationHistoryEntry, { disposition: 'historicalOnly' }>,
  master: MasterDataSnapshot,
  builds: Readonly<Record<string, ServantBuild>>,
): PortableCalculationRequest | null {
  const subject = master.servants.find(
    (servant) => servant.id === entry.scenario.attacker.servantId,
  );
  return subject
    ? createDefaultCalculatorPortableRequest(master, builds[subject.id], subject)
    : null;
}
