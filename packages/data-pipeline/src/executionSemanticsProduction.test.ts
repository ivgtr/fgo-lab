import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  getNoblePhantasmVariants,
  masterSnapshotSchema,
  type CanonicalEffectRequirement,
  type MasterEffect,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import { createSuiteAuditInput } from './suiteAuditInput.test-support';
import { parsePublishedManifest } from './artifact';

const root = resolve(import.meta.dirname, '../../..');
const inputDirectory = resolve(root, 'packages/data-pipeline/test-inputs/raw-hp-v1');
const fixedPublishedMaster = {
  masterDataVersion: '20260920.3',
  file: 'master.json',
  bytes: 32_953_998,
  sha256: '2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a',
};
const fixedRawInputs = [
  {
    rawPath: 'data/raw/nice_servant.json',
    rawBytes: 68_622_616,
    rawSha256: '1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f',
    gzipFile: 'nice_servant.json.gz',
  },
  {
    rawPath: 'data/raw/nice_equip.json',
    rawBytes: 21_819_299,
    rawSha256: 'bb339ac726f8201243410ec82b85a14496e6a8dace54b226071b556604fc27e5',
    gzipFile: 'nice_equip.json.gz',
  },
];

async function readRawHpDeclaration() {
  const declaration = JSON.parse(
    await readFile(resolve(inputDirectory, 'manifest.json'), 'utf8'),
  ) as {
    format: string;
    owner: string;
    consumer: string;
    captureRevision: string;
    publishedMaster: typeof fixedPublishedMaster;
    inputs: ((typeof fixedRawInputs)[number] & { gzipBytes: number; gzipSha256: string })[];
  };
  expect(declaration).toEqual({
    format: 'raw-hp-inputs-v2',
    owner: '@fgo-lab/data-pipeline',
    consumer: 'executionSemanticsProduction/raw-hp-before-relevance',
    captureRevision: '6bba3310976287709dd3aabac9d533e4b1dfb4a9',
    publishedMaster: fixedPublishedMaster,
    inputs: declaration.inputs,
  });
  expect(declaration.inputs).toHaveLength(2);
  for (const [index, fixed] of fixedRawInputs.entries()) {
    const input = declaration.inputs[index]!;
    expect(Object.keys(input).sort()).toEqual(
      ['rawPath', 'rawBytes', 'rawSha256', 'gzipFile', 'gzipBytes', 'gzipSha256'].sort(),
    );
    expect({
      rawPath: input.rawPath,
      rawBytes: input.rawBytes,
      rawSha256: input.rawSha256,
      gzipFile: input.gzipFile,
    }).toEqual(fixed);
    expect(Number.isSafeInteger(input.gzipBytes) && input.gzipBytes > 0).toBe(true);
    expect(input.gzipSha256).toMatch(/^[a-f0-9]{64}$/);
  }
  return declaration;
}

function allEffects(master: ReturnType<typeof masterSnapshotSchema.parse>): MasterEffect[] {
  return [
    ...master.servants.flatMap((servant) => [
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...getNoblePhantasmVariants(servant).flatMap((np) => np.effects),
    ]),
    ...master.craftEssences.flatMap((ce) => ce.effects),
    ...master.mysticCodes.flatMap((code) => code.skills.flatMap((skill) => skill.effects)),
  ];
}

// One borrowed published input per suite; the first consumer pays readiness within its 5s task.
const publishedInput = createSuiteAuditInput({
  read: async () => {
    const [content, manifestContent, declaration] = await Promise.all([
      readFile(resolve(root, 'packages/test-fixtures/production-master/master.json'), 'utf8'),
      readFile(resolve(root, 'packages/test-fixtures/production-master/manifest.json'), 'utf8'),
      readRawHpDeclaration(),
    ]);
    const manifest = parsePublishedManifest(JSON.parse(manifestContent));
    const file = manifest.files.find((entry) => entry.key === 'master' && entry.required)!;
    expect({ masterDataVersion: manifest.masterDataVersion, ...file }).toEqual({
      ...declaration.publishedMaster,
      key: 'master',
      required: true,
    });
    expect(Buffer.byteLength(content)).toBe(file.bytes);
    expect(createHash('sha256').update(content).digest('hex')).toBe(file.sha256);
    return content;
  },
  parse: (input) => {
    const master = masterSnapshotSchema.parse(input);
    expect(master.version).toBe(fixedPublishedMaster.masterDataVersion);
    return master;
  },
  project: (master) => Object.freeze(allEffects(master)),
});

