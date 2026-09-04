import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RUN_DIRECTORY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+-[0-9a-f]{6}$/;

export function planTestResultsCleanup(resultsDirectory, keep = 10) {
  if (!Number.isSafeInteger(keep) || keep < 1) throw new Error('keep must be a positive integer');
  if (!existsSync(resultsDirectory)) return { kept: [], removed: [], protected: [] };

  const candidates = readdirSync(resultsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RUN_DIRECTORY_PATTERN.test(entry.name))
    .map((entry) => ({ name: entry.name, outcome: readOutcome(resultsDirectory, entry.name) }))
    .sort((left, right) => right.name.localeCompare(left.name));
  const protectedRuns = candidates.filter(({ outcome }) => outcome === 'running');
  const protectedNames = new Set(protectedRuns.map(({ name }) => name));
  const completed = candidates.filter(({ name }) => !protectedNames.has(name));

  return {
    kept: completed.slice(0, keep).map(({ name }) => name),
    removed: completed.slice(keep).map(({ name }) => name),
    protected: protectedRuns.map(({ name }) => name),
  };
}

export function cleanTestResults(resultsDirectory, keep = 10) {
  const plan = planTestResultsCleanup(resultsDirectory, keep);
  const root = resolve(resultsDirectory);
  for (const name of plan.removed) {
    const target = resolve(root, name);
    if (dirname(target) !== root || !RUN_DIRECTORY_PATTERN.test(name))
      throw new Error(`refusing unsafe test result path: ${name}`);
    const stat = lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`refusing non-directory test result path: ${name}`);
    rmSync(target, { recursive: true });
  }
  return plan;
}

function readOutcome(resultsDirectory, name) {
  try {
    return JSON.parse(readFileSync(resolve(resultsDirectory, name, 'manifest.json'), 'utf8'))
      .outcome;
  } catch {
    return null;
  }
}
