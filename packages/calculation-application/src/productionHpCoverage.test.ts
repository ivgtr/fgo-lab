import { expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, getNoblePhantasmVariants } from '@fgo-lab/master-data';
import { isHpOperation, type HpOperation, type SourceEffect } from '@fgo-lab/battle-execution';
import {
  hpCoverageSources,
  hpCoverageSelectorMatches,
  reconcileHpCoverage,
  type HpCoverageSource,
  type HpCoverageObservation,
} from './productionHpCoverage';

const master = masterSnapshotSchema.parse(fixture);
const gain: HpOperation = {
  kind: 'resourceMutation',
  resource: 'hp',
  direction: 'gain',
  unit: 'fixed',
  recipient: 'sourceSelf',
  selection: 'direct',
  subjectId: null,
  amount: { kind: 'fixed', values: [[100], [], [], [], []] },
};
const effect = masterSnapshotSchema.parse({
  ...fixture,
  servants: [
    {
      ...fixture.servants[0],
      skills: [
        {
          id: 'coverage-skill',
          slot: 1,
          priority: 1,
          name: 'coverage fixture',
          detail: '',
          imageKey: null,
          resourceRequirement: null,
          effects: [
            {
              id: 'coverage',
              occurrenceId: 'coverage:0',
              label: 'coverage fixture',
              execution: [gain],
              availability: 'allLimitBreakStates',
              inclusionPolicy: { default: 'include' },
              gameActivation: 'skillUse',
              triggerScope: null,
              interaction: null,
              operationTrigger: null,
              operationReference: null,
              stateIdentity: null,
              proc: { kind: 'guaranteed' },
              selection: null,
              inputDefinitions: [],
              requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
              atlasEvidence: {
                functionType: 'fixture',
                target: 'self',
                parameterSets: [[], [], [], [], []],
                parameterSemantics: {
                  value: [],
                  lifecycle: [],
                  presentation: [],
                  condition: [],
                  contextMutation: [],
                  choice: [],
                  valueExpression: [],
                  buffIdentity: [],
                  unresolved: [],
                },
                unresolvedSemanticKeys: [],
                buffTypes: [],
                buffRateTargets: [],
                buffConditionKeys: [],
              },
            },
          ],
        },
      ],
    },
  ],
}).servants[0]!.skills[0]!.effects[0]!;
function declaration(operation: HpOperation = gain): HpCoverageSource {
  return {
    owner: 'actor',
    skill: 'skill',
    origin: 'attacker',
    variant: null,
    effect: { ...effect, occurrenceId: 'hp:0', execution: [operation] },
  };
}
function observations(d: HpCoverageSource): HpCoverageObservation[] {
  const operation = d.effect.execution[0]!;
  if (!isHpOperation(operation)) throw new TypeError('fixture_expected_hp_operation');
  return [d.origin, 'support' as const].map((origin) => {
    const source: SourceEffect = {
      phase: origin === 'np' ? 'beforeNpDamage' : 'attackerSkill',
      origin,
      sourceInstanceId: 'cell-source',
      sourceId: d.owner,
      sourceName: d.owner,
      sourceTraits: [],
      skillId: d.skill,
      skillName: d.skill,
      effect: d.effect,
      valueSetIndex: 0,
      valueIndex: 0,
      limitBreak: false,
      sourceEnabled: true,
      enabledByDefault: true,
      noblePhantasmVariant: null,
      sourceActivation: { kind: 'unread' },
    };
    return {
      declaration: d,
      operationIndex: 0,
      operation,
      source,
      state: {
        actors: {},
        receipts: [
          {
            actionId: 'cell',
            occurrenceId: d.effect.occurrenceId,
            actor: origin === 'support' ? 'cell-source' : 'attacker',
            before: { kind: 'missing' },
            after: { kind: 'missing' },
            attempted: null,
            actual: null,
          },
        ],
      },
    };
  });
}
const reasons = (d: readonly HpCoverageSource[], o: readonly HpCoverageObservation[]) =>
  reconcileHpCoverage(d, o).gate.failures.map((f) => f.reason);

