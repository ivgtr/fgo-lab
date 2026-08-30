#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const check = process.argv.includes('--check');

const expectedDigests = {
  semanticInventory: '5da30c87c74e36e1e9ca0ae7f4686df88259c8c3d6aa99cc2ec05650609d55d4',
  testFiles: '71ffa6f7835799adbcdb306eb3484c2796c61b2e453414840547e59f54453e3b',
  testNames: '756e5e31d206bc4632df25da0fd2728fbd198a94603dca4bd858f0f633259251',
  productionTestFiles: '9e41dfb41717969164eecf360a4b2cea683ea3b5b8a9bad9f6f31b29f8e4205f',
  unitFixtureTestFiles: 'ab41b9743b90a6050fc9cac8f372a2edc4d320e5d855d7819f26be847570fbe0',
  pngBaselines: '537f27408450edaa6d0bc96e134e16751f7c7f0c00e8f788525fd56f99cbcee6',
  resourceOccurrences: '20480d1c70b0537bf89e40d902f783af94814a85e349fd358f21f25f4f968e71',
  resourceInventory: 'fc183b614f6a36cc5c3a21d5933017fd2798939a61974b3a6f862af2cac68529',
  stableArtifact: 'c82e0fbc3ecfc7129358fbcf3def4e33528aadb9d9ac30cd4ca47e3e3dfa95ef',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedPath(path) {
  return relative(root, path).split(sep).join('/');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function lineDigest(lines) {
  return sha256(`${lines.join('\n')}\n`);
}

function listFiles(directory, predicate = () => true) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path, predicate) : predicate(path) ? [path] : [];
    })
    .sort((left, right) => compareText(normalizedPath(left), normalizedPath(right)));
}

function fileStats(files) {
  const paths = files.map(normalizedPath);
  return {
    files: paths.length,
    lines: files.reduce((total, file) => total + readFileSync(file, 'utf8').split(/\n/).length, 0),
    bytes: files.reduce((total, file) => total + statSync(file).size, 0),
    digest: lineDigest(paths),
    contentDigest: lineDigest(
      files.map((file) => `${normalizedPath(file)}\t${sha256(readFileSync(file))}`),
    ),
  };
}

function sourceStats(files, tests) {
  const paths = new Set(files.map(normalizedPath));
  return {
    ...fileStats(files),
    tests: tests.filter(({ file }) => paths.has(file)).length,
  };
}

function fileIdentity(path) {
  const content = readFileSync(path);
  return {
    path: normalizedPath(path),
    bytes: content.length,
    sha256: sha256(content),
  };
}

