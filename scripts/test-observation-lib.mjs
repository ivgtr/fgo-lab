import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function validateAllowances(allowances, now = new Date()) {
  const errors = [];
  const keys = new Set();
  for (const [index, allowance] of allowances.entries()) {
    const prefix = `allowances[${index}]`;
    for (const field of ['runner', 'testId', 'kind', 'message', 'reason', 'expiresAt']) {
      if (typeof allowance?.[field] !== 'string' || allowance[field].length === 0)
        errors.push(`${prefix}:missing_${field}`);
    }
    if (allowance?.message instanceof RegExp || allowance?.pattern || allowance?.prefix)
      errors.push(`${prefix}:broad_message_match`);
    if (
      typeof allowance?.kind === 'string' &&
      allowance.kind.includes('console') &&
      allowance?.message === 'Failed to load resource: net::ERR_FAILED'
    )
      errors.push(`${prefix}:generic_resource_console`);
    if (!Number.isSafeInteger(allowance?.expectedCount) || allowance.expectedCount <= 0)
      errors.push(`${prefix}:invalid_expectedCount`);
    if (
      typeof allowance?.kind === 'string' &&
      !allowance.kind.includes('console') &&
      allowance.kind !== 'browser.resource_failure'
    )
      errors.push(`${prefix}:non_console_allowance`);
    if (allowance?.kind === 'browser.resource_failure') {
      const detail = allowance.detail;
      for (const field of ['url', 'resourceType', 'failureText', 'pageId'])
        if (typeof detail?.[field] !== 'string' || detail[field].length === 0)
          errors.push(`${prefix}:missing_resource_${field}`);
    }
    if (allowance?.runner === 'playwright' && allowance?.kind === 'browser.console') {
      for (const field of ['type', 'url', 'locationUrl', 'pageId'])
        if (typeof allowance.detail?.[field] !== 'string' || allowance.detail[field].length === 0)
          errors.push(`${prefix}:missing_console_${field}`);
    }
    const expiry = Date.parse(allowance?.expiresAt ?? '');
    if (!Number.isFinite(expiry)) errors.push(`${prefix}:invalid_expiry`);
    else if (expiry <= now.getTime()) errors.push(`${prefix}:expired`);
    const key = observationKey(allowance ?? {});
    if (keys.has(key)) errors.push(`${prefix}:duplicate`);
    keys.add(key);
  }
  return errors;
}

function observationKey(value) {
  return [
    value.runner,
    value.testId,
    value.kind,
    value.message,
    stableJson(canonicalObservationDetail(value.detail ?? null)),
  ].join('\u0000');
}