it('borrows canonical operation and source references without claiming selected, read or NP proof', () => {
  const d = declaration(),
    result = reconcileHpCoverage([d], observations(d));
  expect(result.gate.failures).toEqual([]);
  expect(result.declarations[0]!.operation).toBe(gain);
  expect(result.declarations[0]!.operationSelectorMatches).toEqual(['fixedSelf', 'giveFixedGain']);
  expect(
    result.cells.map((c) => [c.oldCellIndex, c.sourceInstanceId, c.receipts[0]!.actor]),
  ).toEqual([
    [0, 'cell-source', 'attacker'],
    [1, 'cell-source', 'cell-source'],
  ]);
  expect(result.unobserved).toContain('actualModifierRead');
  expect(result.unobserved).toContain('npConsumption');
  expect(result.unobserved).toContain('recovery');
});

it('separates missing, duplicate and unmatched cells with typed first differences', () => {
  const d = declaration(),
    o = observations(d);
  expect(reasons([d], o.slice(1))).toContain('missingCell');
  expect(reasons([d], [...o, o[0]!])).toContain('duplicateCell');
  const foreign = { ...o[0]!, source: { ...o[0]!.source, origin: 'passive' as const } };
  expect(reasons([d], [foreign, o[1]!])).toContain('unmatchedCell');
  expect(reconcileHpCoverage([d], []).gate.firstDifference?.reason).toBe('missingCell');
});

it('rejects duplicate declarations rather than silently deduplicating their cells', () => {
  const d = declaration();
  expect(reasons([d, d], observations(d))).toContain('duplicateDeclaration');
});

it('rejects same-valued foreign source and operation references', () => {
  const d = declaration(),
    o = observations(d);
  expect(reasons([d], [{ ...o[0]!, declaration: { ...d } }, o[1]!])).toContain(
    'foreignSourceReference',
  );
  expect(reasons([d], [{ ...o[0]!, operation: { ...gain } }, o[1]!])).toContain(
    'foreignOperationReference',
  );
});

it('keeps NP variant identity when the legacy owner/skill/occurrence/operation key collides', () => {
  const np = getNoblePhantasmVariants(master.servants[0]!)[0]!;
  const a: HpCoverageSource = {
    ...declaration(),
    origin: 'np',
    variant: { canonicalId: 'variant-a', ref: np.ref },
  };
  const b: HpCoverageSource = {
    ...a,
    variant: {
      canonicalId: 'variant-b',
      ref: {
        ...np.ref,
        actorFormId: { ...np.ref.actorFormId, limitCount: np.ref.actorFormId.limitCount + 1 },
      },
    },
  };
  const result = reconcileHpCoverage([a, b], [...observations(a), ...observations(b)]);
  expect(result.gate.failures).toEqual([]);
  expect(result.legacyIdentityCollisions).toHaveLength(1);
  expect(result.cells[0]!.identity.declaration.variant?.canonicalId).toBe('variant-a');
  expect(result.cells[2]!.identity.declaration.variant?.canonicalId).toBe('variant-b');
});

it('rejects foreign actor, wrong phase, effect and receipt identities', () => {
  const d = declaration(),
    o = observations(d);
  for (const source of [
    { ...o[0]!.source, sourceInstanceId: 'foreign-actor' },
    { ...o[0]!.source, phase: 'beforeNpDamage' as const },
    { ...o[0]!.source, effect: { ...d.effect } },
  ])
    expect(reasons([d], [{ ...o[0]!, source }, o[1]!])).toContain('sourceBindingMismatch');
  const state = {
    ...o[0]!.state,
    receipts: o[0]!.state.receipts.map((r) => ({ ...r, occurrenceId: 'foreign:0' })),
  };
  expect(reasons([d], [{ ...o[0]!, state }, o[1]!])).toContain('receiptIdentityMismatch');
});

it('rejects cell order changes, wrong family and wrong recipient even when values match', () => {
  const d = declaration(),
    o = observations(d);
  expect(reasons([d], [...o].reverse())).toContain('cellOrderMismatch');
  for (const operation of [
    { ...gain, recipient: 'partyMember' as const },
    { ...gain, unit: 'percent' as const },
  ])
    expect(reasons([d], [{ ...o[0]!, operation }, o[1]!])).toContain('foreignOperationReference');
});

