import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  type CalculationResult,
  type CalculationScenario,
  type CalculationVersionContext,
  type PortableCalculationRequest,
  type ServantBuild,
  type VersionContext,
} from '@fgo-lab/schema';
import type { RankingPolicyDetail } from './rankingContracts';
import { compileRankingContributionPolicy } from './contributionPolicy';
import {
  createDefaultCalculatorScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenario,
  reapplyPreparedCalculationPolicy,
  type CalculationExecution,
} from './scenario';

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

export type PortableCalculationResetResult =
  | Extract<PortableVersionUpgradeResult, { status: 'committed' }>
  | {
      status: 'rejected';
      retainedRequest: PortableCalculationRequest;
      retainedResult: CalculationResult;
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
            initialNpGauge: 10_000,
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

export function createRankingPortableRequest(
  detail: Pick<RankingPolicyDetail, 'scenario' | 'candidateEvidence' | 'rankingPolicy'>,
  versionContext: CalculationVersionContext,
): PortableCalculationRequest {
  return portableCalculationRequestSchema.parse({
    versionContext,
    scenario: detail.scenario,
    executionIntent: {
      kind: 'ranking',
      initialNpGauge: detail.candidateEvidence.startNpGauge,
      policy: detail.rankingPolicy,
    },
  });
}

export function replacePortableCalculationScenario(
  request: PortableCalculationRequest,
  scenario: CalculationScenario,
): PortableCalculationRequest {
  if (request.scenario.mode !== scenario.mode)
    return createCalculatorPortableRequest(scenario, request.versionContext);
  return portableCalculationRequestSchema.parse({ ...request, scenario });
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
): PortableCalculationResetResult {
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
  try {
    const versions = resultVersions(request);
    const preparation =
      request.executionIntent.kind !== 'manual'
        ? { initialNpGauge: request.executionIntent.initialNpGauge }
        : undefined;
    const prepared = prepareCalculationScenario(request.scenario, master, preparation);
    let executable = prepared;
    if (request.executionIntent.kind === 'ranking' && request.scenario.mode === 'resolved') {
      if (prepared.status === 'executable' && !prepared.orderedScenario)
        throw new TypeError('ranking_contribution_operations_unavailable');
      if (prepared.status === 'executable')
        executable = reapplyPreparedCalculationPolicy(
          prepared,
          compileRankingContributionPolicy(request.executionIntent.policy, 'included'),
        );
    }
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