function collectTests() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'fgo-lab-tsk00-'));
  const vitestPath = join(temporaryDirectory, 'vitest-list.json');
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'list', `--json=${vitestPath}`], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const tests = JSON.parse(readFileSync(vitestPath, 'utf8'))
      .map(({ file, name }) => ({ file: normalizedPath(file), name }))
      .sort(
        (left, right) => compareText(left.file, right.file) || compareText(left.name, right.name),
      );
    const testFiles = sortedUnique(tests.map(({ file }) => file)).map((path) =>
      resolve(root, path),
    );
    const productionTestFiles = testFiles.filter((path) =>
      /public\/master\/master\.json/.test(readFileSync(path, 'utf8')),
    );
    const productionPaths = new Set(productionTestFiles.map(normalizedPath));
    const unitFixtureTestFiles = testFiles.filter(
      (path) => !productionPaths.has(normalizedPath(path)),
    );
    return {
      tests,
      testFiles,
      productionTestFiles,
      unitFixtureTestFiles,
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function collectEffects(master) {
  const effects = [];
  const add = (ownerKind, ownerId, sourceKind, sourceId, sourceEffects) => {
    for (const effect of sourceEffects)
      effects.push({ ownerKind, ownerId, sourceKind, sourceId, effect });
  };
  for (const servant of master.servants) {
    for (const skill of servant.skills)
      add('servant', servant.id, 'skill', skill.id, skill.effects);
    for (const passive of servant.passives)
      add('servant', servant.id, 'passive', passive.id, passive.effects);
    for (const variant of servant.noblePhantasmVariantGroups.flatMap(({ variants }) => variants))
      add('servant', servant.id, 'noblePhantasm', JSON.stringify(variant.ref), variant.effects);
  }
  for (const craftEssence of master.craftEssences)
    add('craftEssence', craftEssence.id, 'craftEssence', craftEssence.id, craftEssence.effects);
  for (const mysticCode of master.mysticCodes)
    for (const skill of mysticCode.skills)
      add('mysticCode', mysticCode.id, 'skill', skill.id, skill.effects);
  return effects;
}

function collectSemanticInventory(master, effects) {
  const variants = master.servants.flatMap((servant) =>
    servant.noblePhantasmVariantGroups.flatMap(({ variants: groupVariants }) => groupVariants),
  );
  return {
    version: master.version,
    servants: master.servants.length,
    craftEssences: master.craftEssences.length,
    mysticCodes: master.mysticCodes.length,
    effects: effects.length,
    executionKinds: sortedCounts(
      effects.flatMap(({ effect }) => effect.execution.map(({ kind }) => kind)),
    ),
    procKinds: sortedCounts(effects.map(({ effect }) => effect.proc.kind)),
    procSelectionKinds: sortedCounts(effects.map(({ effect }) => effect.procSelection.kind)),
    interactionKinds: sortedCounts(effects.map(({ effect }) => effect.interaction?.kind ?? 'none')),
    quantityConditionFamilies: sortedCounts(
      effects.flatMap(({ effect }) => effect.quantityConditions.map(({ quantity }) => quantity)),
    ),
    rawConditionOperators: sortedCounts(
      effects.flatMap(({ effect }) => [
        ...effect.conditions.recipient.map(({ operator }) => operator),
        effect.conditions.holder.operator,
        effect.conditions.opponent.operator,
        effect.conditions.field.operator,
      ]),
    ),
    damageKinds: sortedCounts(
      variants.flatMap((variant) =>
        variant.kind === 'attack' ? variant.damage.map(({ kind }) => kind) : [],
      ),
    ),
  };
}

const resourceFunctionClassification = new Map([
  ['gainMultiplyNp', { resource: 'npGauge', direction: 'gain' }],
  ['gainNp', { resource: 'npGauge', direction: 'gain' }],
  ['gainNpBuffIndividualSum', { resource: 'npGauge', direction: 'gain' }],
  ['gainNpFromTargets', { resource: 'npGauge', direction: 'gain' }],
  ['gainNpIndividualSum', { resource: 'npGauge', direction: 'gain' }],
  ['gainNpTargetSum', { resource: 'npGauge', direction: 'gain' }],
  ['lossNp', { resource: 'npGauge', direction: 'loss' }],
  ['absorbNpturn', { resource: 'enemyNpTurn', direction: 'absorb' }],
  ['delayNpturn', { resource: 'enemyNpTurn', direction: 'delay' }],
  ['hastenNpturn', { resource: 'enemyNpTurn', direction: 'hasten' }],
  ['addBattlePoint', { resource: 'battlePoint', direction: 'gain' }],
  ['subBattlePoint', { resource: 'battlePoint', direction: 'loss' }],
]);

function collectResourceInventory(master, effects) {
  const resourceCandidates = effects.filter(({ effect }) => {
    const type = effect.atlasEvidence.functionType;
    return !type.startsWith('damageNp') && /(Np|BattlePoint)/.test(type);
  });
  const occurrences = resourceCandidates
    .map(({ ownerKind, ownerId, sourceKind, sourceId, effect }) => {
      const classification = resourceFunctionClassification.get(effect.atlasEvidence.functionType);
      const parameters = effect.atlasEvidence.parameterSets.flat();
      const parameterKeys = sortedUnique(parameters.flatMap((parameter) => Object.keys(parameter)));
      const rawValues = sortedUnique(
        parameters.flatMap(({ Value }) => (typeof Value === 'number' ? [Value] : [])),
      ).sort((left, right) => left - right);
      const amountShape =
        rawValues.length > 0
          ? 'rawValueSeries'
          : parameterKeys.includes('DependFunc')
            ? 'dependentFunction'
            : parameterKeys.includes('BattlePointValue')
              ? 'battlePointValue'
              : 'unknown';
      return {
        ownerKind,
        ownerId,
        sourceKind,
        sourceId,
        occurrenceId: effect.occurrenceId,
        functionType: effect.atlasEvidence.functionType,
        resource: classification?.resource ?? 'unclassified',
        direction: classification?.direction ?? 'unclassified',
        target: effect.atlasEvidence.target,
        timing: effect.timing ?? 'none',
        gameActivation: effect.gameActivation,
        amountShape,
        parameterKeys,
        rawValues,
        unresolvedSemanticKeys: [...effect.atlasEvidence.unresolvedSemanticKeys].sort(),
        executionKinds: effect.execution.map(({ kind }) => kind).sort(),
      };
    })
    .sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));

  const variants = master.servants.flatMap((servant) =>
    servant.noblePhantasmVariantGroups.flatMap(({ variants: groupVariants }) => groupVariants),
  );
  const attackVariants = variants.filter(({ kind }) => kind === 'attack');
  const damageSpecs = attackVariants.flatMap(({ damage }) => damage);
  const attackCapableServants = master.servants.filter((servant) =>
    servant.noblePhantasmVariantGroups.some(({ variants: groupVariants }) =>
      groupVariants.some(({ kind }) => kind === 'attack'),
    ),
  );
  const npGauge = occurrences.filter(({ resource }) => resource === 'npGauge');
  const consumption = npGauge.filter(({ direction }) => direction === 'loss');
  const knownTargets = new Set([
    'enemy',
    'enemyAll',
    'ptAll',
    'ptOne',
    'ptOther',
    'ptSelfAnotherFirst',
    'self',
  ]);
  const rankingContracts = readFileSync(
    resolve(root, 'packages/calculation-application/src/rankingContracts.ts'),
    'utf8',
  );
  const standardOvercharge = Number(
    /STANDARD_RANKING_SCENARIO_POLICY\s*=\s*\{[\s\S]*?overcharge:\s*(\d+)/.exec(
      rankingContracts,
    )?.[1] ?? Number.NaN,
  );

  const inventory = {
    candidateOccurrences: occurrences.length,
    classifiedOccurrences: occurrences.filter(({ resource }) => resource !== 'unclassified').length,
    unclassifiedOccurrences: occurrences.filter(({ resource }) => resource === 'unclassified')
      .length,
    unclassifiedFunctionTypes: sortedUnique(
      occurrences
        .filter(({ resource }) => resource === 'unclassified')
        .map(({ functionType }) => functionType),
    ),
    byResource: sortedCounts(occurrences.map(({ resource }) => resource)),
    byFunctionType: sortedCounts(occurrences.map(({ functionType }) => functionType)),
    byTarget: sortedCounts(occurrences.map(({ target }) => target)),
    bySourceKind: sortedCounts(occurrences.map(({ sourceKind }) => sourceKind)),
    byTiming: sortedCounts(occurrences.map(({ timing }) => timing)),
    amountShape: sortedCounts(occurrences.map(({ amountShape }) => amountShape)),
    executionKinds: sortedCounts(occurrences.flatMap(({ executionKinds }) => executionKinds)),
    unknownTargetOccurrences: occurrences.filter(({ target }) => !knownTargets.has(target)).length,
    unresolvedSemanticKeyOccurrences: occurrences.filter(
      ({ unresolvedSemanticKeys }) => unresolvedSemanticKeys.length > 0,
    ).length,
    nonDamageOnlyOccurrences: occurrences.filter(
      ({ executionKinds }) => executionKinds.length === 1 && executionKinds[0] === 'nonDamage',
    ).length,
    npGauge: {
      occurrences: npGauge.length,
      byDirection: sortedCounts(npGauge.map(({ direction }) => direction)),
      byTarget: sortedCounts(npGauge.map(({ target }) => target)),
      rawValueSeriesOccurrences: npGauge.filter(
        ({ amountShape }) => amountShape === 'rawValueSeries',
      ).length,
      dependentFunctionOccurrences: npGauge.filter(
        ({ amountShape }) => amountShape === 'dependentFunction',
      ).length,
      canonicalUnitClassifiedOccurrences: 0,
      canonicalUnitUnclassifiedOccurrences: npGauge.length,
    },
    consumption: {
      occurrences: consumption.length,
      byTarget: sortedCounts(consumption.map(({ target }) => target)),
      rawNumericValueSeriesOccurrences: consumption.filter(
        ({ amountShape }) => amountShape === 'rawValueSeries',
      ).length,
      explicitAllConsumptionMarkerOccurrences: 0,
      canonicalFixedConsumptionOccurrences: 0,
      canonicalAllConsumptionOccurrences: 0,
      canonicalConsumptionModeUnclassifiedOccurrences: consumption.length,
    },
    capacity: {
      attackCapableServants: attackCapableServants.length,
      canonicalCapacityOccurrences: 0,
      canonicalCapacityUnclassifiedServants: attackCapableServants.length,
    },
    noblePhantasmUse: {
      variants: variants.length,
      attackVariants: attackVariants.length,
      nonAttackVariants: variants.length - attackVariants.length,
      canonicalResourceSpendOperations: 0,
      canonicalResourceSpendUnclassifiedVariants: variants.length,
    },
    overcharge: {
      standardRankingPolicy: standardOvercharge,
      damageSpecs: damageSpecs.length,
      completeFiveByFiveDamageMatrices: damageSpecs.filter(
        ({ parametersByOvercharge }) =>
          parametersByOvercharge.length === 5 &&
          parametersByOvercharge.every((parameters) => parameters.length === 5),
      ).length,
      incompleteDamageMatrices: damageSpecs.filter(
        ({ parametersByOvercharge }) =>
          parametersByOvercharge.length !== 5 ||
          parametersByOvercharge.some((parameters) => parameters.length !== 5),
      ).length,
      canonicalResourceDerivedOverchargeVariants: 0,
      canonicalResourceDerivedOverchargeUnclassifiedVariants: variants.length,
    },
  };
  return { inventory, occurrences };
}

