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
    stableJson(value.detail ?? null),
  ].join('\u0000');
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
      browserContract.installedViteVersion,
      activeScopes,
      browserContract.binaryViteVersion,
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

export function validateBrowserRuntimeContract(
  runtime,
  installedViteVersion,
  binaryViteVersion = installedViteVersion,
) {
  const errors = [];
  let baseURL;
  try {
    baseURL = new URL(runtime?.baseURL);
  } catch {
    errors.push('runtime:invalid_baseURL');
  }
  if (runtime?.server?.kind !== 'vite-dev') errors.push('runtime:invalid_server_kind');
  if (typeof runtime?.server?.version !== 'string' || runtime.server.version.length === 0)
    errors.push('runtime:invalid_server_version');
  else if (runtime.server.version !== installedViteVersion)
    errors.push(
      `runtime:vite_version_mismatch:expected_${runtime.server.version}:received_${installedViteVersion}`,
    );
  if (runtime?.server?.version && runtime.server.version !== binaryViteVersion)
    errors.push(
      `runtime:vite_binary_version_mismatch:expected_${runtime.server.version}:received_${binaryViteVersion}`,
    );
  for (const field of ['clientPath', 'webSocketPath']) {
    const value = runtime?.server?.[field];
    if (typeof value !== 'string' || !value.startsWith('/'))
      errors.push(`runtime:invalid_${field}`);
  }
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
  installedViteVersion,
  activeScopes = new Set(),
  binaryViteVersion = installedViteVersion,
) {
  const errors = validateBrowserRuntimeContract(runtime, installedViteVersion, binaryViteVersion);
  if (errors.length > 0) return { owned: [], remaining: observations, errors };

  const expectations = serverExpectations(declaration, runtime);
  for (const expectation of expectations)
    if (expectation.family === 'invalid') errors.push(`server:${expectation.identity}`);
  if (errors.length > 0) return { owned: [], remaining: observations, errors };
  const candidatesByKey = new Map();
  const lifecycleEvents = [];
  const socketEvents = [];
  for (const observation of observations) {
    const candidate = serverCandidate(observation, runtime);
    if (!candidate) continue;
    const matches = candidatesByKey.get(candidate.key) ?? [];
    matches.push(observation);
    candidatesByKey.set(candidate.key, matches);
    if (candidate.family === 'console.lifecycle') lifecycleEvents.push(observation);
    if (candidate.family === 'websocket') socketEvents.push(observation);
  }

  errors.push(...validateViteLifecycleOrder(lifecycleEvents));
  errors.push(...validateWebSocketOrder(socketEvents));
  const observedScopes = new Set(
    observations.map(({ runner, testId }) => `${runner}\u0000${testId}`),
  );
  const owned = [];
  const ownedSet = new Set();
  const acceptedWebSocketFailures = [];
  for (const expectation of expectations.filter(({ family }) => family !== 'console.exact')) {
    const scope = `playwright\u0000${expectation.testId}`;
    if (!activeScopes.has(scope) && !observedScopes.has(scope)) continue;
    const matches = candidatesByKey.get(expectation.key) ?? [];
    if (matches.length !== expectation.expectedCount) {
      errors.push(
        `server:${expectation.identity}:count_mismatch:expected_${expectation.expectedCount}:received_${matches.length}`,
      );
      continue;
    }
    for (const observation of matches) {
      owned.push(observation);
      ownedSet.add(observation);
      if (expectation.event === 'webSocketError') acceptedWebSocketFailures.push(observation);
    }
  }
  const exactExpectations = [
    ...expectations.filter(({ family }) => family === 'console.exact'),
    ...webSocketNotificationExpectations(acceptedWebSocketFailures, runtime),
  ];
  const observationsByKey = Object.groupBy(observations, observationKey);
  for (const expectation of exactExpectations) {
    const scope = `playwright\u0000${expectation.testId}`;
    if (!activeScopes.has(scope) && !observedScopes.has(scope)) continue;
    const matches = observationsByKey[expectation.key] ?? [];
    if (matches.length !== expectation.expectedCount) {
      errors.push(
        `server:${expectation.identity}:count_mismatch:expected_${expectation.expectedCount}:received_${matches.length}`,
      );
      continue;
    }
    for (const observation of matches) {
      owned.push(observation);
      ownedSet.add(observation);
    }
  }
  return {
    owned,
    remaining: observations.filter((observation) => !ownedSet.has(observation)),
    errors,
  };
}

