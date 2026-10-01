import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const [checkoutArgument, receiptArgument] = process.argv.slice(2);
assert.ok(
  checkoutArgument && receiptArgument,
  'usage: production-baseline-isolation.mjs <new-checkout-root> <receipt>',
);
const checkout = path.resolve(checkoutArgument);
fs.mkdirSync(checkout);
const include = (filename) =>
  !path.basename(filename).startsWith('.') && !filename.endsWith('.tsbuildinfo');
const packages = [
  'calculation-application',
  'master-data',
  'schema',
  'battle-execution',
  'calc-core',
  'data-pipeline',
  'profile-domain',
  'test-fixtures',
];
for (const name of packages) {
  fs.mkdirSync(path.join(checkout, 'packages', name), { recursive: true });
  for (const relative of ['src', 'package.json', 'tsconfig.json']) {
    const file = path.join(root, 'packages', name, relative);
    if (fs.existsSync(file))
      fs.cpSync(file, path.join(checkout, 'packages', name, relative), {
        recursive: true,
        filter: include,
      });
  }
  const dependencies = path.join(root, 'packages', name, 'node_modules');
  if (fs.existsSync(dependencies))
    fs.symlinkSync(dependencies, path.join(checkout, 'packages', name, 'node_modules'));
}
for (const relative of [
  'packages/calculation-application/scripts',
  'packages/calculation-application/baselines',
  'packages/test-fixtures/master',
  'scripts',
  'docs/evidence/tsk-06-5-production-closure.json',
  'apps/web/public/master',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
])
  fs.cpSync(path.join(root, relative), path.join(checkout, relative), {
    recursive: true,
    filter: include,
  });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'));
const guard = path.join(checkout, 'deny-original-runs.mjs');
fs.writeFileSync(
  guard,
  `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=${JSON.stringify(checkout)};const log=path.join(root,'original-run-access.jsonl');
function check(value,operation){const p=path.resolve(value instanceof URL?fileURLToPath(value):String(value));if(p.includes('/.test-results/')&&!p.startsWith(root+'/')){fs.appendFileSync(log,JSON.stringify({operation,path:p})+'\\n');throw new Error('original_run_access_forbidden:'+p);}}
for(const name of ['readFileSync','openSync','statSync','lstatSync','existsSync']){const original=fs[name];fs[name]=function(value,...args){check(value,name);return original.call(this,value,...args);};}
for(const name of ['readFile','open','stat','lstat']){const original=fs.promises[name];fs.promises[name]=function(value,...args){check(value,name);return original.call(this,value,...args);};}
syncBuiltinESMExports();\n`,
);
const loader = path.join(checkout, 'packages/data-pipeline/node_modules/tsx/dist/loader.mjs');
const results = [];
for (const [name, script, args] of [
  ['replay', 'replay-production-baseline.ts', [path.join(checkout, 'actual')]],
  ['merge', 'merge-oc-matrix.ts', [path.join(checkout, 'actual')]],
]) {
  const started = performance.now();
  const p = spawnSync(
    process.execPath,
    [
      '--import',
      guard,
      '--import',
      loader,
      path.join(checkout, 'packages/calculation-application/scripts', script),
      ...args,
    ],
    { cwd: checkout, encoding: 'utf8' },
  );
  fs.writeFileSync(path.join(checkout, `${name}.stdout.log`), p.stdout ?? '');
  fs.writeFileSync(path.join(checkout, `${name}.stderr.log`), p.stderr ?? '');
  assert.equal(p.status, 0, `${name}:${p.stderr}`);
  results.push({ name, exit: p.status, elapsedMs: performance.now() - started });
}
const accesses = path.join(checkout, 'original-run-access.jsonl');
assert.ok(!fs.existsSync(accesses));
const manifest = JSON.parse(fs.readFileSync(path.join(checkout, 'actual/manifest.json')));
assert.equal(manifest.audit.outcomeCount, 34640);
assert.equal(manifest.canonicalRecords.comparison.status, 'passed');
assert.deepEqual(manifest.artifactVerification.errors, []);
fs.writeFileSync(
  receiptArgument,
  JSON.stringify(
    {
      status: 'passed',
      checkout,
      originalRunReads: 0,
      results,
      qualification:
        'Dependencies shared with installed checkout; source, published master, baseline and replay fixture copied without any local run. Replay verifies saved-body acceptance, not fresh damage execution.',
      digest: manifest.audit.digest,
      eligibilityDigest: manifest.audit.eligibility.candidates.digest,
      source: manifest.canonicalRecords.reference,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ status: 'passed', originalRunReads: 0, records: 34640, checkout }));