function collectPlaywrightInventory() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--list', '--project=chromium', '--project=mobile-chromium'],
    { cwd: root, encoding: 'utf8' },
  );
  const match = /Total:\s+(\d+) tests in (\d+) files/.exec(output);
  if (!match) throw new TypeError('playwright_inventory_summary_missing');
  return { projectCases: Number(match[1]), files: Number(match[2]) };
}

const masterPath = resolve(root, 'apps/web/public/master/master.json');
const masterContent = readFileSync(masterPath);
const master = JSON.parse(masterContent.toString('utf8'));
const effects = collectEffects(master);
const semanticInventory = collectSemanticInventory(master, effects);
const resource = collectResourceInventory(master, effects);
const collectedTests = collectTests();
const testFiles = collectedTests.testFiles.map(normalizedPath);
const testNames = collectedTests.tests.map(({ name }) => name).sort(compareText);
const playwrightSourceFiles = listFiles(resolve(root, 'e2e'), (path) => path.endsWith('.spec.ts'));
const pngFiles = listFiles(resolve(root, 'e2e'), (path) => path.endsWith('.png'));
const pngEntries = pngFiles.map((path) => `${normalizedPath(path)}\t${sha256(readFileSync(path))}`);
const loadReferences = collectedTests.testFiles.flatMap((path) => {
  const matches = readFileSync(path, 'utf8').match(/public\/master\/master\.json/g);
  return Array.from({ length: matches?.length ?? 0 }, () => normalizedPath(path));
});

const contractFilePaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  'package.json',
  'playwright.config.ts',
  'scripts/test-runner-lib.mjs',
  'scripts/test-runner.mjs',
  'scripts/test-runner.test.mjs',
  'vitest.config.ts',
  'packages/calculation-application/src/attackProfile.ts',
  'packages/calculation-application/src/conditionProvenance.ts',
  'packages/calculation-application/src/executionBaselineInventory.test.ts',
  'packages/calculation-application/src/__snapshots__/executionBaselineInventory.test.ts.snap',
  'packages/calculation-application/src/productionExecutionParity.test.ts',
  'packages/calculation-application/src/productionMasterAudit.test.ts',
  'packages/calculation-application/src/productionMasterInventory.test.ts',
  'packages/calculation-application/src/rankingConditionInventory.test.ts',
  'packages/calculation-application/src/rankingContracts.ts',
  'packages/calculation-application/src/rankingProduction.test.ts',
  'packages/calculation-application/src/specialInputInventory.test.ts',
].sort(compareText);
const contractFiles = contractFilePaths.map((path) => fileIdentity(resolve(root, path)));

const inventoryDigests = {
  semanticInventory: sha256(JSON.stringify(semanticInventory)),
  testFiles: lineDigest(testFiles),
  testNames: lineDigest(testNames),
  productionTestFiles: lineDigest(collectedTests.productionTestFiles.map(normalizedPath)),
  unitFixtureTestFiles: lineDigest(collectedTests.unitFixtureTestFiles.map(normalizedPath)),
  pngBaselines: lineDigest(pngEntries),
  resourceOccurrences: sha256(JSON.stringify(resource.occurrences)),
  resourceInventory: sha256(JSON.stringify(resource.inventory)),
};

