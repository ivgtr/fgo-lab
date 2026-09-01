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
    if (typeof allowance?.kind === 'string' && !allowance.kind.includes('console'))
      errors.push(`${prefix}:non_console_allowance`);
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
  return [value.runner, value.testId, value.kind, value.message].join('\u0000');
}

export function classifyObservations(observations, allowances, now = new Date()) {
  const allowanceErrors = validateAllowances(allowances, now);
  if (allowanceErrors.length > 0) return { allowed: [], unexpected: observations, allowanceErrors };
  const allowed = [];
  const unexpected = [];
  const allowanceKeys = new Set(allowances.map(observationKey));
  for (const observation of observations)
    (allowanceKeys.has(observationKey(observation)) ? allowed : unexpected).push(observation);
  return { allowed, unexpected, allowanceErrors };
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
    verified.push({ ...artifact, bytes: stat.size, sha256: sha256File(path) });
  }
  return { verified, errors };
}