it('preserves a proven empty-recipient receipt separately from an absent actual read', () => {
  const d = declaration(),
    o = observations(d);
  const excluded = {
    ...o[0]!,
    state: {
      ...o[0]!.state,
      receipts: o[0]!.state.receipts.map((r) => ({
        ...r,
        actor: 'excluded',
        attempted: 0,
        actual: 0,
      })),
    },
  };
  const result = reconcileHpCoverage([d], [excluded, o[1]!]);
  expect(result.gate.failures).toEqual([]);
  expect(result.cells[0]!.recipientOutcome).toBe('provenEmptyRecipient');
  expect(result.unobserved).toContain('actualModifierRead');
});

it('does not call an absent receipt a proven recipient exclusion', () => {
  const d = declaration(),
    o = observations(d);
  const result = reconcileHpCoverage(
    [d],
    [{ ...o[0]!, state: { actors: {}, receipts: [] } }, o[1]!],
  );
  expect(result.gate.failures).toEqual([]);
  expect(result.cells[0]!.recipientOutcome).toBe('noReceiptObserved');
  expect(result.unobserved).toContain('actualModifierRead');
});

it('keeps percent, transfer and non-self operations outside fixed selector eligibility without calling them unsupported', () => {
  expect(hpCoverageSelectorMatches({ ...gain, unit: 'percent' })).toEqual([]);
  expect(hpCoverageSelectorMatches({ ...gain, recipient: 'partyOther' })).toEqual([]);
  expect(
    hpCoverageSelectorMatches({
      ...gain,
      amount: {
        kind: 'hpTransfer',
        donors: 'selectedEnemy',
        child: 'unconditionalUnresistedDisjoint',
        inputKeys: ['donor:0'],
        values: [[100], [], [], [], []],
      },
    }),
  ).toEqual([]);
  const d: HpCoverageSource = { ...declaration(), origin: 'craftEssence', variant: null };
  const result = reconcileHpCoverage([d], observations(d));
  expect(result.gate.failures).toEqual([]);
  expect(result.declarations[0]!.sourceBoundary).toBe('outsideAttackerSkill');
  expect(result.declarations[0]!.operationSelectorMatches).toContain('fixedSelf');
  expect(result.unobserved).toContain('nativeOutcome');
});

it('enumerates only HP source effects in canonical order and preserves their references', () => {
  const d = declaration();
  const servant = master.servants[0]!;
  const input = {
    ...master,
    servants: [
      {
        ...servant,
        passives: [],
        noblePhantasmVariantGroups: [],
        skills: [
          {
            id: 'skill',
            slot: 1 as const,
            priority: 1,
            name: 'fixture',
            detail: '',
            imageKey: null,
            resourceRequirement: null,
            effects: [d.effect],
          },
        ],
      },
    ],
    craftEssences: [],
    mysticCodes: [],
  };
  const result = hpCoverageSources(input);
  expect(result).toHaveLength(1);
  expect(result[0]!.effect).toBe(d.effect);
  expect(result[0]!.origin).toBe('attacker');
});

it('separates zero published declarations from schema-legal maximum action eligibility', () => {
  expect(reconcileHpCoverage([], []).declaredPopulation.modifierActions).toEqual({
    maximumFixed: 0,
    maximumRate: 0,
    baseFixed: 0,
    baseRate: 0,
    receive: 0,
    give: 0,
    noHealing: 0,
  });
  for (const action of ['maximumRate', 'baseFixed', 'baseRate'] as const) {
    const operation: HpOperation = {
      kind: 'hpModifier',
      action,
      sign: 1,
      lifetime: 'active',
      selection: 'direct',
      route: {
        target: 'sourceSelf',
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
      },
      bounds: { minimum: null, maximum: null },
      traits: [],
      values: [[100], [], [], [], []],
    };
    const d = declaration(operation),
      result = reconcileHpCoverage([d], observations(d));
    expect(result.gate.failures).toEqual([]);
    expect(result.declarations[0]!.operation).toBe(operation);
    expect(result.declaredPopulation.modifierActions[action]).toBe(1);
    expect(result.declarations[0]!.operationSelectorMatches).toEqual([]);
    expect(result.unobserved).toContain('nativeOutcome');
  }
});