function canonicalObservationDetail(detail) {
  if (!detail || typeof detail !== 'object' || typeof detail.locationUrl !== 'string')
    return detail;
  try {
    const location = new URL(detail.locationUrl);
    if (
      location.pathname.startsWith('/node_modules/.vite/deps/') &&
      location.searchParams.has('v')
    ) {
      location.searchParams.delete('v');
      return { ...detail, locationUrl: location.href };
    }
  } catch {
    return detail;
  }
  return detail;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function classifyObservations(
  observations,
  allowances,
  now = new Date(),
  activeScopes = new Set(),
  browserContract = null,
) {
  const allowanceErrors = validateAllowances(allowances, now);
  if (allowanceErrors.length > 0)
    return {
      allowed: [],
      correlated: [],
      infrastructure: [],
      unexpected: observations,
      allowanceErrors,
      infrastructureErrors: [],
    };
  const correlated = [];
  const resourceFailures = new Map();
  for (const observation of observations) {
    if (observation.kind !== 'browser.resource_failure') continue;
    const key = resourceFailureKey(observation, observation.detail?.url);
    resourceFailures.set(key, (resourceFailures.get(key) ?? 0) + 1);
  }
  let primaryObservations = observations.filter((observation) => {
    if (observation.kind !== 'browser.console' || !observation.detail?.locationUrl) return true;
    const key = resourceFailureKey(observation, observation.detail.locationUrl);
    const remaining = resourceFailures.get(key) ?? 0;
    if (remaining === 0) return true;
    resourceFailures.set(key, remaining - 1);
    correlated.push(observation);
    return false;
  });
  const infrastructure = [];
  const infrastructureErrors = [];
  if (browserContract) {
    const classified = classifyServerObservations(
      primaryObservations,
      browserContract.runtime,
      browserContract.declaration,
      browserContract.installedServerVersion,
    );
    primaryObservations = classified.remaining;
    infrastructure.push(...classified.owned);
    infrastructureErrors.push(...classified.errors);
  }
  const allowed = [];
  const unexpected = [];
  const observationsByKey = Object.groupBy(primaryObservations, observationKey);
  const allowedKeys = new Set();
  for (const [index, allowance] of allowances.entries()) {
    const key = observationKey(allowance);
    const matches = observationsByKey[key] ?? [];
    const scope = [allowance.runner, allowance.testId].join('\u0000');
    if (matches.length === 0 && !activeScopes.has(scope)) continue;
    if (matches.length === allowance.expectedCount) {
      allowedKeys.add(key);
      allowed.push(...matches);
    } else
      allowanceErrors.push(
        `allowances[${index}]:count_mismatch:expected_${allowance.expectedCount}:received_${matches.length}`,
      );
  }
  for (const observation of primaryObservations)
    if (!allowedKeys.has(observationKey(observation))) unexpected.push(observation);
  return {
    allowed,
    correlated,
    infrastructure,
    unexpected,
    allowanceErrors,
    infrastructureErrors,
  };
}

function resourceFailureKey(observation, url) {
  return [observation.runner, observation.testId, observation.detail?.pageId, url].join('\u0000');
}

export function validateBrowserRuntimeContract(runtime, installedServerVersion) {
  const errors = [];
  let baseURL;
  try {
    baseURL = new URL(runtime?.baseURL);
  } catch {
    errors.push('runtime:invalid_baseURL');
  }
  if (runtime?.server?.kind !== 'next-production') errors.push('runtime:invalid_server_kind');
  if (typeof runtime?.server?.version !== 'string' || runtime.server.version.length === 0)
    errors.push('runtime:invalid_server_version');
  else if (runtime.server.version !== installedServerVersion)
    errors.push(
      `runtime:server_version_mismatch:expected_${runtime.server.version}:received_${installedServerVersion}`,
    );
  if (runtime?.server?.hmrUpdates !== false) errors.push('runtime:hmr_updates_must_be_false');
  if (runtime?.server?.forwardConsole !== false)
    errors.push('runtime:forward_console_must_be_false');
  if (baseURL && baseURL.protocol !== 'http:' && baseURL.protocol !== 'https:')
    errors.push('runtime:invalid_baseURL_protocol');
  return errors;
}

export function classifyServerObservations(
  observations,
  runtime,
  declaration,
  installedServerVersion,
) {
  const errors = validateBrowserRuntimeContract(runtime, installedServerVersion);
  if (errors.length > 0) return { owned: [], remaining: observations, errors };
  if ((declaration?.serverFailures ?? []).length > 0)
    errors.push('server:next_production_server_failures_must_be_empty');
  return { owned: [], remaining: observations, errors };
}

export function verifyArtifactFiles(root, artifacts) {
  const verified = [];
  const errors = [];
  for (const artifact of artifacts) {
    const path = resolve(root, artifact.path);
    if (!existsSync(path)) {
      errors.push(`${artifact.path}:missing`);
      continue;
    }
    const stat = statSync(path);
    if (!stat.isFile()) {
      errors.push(`${artifact.path}:not_file`);
      continue;
    }
    if (!artifact.allowEmpty && stat.size === 0) {
      errors.push(`${artifact.path}:empty`);
      continue;
    }
    if (artifact.expectedBytes !== undefined && stat.size !== artifact.expectedBytes) {
      errors.push(
        `${artifact.path}:bytes:expected_${artifact.expectedBytes}:received_${stat.size}`,
      );
      continue;
    }
    if (artifact.format === 'json') {
      try {
        readJson(path);
      } catch (cause) {
        errors.push(
          `${artifact.path}:invalid_json:${cause instanceof Error ? cause.message : String(cause)}`,
        );
        continue;
      }
    }
    if (artifact.format === 'jsonl' && stat.size > 0) {
      try {
        readJsonLines(path);
      } catch (cause) {
        errors.push(
          `${artifact.path}:invalid_jsonl:${cause instanceof Error ? cause.message : String(cause)}`,
        );
        continue;
      }
    }
    const sha256 = sha256File(path);
    if (artifact.expectedSha256 !== undefined && sha256 !== artifact.expectedSha256) {
      errors.push(`${artifact.path}:sha256`);
      continue;
    }
    const {
      expectedBytes: _expectedBytes,
      expectedSha256: _expectedSha256,
      ...declaration
    } = artifact;
    verified.push({ ...declaration, bytes: stat.size, sha256 });
  }
  return { verified, errors };
}