function evidenceValues(effect: MasterEffect, limitBreak = false) {
  const sets =
    limitBreak && effect.atlasEvidence.limitBreakParameterSets
      ? effect.atlasEvidence.limitBreakParameterSets
      : effect.atlasEvidence.parameterSets;
  return sets.map((set) =>
    set.map((parameter) => (typeof parameter['Value'] === 'number' ? parameter['Value'] : null)),
  );
}

function requirementLeaves(requirement: CanonicalEffectRequirement): CanonicalEffectRequirement[] {
  if (requirement.kind === 'all' || requirement.kind === 'any')
    return requirement.requirements.flatMap(requirementLeaves);
  return requirement.kind === 'not' ? requirementLeaves(requirement.requirement) : [requirement];
}

const quantityRequirements = (effect: MasterEffect) =>
  requirementLeaves(effect.requirement.expression).filter(
    (requirement) => requirement.kind === 'quantity',
  );

describe('production canonical execution semantics', () => {
  it('ratchets every probabilistic terminal damage occurrence into canonical proc semantics', async () => {
    const { master, view: effects } = await publishedInput();
    const probabilistic = effects.filter((effect) => effect.proc.kind !== 'guaranteed');
    expect(
      probabilistic.reduce<Record<string, number>>((counts, effect) => {
        counts[effect.proc.kind] = (counts[effect.proc.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ chainedRolls: 5, independentRolls: 41, singleRoll: 3 });
    expect(new Set(probabilistic.map((effect) => effect.gameActivation))).toEqual(
      new Set(['npBeforeDamage', 'skillUse']),
    );
    expect(
      probabilistic.filter(
        (effect) =>
          (effect.proc.kind === 'singleRoll' || effect.proc.kind === 'independentRolls') &&
          effect.inputDefinitions.length !== 0,
      ),
    ).toEqual([]);
    const chained = probabilistic.filter((effect) => effect.proc.kind === 'chainedRolls');
    expect(chained).toHaveLength(5);
    expect(new Set(chained.map((effect) => effect.gameActivation))).toEqual(
      new Set(['npBeforeDamage']),
    );
    expect(
      chained.every(
        (effect) =>
          effect.selection?.kind === 'stochasticOutcome' &&
          effect.selection.group.kind === 'successCount' &&
          effect.selection.group.defaultOutcome === 'maximum',
      ),
    ).toBe(true);
    expect(
      master.servants.flatMap((servant) =>
        getNoblePhantasmVariants(servant).flatMap((np) =>
          np.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
      ),
    ).toHaveLength(5);
    expect(
      master.servants.flatMap((servant) => [
        ...servant.skills.flatMap((skill) =>
          skill.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
        ...servant.passives.flatMap((skill) =>
          skill.effects.filter((effect) => effect.proc.kind === 'chainedRolls'),
        ),
      ]),
    ).toEqual([]);
    expect(
      probabilistic.filter(
        (effect) =>
          effect.proc.kind === 'chainedRolls' &&
          effect.inputDefinitions.every((input) => input.kind !== 'procSuccessCount'),
      ),
    ).toEqual([]);
    expect(
      probabilistic.filter((effect) =>
        effect.atlasEvidence.parameterSets.some((set) =>
          set.some(
            (parameter) => typeof parameter.Rate === 'number' && Math.abs(parameter.Rate) < 1_000,
          ),
        ),
      ),
    ).toHaveLength(49);
  });

  it('ratchets every raw HP condition before damage relevance filtering', async () => {
    const count = (value: unknown, result = { HP_LOWER: 0, HP_HIGHER: 0 }) => {
      if (!value || typeof value !== 'object') return result;
      if (Object.hasOwn(value, 'HP_LOWER')) result.HP_LOWER += 1;
      if (Object.hasOwn(value, 'HP_HIGHER')) result.HP_HIGHER += 1;
      for (const child of Object.values(value)) count(child, result);
      return result;
    };
    // One shared, fixed full-raw input set; clean checkout/CI never borrows ignored local exports.
    await publishedInput();
    const declaration = await readRawHpDeclaration();
    const rawInputs: unknown[] = [];
    for (const [index] of fixedRawInputs.entries()) {
      const input = declaration.inputs[index]!;
      const compressed = await readFile(resolve(inputDirectory, input.gzipFile));
      expect(compressed.length).toBe(input.gzipBytes);
      expect(createHash('sha256').update(compressed).digest('hex')).toBe(input.gzipSha256);
      const raw = gunzipSync(compressed);
      expect(raw.length).toBe(input.rawBytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(input.rawSha256);
      rawInputs.push(JSON.parse(raw.toString('utf8')) as unknown);
    }
    const [servants, craftEssences] = rawInputs;

    // script and originalScript contain the same condition; divide by the two evidence copies.
    const servantCounts = count(servants);
    const craftEssenceCounts = count(craftEssences);
    expect({
      HP_LOWER: servantCounts.HP_LOWER / 2,
      HP_HIGHER: servantCounts.HP_HIGHER / 2,
    }).toEqual({ HP_LOWER: 6, HP_HIGHER: 2 });
    expect({
      HP_LOWER: craftEssenceCounts.HP_LOWER / 2,
      HP_HIGHER: craftEssenceCounts.HP_HIGHER / 2,
    }).toEqual({ HP_LOWER: 1, HP_HIGHER: 0 });
  });

  it('ratchets every normalized HP condition family and cumulative series', async () => {
    const { view: effects } = await publishedInput();
    const hpEvidence = effects.filter((effect) =>
      effect.atlasEvidence.buffConditionKeys.some(
        (key) => key === 'HP_LOWER' || key === 'HP_HIGHER',
      ),
    );
    const thresholdSeries = effects.filter(
      (effect) => effect.interaction?.kind === 'quantityThresholdSeries',
    );

    expect(hpEvidence).toHaveLength(9);
    expect(
      hpEvidence.reduce<Record<string, number>>((counts, effect) => {
        for (const key of effect.atlasEvidence.buffConditionKeys)
          counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ HP_LOWER: 7, HP_HIGHER: 2 });
    expect(
      hpEvidence.flatMap((effect) =>
        effect.atlasEvidence.buffConditionKeys.flatMap((key) =>
          key === 'HP_LOWER' || key === 'HP_HIGHER'
            ? [
                {
                  key,
                  comparisons: quantityRequirements(effect)
                    .filter((condition) => condition.quantity === 'attackerHpPermille')
                    .map((condition) => condition.comparison),
                  values: quantityRequirements(effect)
                    .filter((condition) => condition.quantity === 'attackerHpPermille')
                    .map((condition) => condition.value),
                },
              ]
            : [],
        ),
      ),
    ).toEqual([
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [990] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [750] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [250] },
      { key: 'HP_LOWER', comparisons: ['atLeast', 'atMost'], values: [0, 500] },
      { key: 'HP_HIGHER', comparisons: ['atLeast'], values: [500] },
      { key: 'HP_HIGHER', comparisons: ['atLeast'], values: [1000] },
      { key: 'HP_LOWER', comparisons: ['atMost'], values: [500] },
    ]);
    expect(thresholdSeries).toHaveLength(5);
    expect(new Set(thresholdSeries.map((effect) => effect.interaction?.key)).size).toBe(1);
    expect(
      thresholdSeries.flatMap((effect) =>
        quantityRequirements(effect)
          .filter((condition) => condition.quantity === 'attackerHpPermille')
          .map((condition) => condition.value),
      ),
    ).toEqual([990, 750, 500, 250]);
    expect(
      hpEvidence.reduce<Record<string, number>>((counts, effect) => {
        const operation = effect.execution.find((candidate) =>
          ['damageModifier', 'modifierRateChange'].includes(candidate.kind),
        );
        const family =
          operation?.kind === 'damageModifier' &&
          operation.valueExpressions
            .flat()
            .some((expression) => expression?.kind === 'hpRangeLinear')
            ? 'hpRangeLinear'
            : operation?.kind === 'damageModifier' &&
                effect.interaction?.kind === 'quantityThresholdSeries'
              ? 'quantityThresholdModifier'
              : operation?.kind === 'damageModifier'
                ? 'standaloneConditionalModifier'
                : 'otherOperation';
        counts[family] = (counts[family] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      hpRangeLinear: 1,
      quantityThresholdModifier: 4,
      standaloneConditionalModifier: 1,
      otherOperation: 3,
    });
  });

  it('maps every raw occurrence to a typed operation family', async () => {
    const { master, view: effects } = await publishedInput();
    const operations = effects.flatMap((effect) => effect.execution);
    const counts = operations.reduce<Record<string, number>>((result, operation) => {
      result[operation.kind] = (result[operation.kind] ?? 0) + 1;
      return result;
    }, {});

    expect(effects).toHaveLength(13_875);
    expect(operations).toHaveLength(15257);
    expect(Object.fromEntries(Object.entries(counts).sort())).toEqual({
      boundedPhaseIrrelevant: 3008,
      battlePointCapacityModifier: 1,
      buffInstanceMutation: 311,
      contextMutation: 1442,
      damageModifier: 3885,
      grantOcApplicationRate: 29,
      grantOcBoost: 97,
      hpModifier: 107,
      ignoreDamageCut: 1,
      ignoreDefense: 39,
      modifierRateChange: 1,
      ocRemovalResistance: 60,
      ocStateNonIntersection: 129,
      populationFunction: 5,
      populationMutation: 4,
      removeHpModifiers: 198,
      removeOcState: 75,
      resourceMutation: 1185,
      selectNoblePhantasmVariant: 22,
      stateMutation: 4620,
      transformActorForm: 10,
      unsupported: 28,
    });
    const occurrenceFamilies = {
      resource: new Set([
        'gainNp',
        'gainMultiplyNp',
        'lossNp',
        'gainStar',
        'lossStar',
        'gainHp',
        'gainHpPer',
        'lossHpSafe',
        'lossHp',
        'lossHpPerSafe',
        'subBattlePoint',
      ]),
      state: new Set([
        'addStateShort',
        'addState',
        'subState',
        'moveState',
        'extendBuffturn',
        'shortenBuffcount',
        'addStateShortToField',
        'addStateToField',
      ]),
      unsupported: new Set([
        'gainNpBuffIndividualSum',
        'gainHpFromTargets',
        'gainNpFromTargets',
        'gainNpIndividualSum',
        'gainNpTargetSum',
        'replaceMember',
        'moveToLastSubmember',
      ]),
    };
    const referencedStateWrappers = effects.filter(
      (effect) =>
        effect.operationReference !== null &&
        occurrenceFamilies.state.has(effect.atlasEvidence.functionType) &&
        effect.execution.every(
          (operation) =>
            operation.kind === 'resourceMutation' || operation.kind === 'boundedPhaseIrrelevant',
        ),
    );
    expect(referencedStateWrappers).toHaveLength(2);
    const wrapperOperations = new Set(
      referencedStateWrappers.flatMap(({ execution }) => execution),
    );
    const closedOccurrences = {
      resource: operations.filter(
        (operation) => operation.kind === 'resourceMutation' && !wrapperOperations.has(operation),
      ).length,
      unresolvedResourceTargets: effects.filter(
        (effect) =>
          occurrenceFamilies.resource.has(effect.atlasEvidence.functionType) &&
          effect.execution.some(
            (operation) =>
              operation.kind === 'unsupported' && operation.reason === 'unresolvedTarget',
          ),
      ).length,
      state:
        operations.filter((operation) => operation.kind === 'stateMutation').length +
        referencedStateWrappers.length,
      unsupported: operations.filter(
        (operation) =>
          operation.kind === 'unsupported' &&
          occurrenceFamilies.unsupported.has(
            effects.find(({ execution }) => execution.includes(operation))?.atlasEvidence
              .functionType ?? '',
          ),
      ).length,
      boundedPhaseIrrelevant: operations.filter(
        (operation) =>
          operation.kind === 'boundedPhaseIrrelevant' && !wrapperOperations.has(operation),
      ).length,
    };
    expect(closedOccurrences).toEqual({
      resource: 1_183,
      unresolvedResourceTargets: 2,
      state: 4_622,
      unsupported: 4,
      boundedPhaseIrrelevant: 3_007,
    });

    const variantOperations = master.servants.flatMap((servant) =>
      (['skill', 'passive'] as const).flatMap((origin) => {
        const skills = origin === 'skill' ? servant.skills : servant.passives;
        return skills.flatMap((skill) =>
          skill.effects.flatMap((effect) =>
            effect.execution.flatMap((operation) =>
              operation.kind === 'selectNoblePhantasmVariant' ||
              operation.kind === 'transformActorForm'
                ? [
                    {
                      servantId: servant.id,
                      origin,
                      skillId: skill.id,
                      effectId: effect.id,
                      selection: effect.selection,
                      operation,
                    },
                  ]
                : [],
            ),
          ),
        );
      }),
    );
    expect(variantOperations).toHaveLength(26);
    expect(createHash('sha256').update(JSON.stringify(variantOperations)).digest('hex')).toBe(
      'fbdd7e09b315e7f3f454efb46e1d2a4d6c5d811bd2c33ba17c9aea1a54434340',
    );
    expect(
      variantOperations.reduce<Record<string, number>>((inventory, operation) => {
        inventory[operation.servantId] = (inventory[operation.servantId] ?? 0) + 1;
        return inventory;
      }, {}),
    ).toEqual({
      '200100': 2,
      '204900': 1,
      '205000': 4,
      '304800': 2,
      '505600': 4,
      '1002000': 5,
      '1100900': 3,
      '2300600': 2,
      '2301100': 3,
    });
    expect(
      variantOperations.reduce<Record<string, number>>((inventory, { operation }) => {
        inventory[operation.kind] = (inventory[operation.kind] ?? 0) + 1;
        return inventory;
      }, {}),
    ).toEqual({ selectNoblePhantasmVariant: 19, transformActorForm: 7 });

    const variants = master.servants.flatMap((servant) => getNoblePhantasmVariants(servant));
    expect(variants.filter(({ kind }) => kind === 'attack')).toHaveLength(626);
    expect(variants.filter(({ kind }) => kind === 'nonAttack')).toHaveLength(101);
    expect(
      master.servants.flatMap((servant) => {
        const scopes = new Set(
          getNoblePhantasmVariants(servant).flatMap((variant) =>
            variant.kind === 'attack' ? [variant.targetScope] : [],
          ),
        );
        return scopes.size === 2 ? [[servant.id, servant.name]] : [];
      }),
    ).toEqual([
      ['204900', 'ＵＤＫ－バーゲスト'],
      ['205000', 'プトレマイオス'],
      ['304800', 'メリュジーヌ'],
      ['2301100', '玉兎'],
    ]);
  });

  it('ratchets canonical contribution scopes independently from target routing', async () => {
    const { view: effects } = await publishedInput();
    const scoped = effects
      .flatMap((effect) => effect.execution)
      .filter((operation) => 'route' in operation && operation.kind !== 'unsupported');
    const terminal = scoped.filter((operation) =>
      ['damageModifier', 'modifierRateChange', 'ignoreDefense', 'ignoreDamageCut'].includes(
        operation.kind,
      ),
    );
    const counts = (operations: typeof scoped) =>
      operations.reduce<Record<string, number>>((result, operation) => {
        result[operation.route.contributionScope] =
          (result[operation.route.contributionScope] ?? 0) + 1;
        return result;
      }, {});
    expect(counts(scoped)).toEqual({
      enemyApplied: 1984,
      partyOther: 51,
      partyWide: 1059,
      personal: 3001,
    });
    expect(counts(terminal)).toEqual({
      personal: 2_593,
      partyWide: 920,
      partyOther: 46,
      enemyApplied: 367,
    });
  });

  it('classifies every production NP gauge occurrence without a raw runtime fallback', async () => {
    const { master, view: effects } = await publishedInput();
    const transitions = effects.flatMap(({ execution }) =>
      execution.flatMap((operation) =>
        operation.kind === 'resourceMutation' && operation.resource === 'npGauge'
          ? [operation]
          : [],
      ),
    );
    const counts = transitions.reduce<Record<string, number>>((result, transition) => {
      const key = `${transition.amount.kind}:${transition.direction}`;
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      'buffCount:gain': 4,
      'currentGaugeRatio:gain': 1,
      'fixed:gain': 649,
      'fixed:loss': 79,
      'populationCount:gain': 6,
      'npTransfer:gain': 3,
    });
    expect(transitions).toHaveLength(742);
    // PIR-001: bound count readers now execute; each retains its input identity and raw coefficient cells.
    const counted = effects.filter((effect) =>
      effect.execution.some(
        (operation) =>
          operation.kind === 'resourceMutation' && operation.amount.kind === 'buffCount',
      ),
    );
    expect(counted).toHaveLength(4);
    for (const effect of counted)
      for (const operation of effect.execution) {
        if (operation.kind !== 'resourceMutation' || operation.amount.kind !== 'buffCount')
          continue;
        expect(operation.amount.values).toEqual(evidenceValues(effect));
        const input = effect.inputDefinitions[0];
        if (input?.kind !== 'effectStackCount') throw new Error('missing buff count input');
        expect(input.instanceTraits).toContain(operation.amount.trait);
        expect(effect.inputDefinitions).toEqual([
          expect.objectContaining({
            kind: 'effectStackCount',
            key: operation.amount.inputKey,
            quantitySource: { scope: 'attackerState', trait: operation.amount.trait },
            owner: 'attacker',
            defaultValue: 0,
          }),
        ]);
      }
    const proportional = transitions.filter(({ amount }) => amount.kind === 'currentGaugeRatio');
    expect(proportional).toHaveLength(1);
    expect(proportional[0]?.amount).toEqual({
      kind: 'currentGaugeRatio',
      values: [[500, 550, 600, 650, 700, 750, 800, 850, 900, 1000], [], [], [], []],
    });
    expect(
      effects
        .flatMap(({ execution }) => execution)
        .filter(
          (operation) =>
            operation.kind === 'unsupported' && operation.reason === 'dependentResourceAmount',
        ),
    ).toHaveLength(0);
    expect(
      master.servants
        .flatMap(({ skills }) => skills)
        .filter(({ resourceRequirement }) => resourceRequirement),
    ).toHaveLength(7);
    expect(master.npResourceSemantics).toEqual({
      unit: 'basisPoints',
      capacityByNpLevel: [10_000, 20_000, 20_000, 20_000, 30_000],
      noblePhantasmUse: {
        requirement: 10_000,
        consumption: 'all',
        baseOvercharge: { gaugePerStage: 10_000, minimumStage: 1, maximumBaseStage: 3 },
      },
    });
  });

  it('keeps modifier values exactly equal to the former execution value source', async () => {
    const { view: effects } = await publishedInput();
    let compared = 0;
    for (const effect of effects) {
      if (effect.operationReference !== null) continue;
      for (const operation of effect.execution) {
        if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
          continue;
        expect(operation.values).toEqual(evidenceValues(effect));
        if (operation.limitBreakValues)
          expect(operation.limitBreakValues).toEqual(evidenceValues(effect, true));
        compared += 1;
      }
    }
    expect(compared).toBe(3_885);
  });

  it('classifies all Value effects without placing trait IDs in modifier series', async () => {
    const { view: effects } = await publishedInput();
    const valueEffects = effects.filter((effect) =>
      effect.atlasEvidence.parameterSemantics.value.includes('Value'),
    );
    const purposeCounts = { modifier: 0, modifierRate: 0, contextTraitId: 0, otherOperation: 0 };
    for (const effect of valueEffects) {
      if (
        effect.atlasEvidence.buffTypes.some(
          (buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality',
        )
      )
        purposeCounts.contextTraitId += 1;
      else if (effect.execution.some((operation) => operation.kind === 'modifierRateChange'))
        purposeCounts.modifierRate += 1;
      else if (effect.execution.some((operation) => operation.kind === 'damageModifier'))
        purposeCounts.modifier += 1;
      else purposeCounts.otherOperation += 1;
    }
    expect(valueEffects).toHaveLength(10_865);
    expect(purposeCounts).toEqual({
      modifier: 3_885,
      modifierRate: 1,
      contextTraitId: 80,
      otherOperation: 6_899,
    });
    expect(
      valueEffects
        .filter((effect) =>
          effect.atlasEvidence.buffTypes.some(
            (buff) => buff === 'fieldIndividuality' || buff === 'addIndividuality',
          ),
        )
        .some((effect) =>
          effect.execution.some(
            (operation) =>
              operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange',
          ),
        ),
    ).toBe(false);
    expect(
      valueEffects.filter((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'unsupported' &&
            operation.reason === 'contextReference' &&
            !operation.damageRelevant,
        ),
      ),
    ).toHaveLength(4);
  });

  it('ratchets build-time referenced skills and their ordered canonical operations', async () => {
    const { view: effects } = await publishedInput();
    expect(
      effects
        .filter((effect) => effect.operationReference !== null)
        .map((effect) => ({
          effectId: effect.id,
          reference: effect.operationReference,
          operations: effect.execution.map((operation) => operation.kind),
        })),
    ).toEqual([
      {
        effectId: '23291',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970869',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['boundedPhaseIrrelevant', 'contextMutation', 'contextMutation'],
      },
      {
        effectId: '20955',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970373',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '20955',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970725',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '23560',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970936',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['boundedPhaseIrrelevant', 'resourceMutation'],
      },
      {
        effectId: '9618',
        reference: {
          kind: 'resolvedSkill',
          skillId: '968984',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '21383',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970478',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '20955',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970407',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '20955',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970460',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['stateMutation'],
      },
      {
        effectId: '2096',
        reference: {
          kind: 'resolvedSkill',
          skillId: '961313',
          levelSource: 'skillLevelParameter',
          defaultLevel: 1,
        },
        operations: ['contextMutation', 'damageModifier'],
      },
      {
        effectId: '21814',
        reference: {
          kind: 'resolvedSkill',
          skillId: '970535',
          levelSource: 'secondaryValueParameter',
          defaultLevel: 1,
        },
        operations: ['resourceMutation'],
      },
    ]);
  });

  it('retains trait provenance policies instead of reducing them to combined traits', async () => {
    const { view: effects } = await publishedInput();
    const counts = effects
      .flatMap((effect) => requirementLeaves(effect.requirement.expression))
      .filter((requirement) => requirement.kind === 'trait')
      .reduce<Record<string, number>>((result, requirement) => {
        const key = [
          requirement.provenance.stateSources,
          requirement.provenance.ignoredStateTraits,
          requirement.provenance.unremovableStateTraits,
        ].join(':');
        result[key] = (result[key] ?? 0) + 1;
        return result;
      }, {});
    expect(counts).toEqual({
      'activeOnly:exclude:include': 2_604,
      'activeAndPassive:exclude:include': 7,
      'activeOnly:include:include': 6,
      'activeOnly:exclude:exclude': 1,
    });
  });

  it('keeps linked trait grants and suppressions under one canonical state identity', async () => {
    const { view: effects } = await publishedInput();
    const linked = effects.filter((effect) => effect.stateIdentity !== null);
    expect(linked).toHaveLength(31);
    const paired = linked.filter((effect) => effect.stateIdentity?.key === 'trait:2841');
    expect(
      paired.map((effect) => ({
        effectId: effect.id,
        identity: effect.stateIdentity,
        operations: effect.execution,
      })),
    ).toEqual([
      {
        effectId: '9619',
        identity: { kind: 'linkedTraitFamily', key: 'trait:2841' },
        operations: [
          expect.objectContaining({
            kind: 'contextMutation',
            mutation: 'addTrait',
            trait: 'alignmentLawful',
          }),
        ],
      },
      {
        effectId: '9620',
        identity: { kind: 'linkedTraitFamily', key: 'trait:2841' },
        operations: [
          expect.objectContaining({
            kind: 'contextMutation',
            mutation: 'suppressInitialTrait',
            trait: 'alignmentChaotic',
          }),
        ],
      },
    ]);
  });

  it('normalizes forced-equality field counts without widening a single-enemy condition', async () => {
    const { view: effects } = await publishedInput();
    const fieldCountEffects = effects.filter((effect) =>
      effect.atlasEvidence.parameterSemantics.condition.includes('TriggeredFieldCountRange'),
    );
    expect(fieldCountEffects).toHaveLength(1);
    expect(fieldCountEffects[0]).toMatchObject({
      inputDefinitions: [
        {
          kind: 'fieldActorCount',
          owner: 'field',
          minimum: 1,
          maximum: 3,
          defaultValue: 1,
        },
      ],
      requirement: {
        recipient: 'sourceSelf',
        expression: {
          kind: 'inputQuantity',
          inputKey: 'field:enemyCount',
          comparison: 'atMost',
          value: 1,
        },
      },
    });
  });

  it('retains every MLB-only effect with explicit availability', async () => {
    const { view: effects } = await publishedInput();
    expect(effects.filter((effect) => effect.availability === 'allLimitBreakStates')).toHaveLength(
      13_867,
    );
    expect(
      effects
        .filter((effect) => effect.availability === 'maximumLimitBreakOnly')
        .map((effect) => ({
          id: effect.id,
          kind: effect.execution[0]?.kind,
          modifier:
            effect.execution[0]?.kind === 'damageModifier' ? effect.execution[0].modifier : null,
        })),
    ).toEqual([
      { id: '265', kind: 'damageModifier', modifier: 'flatDamage' },
      { id: '274', kind: 'stateMutation', modifier: null },
      { id: '118', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '100', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '247', kind: 'damageModifier', modifier: 'npDamageBuff' },
      { id: '109', kind: 'damageModifier', modifier: 'cardBuff' },
      { id: '364', kind: 'stateMutation', modifier: null },
      { id: '199', kind: 'stateMutation', modifier: null },
    ]);
  });

  it('ratchets complete shared MLB value evidence without runtime fallbacks', async () => {
    const { master } = await publishedInput();
    const sharedValues: unknown[] = [];
    let mlbSkillCraftEssences = 0;
    let sharedEffects = 0;
    let sharedValuedOperations = 0;
    let differingValueOperations = 0;
    let explicitCraftEssenceValuedOperations = 0;
    for (const craftEssence of master.craftEssences) {
      let hasLimitBreakEvidence = false;
      for (const effect of craftEssence.effects) {
        const shared = effect.atlasEvidence.limitBreakParameterSets !== undefined;
        if (shared) {
          hasLimitBreakEvidence = true;
          sharedEffects += 1;
        }
        for (const [operationIndex, operation] of effect.execution.entries()) {
          if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
            continue;
          explicitCraftEssenceValuedOperations += 1;
          expect(operation.limitBreakValues).toBeDefined();
          expect(operation.limitBreakValueExpressions).toBeDefined();
          if (!shared) continue;
          sharedValuedOperations += 1;
          if (JSON.stringify(operation.values) !== JSON.stringify(operation.limitBreakValues))
            differingValueOperations += 1;
          sharedValues.push({
            craftEssenceId: craftEssence.id,
            occurrenceId: effect.occurrenceId,
            operationIndex,
            values: operation.limitBreakValues,
            expressions: operation.limitBreakValueExpressions,
          });
        }
      }
      if (hasLimitBreakEvidence) mlbSkillCraftEssences += 1;
    }
    sharedValues.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    expect(mlbSkillCraftEssences).toBe(898);
    expect(sharedEffects).toBe(2_077);
    expect(sharedValuedOperations).toBe(745);
    expect(differingValueOperations).toBe(735);
    expect(explicitCraftEssenceValuedOperations).toBe(1_307);
    const purelyBloom = master.craftEssences
      .find((craftEssence) => craftEssence.id === '9400810')
      ?.effects.find((effect) => effect.occurrenceId === '249:0')?.execution[0];
    const crimson = master.craftEssences
      .find((craftEssence) => craftEssence.id === '9400850')
      ?.effects.find((effect) => effect.occurrenceId === '267:0')?.execution[0];
    expect(purelyBloom).toMatchObject({
      kind: 'damageModifier',
      valueExpressions: [[{ kind: 'inputLinear', maximumUnits: 9 }], [], [], [], []],
      limitBreakValueExpressions: [
        [{ kind: 'inputLinear', maximumUnits: 11, maximumValuePermille: 500 }],
        [],
        [],
        [],
        [],
      ],
    });
    expect(crimson).toMatchObject({
      kind: 'damageModifier',
      valueExpressions: [[{ kind: 'inputLinear', maximumUnits: 11 }], [], [], [], []],
      limitBreakValueExpressions: [
        [{ kind: 'inputLinear', maximumUnits: 13, maximumValuePermille: 1200 }],
        [],
        [],
        [],
        [],
      ],
    });
    expect(createHash('sha256').update(JSON.stringify(sharedValues)).digest('hex')).toBe(
      'eaf94a1c80ddd684e7f1b09b12c9b3591273afd2842392f11409d5b522f55575',
    );
  });
});