const stableArtifact = {
  serialization: {
    paths: 'repository-relative POSIX paths',
    lists: 'JavaScript UTF-16 code-unit ascending after de-duplication unless occurrence records',
    listDigest: 'SHA-256 of UTF-8 lines joined by LF with one trailing LF',
    objectDigest:
      'SHA-256 of compact JSON.stringify output with insertion order defined by this script',
    pngDigest: 'listDigest of <relative path><TAB><content SHA-256>',
  },
  master: {
    version: master.version,
    bytes: masterContent.length,
    sha256: sha256(masterContent),
  },
  suites: {
    unitFixture: sourceStats(collectedTests.unitFixtureTestFiles, collectedTests.tests),
    production: sourceStats(collectedTests.productionTestFiles, collectedTests.tests),
    vitest: sourceStats(collectedTests.testFiles, collectedTests.tests),
    playwright: {
      ...fileStats(playwrightSourceFiles),
      ...collectPlaywrightInventory(),
    },
    productionMasterLoadReferences: {
      files: sortedUnique(loadReferences).length,
      occurrences: loadReferences.length,
      byFile: sortedCounts(loadReferences),
    },
    pngBaselines: { files: pngFiles.length, digest: inventoryDigests.pngBaselines },
  },
  semanticInventory,
  resourceInventory: resource.inventory,
  contractFiles,
};
const digests = {
  ...inventoryDigests,
  stableArtifact: sha256(JSON.stringify(stableArtifact)),
};
const artifact = {
  ...stableArtifact,
  digests,
};

if (check) {
  const mismatches = Object.entries(expectedDigests).flatMap(([name, expected]) =>
    digests[name] === expected ? [] : [`${name}: expected ${expected}, received ${digests[name]}`],
  );
  if (mismatches.length > 0) {
    process.stderr.write(`${mismatches.join('\n')}\n`);
    process.exitCode = 1;
  }
}

process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
