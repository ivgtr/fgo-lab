import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const [baselineCommit, beforePath, afterPath, output, acceptancePath] = process.argv.slice(2);
if (!output)
  throw new Error(
    'usage: node scripts/compare-resource-audits.mjs <baseline commit> <before audit> <after audit> <output> [acceptance artifact]',
  );
const hash = (text) => createHash('sha256').update(text).digest('hex');
const beforeMasterText = execFileSync(
  'git',
  ['show', `${baselineCommit}:apps/web/public/master/master.json`],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
const afterMasterText = await readFile(
  'packages/test-fixtures/production-master/master.json',
  'utf8',
);
const beforeText = await readFile(beforePath, 'utf8');
const afterText = await readFile(afterPath, 'utf8');
const before = JSON.parse(beforeText),
  after = JSON.parse(afterText);
const beforeMaster = JSON.parse(beforeMasterText),
  afterMaster = JSON.parse(afterMasterText);

function effects(master) {
  const result = new Map();
  const add = (owner, kind, id, entries) =>
    entries.forEach((effect) =>
      result.set(JSON.stringify([owner, kind, id, effect.occurrenceId]), effect),
    );
  for (const servant of master.servants) {
    for (const kind of ['skills', 'passives'])
      for (const skill of servant[kind]) add(servant.id, kind, skill.id, skill.effects);
    for (const group of servant.noblePhantasmVariantGroups)
      for (const np of group.variants) add(servant.id, 'np', np.ref, np.effects);
  }
  for (const ce of master.craftEssences) add(ce.id, 'craftEssence', '', ce.effects);
  for (const code of master.mysticCodes)
    for (const skill of code.skills) add(code.id, 'mysticCode', skill.id, skill.effects);
  return result;
}
const oldEffects = effects(beforeMaster),
  newEffects = effects(afterMaster);
const normalization = [...newEffects].flatMap(([source, effect]) => {
  const previous = oldEffects.get(source);
  return JSON.stringify(previous?.execution) === JSON.stringify(effect.execution)
    ? []
    : [
        {
          source: JSON.parse(source),
          functionType: effect.atlasEvidence.functionType,
          before: previous?.execution ?? null,
          after: effect.execution,
        },
      ];
});
function numericChanges(category, previous, current) {
  const oldRecords = new Map(
    previous.records
      .filter(({ identity }) => identity.startsWith(`${category}:`))
      .map(({ identity, value }) => [identity, value]),
  );
  return current.records
    .filter(({ identity }) => identity.startsWith(`${category}:`))
    .flatMap(({ identity, value }) => {
      const old = oldRecords.get(identity);
      return old?.outcome?.status === 'calculated' &&
        value.outcome?.status === 'calculated' &&
        JSON.stringify(old.outcome) !== JSON.stringify(value.outcome)
        ? [
            {
              identity,
              before: { outcome: old.outcome, input: old.usedInput },
              after: { outcome: value.outcome, input: value.usedInput },
            },
          ]
        : [];
    });
}
const exclusions = (audit) =>
  audit.failures
    .filter(({ kind }) => kind === 'rankingFailure')
    .map(({ identity, reason }) => ({
      servant: JSON.parse(identity.slice('ranking:'.length))[0],
      reason,
    }));
const newlyAdmitted = new Set(
  exclusions(before)
    .filter(({ servant }) => !exclusions(after).some((item) => item.servant === servant))
    .map(({ servant }) => servant),
);
const acceptanceText = acceptancePath ? await readFile(acceptancePath, 'utf8') : null;
const evidence = {
  ...(acceptanceText
    ? {
        acceptance: {
          path: acceptancePath,
          sha256: hash(acceptanceText),
          records: JSON.parse(acceptanceText),
        },
      }
    : {}),
  command: ['node', 'scripts/compare-resource-audits.mjs', ...process.argv.slice(2)],
  baselineCommit,
  before: {
    path: beforePath,
    sha256: hash(beforeText),
    masterHash: hash(beforeMasterText),
    inventory: before.inventory,
  },
  after: {
    path: afterPath,
    sha256: hash(afterText),
    masterHash: hash(afterMasterText),
    inventory: after.inventory,
  },
  normalization,
  calculatorNumericChanges: numericChanges('calculator', before, after),
  rankingNumericChanges: numericChanges('ranking', before, after),
  rankingNewlyCalculated: after.records
    .filter(
      ({ identity, value }) =>
        identity.startsWith('ranking:') &&
        newlyAdmitted.has(JSON.parse(identity.slice('ranking:'.length))[0]) &&
        value.outcome?.status === 'calculated',
    )
    .map(({ identity, value }) => ({
      identity,
      outcome: value.outcome,
      input: value.usedInput,
      policy: value.policy,
    })),
  rankingExclusions: { before: exclusions(before), after: exclusions(after) },
  interpretation: {
    comparison:
      'Matched calculator/ranking identities compare canonical outcomes and used inputs. Newly admitted ranking identities are represented by the exclusion delta; selected policy/variant details remain in the application audit.',
    scope:
      'Normalization changes describe canonical execution only. The companion flow note provides governing rules, acceptance fixtures, recovery paths and remaining scope; this artifact does not certify whole-task closure.',
  },
};
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    normalizedExecutions: normalization.length,
    calculatorNumericChanges: evidence.calculatorNumericChanges.map(({ identity }) => identity),
  }),
);