function serverExpectations(declaration, runtime) {
  const { baseURL } = runtime;
  const failures = new Map(
    (declaration?.serverFailures ?? []).map((failure) => [
      serverPageKey(failure.testId, new URL(failure.path, baseURL).href, failure.pageId),
      failure,
    ]),
  );
  const expectations = [];
  for (const { testId, pages } of declaration?.pageLoads ?? [])
    for (const page of pages) {
      const pageUrl = new URL(page.path, baseURL).href;
      const pageId = page.pageId ?? 'page-1';
      const failure = failures.get(serverPageKey(testId, pageUrl, pageId));
      if (failure) {
        const allowedFields = new Set([
          'testId',
          'path',
          'pageId',
          'connecting',
          'connected',
          'webSocketOpen',
          'webSocketClose',
          'webSocketFailures',
          'consoleFailures',
        ]);
        for (const field of Object.keys(failure))
          if (!allowedFields.has(field))
            expectations.push(invalidServerExpectation(testId, `unknown_failure_field_${field}`));
      }
      const counts = failure ?? {
        connecting: page.count,
        connected: page.count,
        webSocketOpen: page.count,
        webSocketClose: 0,
        webSocketFailures: [],
        consoleFailures: [],
      };
      for (const [event, expectedCount] of Object.entries({
        connecting: counts.connecting,
        connected: counts.connected,
        webSocketOpen: counts.webSocketOpen,
        webSocketClose: counts.webSocketClose,
      })) {
        const family = event.startsWith('webSocket') ? 'websocket' : 'console.lifecycle';
        expectations.push({
          key: serverEventKey(testId, pageUrl, pageId, event),
          testId,
          pageUrl,
          pageId,
          event,
          family,
          expectedCount,
          identity: `${testId}:${pageId}:${pageUrl}:${event}`,
        });
      }
      const webSocketFailures = exactFailureDeclarations(
        counts.webSocketFailures,
        testId,
        'websocket_failures',
        expectations,
      );
      for (const [index, expected] of webSocketFailures.entries()) {
        if (
          !hasExactKeys(expected, ['message', 'count']) ||
          typeof expected?.message !== 'string' ||
          expected.message.length === 0 ||
          !Number.isSafeInteger(expected.count) ||
          expected.count <= 0
        ) {
          expectations.push(invalidServerExpectation(testId, `websocket_failure_${index}`));
          continue;
        }
        expectations.push({
          key: serverEventKey(testId, pageUrl, pageId, 'webSocketError', expected.message),
          testId,
          pageUrl,
          pageId,
          event: 'webSocketError',
          family: 'websocket',
          expectedCount: expected.count,
          identity: `${testId}:${pageId}:${pageUrl}:webSocketError:${expected.message}`,
        });
      }
      const consoleFailures = exactFailureDeclarations(
        counts.consoleFailures,
        testId,
        'console_failures',
        expectations,
      );
      for (const [index, expected] of consoleFailures.entries()) {
        if (
          !hasExactKeys(expected, ['kind', 'count']) ||
          expected?.kind !== 'vite_connection_failure' ||
          !Number.isSafeInteger(expected.count) ||
          expected.count <= 0
        ) {
          expectations.push(invalidServerExpectation(testId, `console_failure_${index}`));
          continue;
        }
        const observation = viteConsoleObservation(
          testId,
          pageUrl,
          pageId,
          viteConnectionFailureMessage(runtime),
          runtime,
        );
        expectations.push({
          key: observationKey(observation),
          testId,
          family: 'console.exact',
          expectedCount: expected.count,
          identity: `${testId}:${pageId}:${pageUrl}:${expected.kind}`,
        });
      }
      failures.delete(serverPageKey(testId, pageUrl, pageId));
    }
  for (const failure of failures.values())
    expectations.push({
      key: `invalid:${failure.testId}`,
      testId: failure.testId,
      family: 'invalid',
      expectedCount: 0,
      identity: `${failure.testId}:failure_without_page_load`,
    });
  return expectations;
}

function exactFailureDeclarations(value, testId, field, expectations) {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  expectations.push(invalidServerExpectation(testId, `${field}_not_array`));
  return [];
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function invalidServerExpectation(testId, reason) {
  return {
    key: `invalid:${testId}:${reason}`,
    testId,
    family: 'invalid',
    expectedCount: 0,
    identity: `${testId}:${reason}`,
  };
}

function serverCandidate(observation, runtime) {
  const pageUrl =
    observation.kind === 'browser.websocket'
      ? observation.detail?.pageUrl
      : observation.detail?.url;
  const pageId = observation.detail?.pageId;
  if (typeof pageUrl !== 'string' || typeof pageId !== 'string') return null;
  if (observation.kind === 'browser.console' && isViteClientLocation(observation, runtime)) {
    if (observation.detail.type === 'debug' && observation.message === '[vite] connecting...')
      return {
        key: serverEventKey(observation.testId, pageUrl, pageId, 'connecting'),
        family: 'console.lifecycle',
      };
    if (observation.detail.type === 'debug' && observation.message === '[vite] connected.')
      return {
        key: serverEventKey(observation.testId, pageUrl, pageId, 'connected'),
        family: 'console.lifecycle',
      };
    return null;
  }
  if (observation.kind !== 'browser.websocket' || !isServerWebSocket(observation, runtime))
    return null;
  const event =
    observation.detail.phase === 'open'
      ? 'webSocketOpen'
      : observation.detail.phase === 'error'
        ? 'webSocketError'
        : observation.detail.phase === 'close'
          ? 'webSocketClose'
          : null;
  return event
    ? {
        key: serverEventKey(
          observation.testId,
          pageUrl,
          pageId,
          event,
          event === 'webSocketError' ? observation.message : undefined,
        ),
        family: 'websocket',
      }
    : null;
}

function isViteClientLocation(observation, runtime) {
  try {
    const location = new URL(observation.detail.locationUrl);
    const base = new URL(runtime.baseURL);
    return location.origin === base.origin && location.pathname === runtime.server.clientPath;
  } catch {
    return false;
  }
}

function isServerWebSocket(observation, runtime) {
  try {
    const socket = new URL(observation.detail.url);
    const base = new URL(runtime.baseURL);
    return (
      (socket.protocol === 'ws:' || socket.protocol === 'wss:') &&
      socket.host === base.host &&
      socket.pathname === runtime.server.webSocketPath
    );
  } catch {
    return false;
  }
}

function validateViteLifecycleOrder(observations) {
  const errors = [];
  const states = new Map();
  for (const observation of observations) {
    const identity = `${observation.testId}:${observation.detail.pageId}`;
    const state = states.get(identity) ?? 'idle';
    if (observation.message === '[vite] connecting...') {
      if (state === 'connecting') errors.push(`server:${identity}:duplicate_connecting`);
      states.set(identity, 'connecting');
    } else if (state !== 'connecting')
      errors.push(`server:${identity}:connected_without_connecting`);
    else states.set(identity, 'connected');
  }
  return errors;
}

function validateWebSocketOrder(observations) {
  const errors = [];
  const states = new Map();
  for (const observation of observations) {
    const identity = `${observation.testId}:${observation.detail.socketId}`;
    const state = states.get(identity) ?? 'idle';
    if (observation.detail.phase === 'open') {
      if (state !== 'idle') errors.push(`server:${identity}:duplicate_websocket_open`);
      states.set(identity, 'open');
    } else if (observation.detail.phase === 'error') {
      if (state !== 'open') errors.push(`server:${identity}:websocket_error_without_open`);
      states.set(identity, 'error');
    } else if (observation.detail.phase === 'close') {
      if (state !== 'open' && state !== 'error')
        errors.push(`server:${identity}:websocket_close_without_open`);
      states.set(identity, 'closed');
    }
  }
  return errors;
}

function webSocketNotificationExpectations(webSocketFailures, runtime) {
  const expectations = new Map();
  for (const failure of webSocketFailures) {
    const message = `WebSocket connection to '${failure.detail.url}' failed: ${failure.message}`;
    const observation = viteConsoleObservation(
      failure.testId,
      failure.detail.pageUrl,
      failure.detail.pageId,
      message,
      runtime,
    );
    const key = observationKey(observation);
    const existing = expectations.get(key);
    if (existing) existing.expectedCount += 1;
    else
      expectations.set(key, {
        key,
        testId: failure.testId,
        family: 'console.exact',
        expectedCount: 1,
        identity: `${failure.testId}:${failure.detail.pageId}:${failure.detail.pageUrl}:websocket_browser_notification:${failure.detail.url}:${failure.message}`,
      });
  }
  return [...expectations.values()];
}

export function viteConnectionFailureMessage(runtime) {
  const base = new URL(runtime.baseURL);
  const target = `${base.host}${base.pathname}`;
  return `[vite] failed to connect to websocket.\nyour current setup:\n  (browser) ${target} <--[HTTP]--> ${target} (server)\n  (browser) ${target} <--[WebSocket (failing)]--> ${target} (server)\nCheck out your Vite / network configuration and https://vite.dev/config/server-options.html#server-hmr .`;
}

function viteConsoleObservation(testId, pageUrl, pageId, message, runtime) {
  return {
    runner: 'playwright',
    testId,
    kind: 'browser.console',
    message,
    detail: {
      type: 'error',
      url: pageUrl,
      locationUrl: new URL(runtime.server.clientPath, runtime.baseURL).href,
      pageId,
    },
  };
}

function serverPageKey(testId, pageUrl, pageId) {
  return [testId, pageUrl, pageId].join('\u0000');
}

function serverEventKey(testId, pageUrl, pageId, event, message) {
  return [testId, pageUrl, pageId, event, message ?? ''].join('\u0000');
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
