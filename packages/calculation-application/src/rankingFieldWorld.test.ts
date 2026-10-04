import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  evaluateConditionExpression,
  executeOrderedScenario,
  type BattleOperation,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createRankingFieldCandidatesForConditions,
  createRankingFieldFactCandidates,
  materializeRankingField,
  MAX_RANKING_FIELD_CANDIDATES,
} from './rankingFieldWorld';
import { createDefaultResolvedScenario, prepareCalculationScenario } from './scenario';
import { calculateDamageResolution } from './damageResolution';

const master = masterSnapshotSchema.parse(fixture);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

function fieldConditionalModifier(condition: ConditionExpression): BattleOperation {
  return {
    operationId: 'fixture:field-absence:modifier',
    order: -1,
    phase: 'beforeNpDamage',
    source: {
      origin: 'np',
      sourceInstanceId: 'fixture:np',
      sourceId: 'fixture',
      skillId: 'fixture:np',
      effectId: 'field-absence',
      effectOccurrenceId: 'field-absence:0',
    },
    contributionScope: 'personal',
    condition,
    decisionKey: null,
    decisionPlan: { activation: 'automatic', condition: 'evaluate' },
    sourceEnabled: true,
    enabledByDefault: true,
    gameActivation: 'npBeforeDamage',
    proc: { kind: 'guaranteed' },
    stochasticOutcome: null,
    sourceActivation: { kind: 'unread' as const },
    procRatePermille: 1_000,
    activation: { kind: 'sourceDefault' },
    evidence: { rawPath: 'fixture', functionId: 'field-absence' },
    presentation: { label: 'field absence', sourceName: 'fixture', skillName: 'fixture NP' },
    inputDefinitions: [],
    kind: 'addModifier',
    modifier: 'attackBuff',
    valuePermille: 1_000,
    valueExpression: null,
    card: null,
  };
}

describe('ranking field worlds', () => {
  it('does not materialize an external fact for inactive policy', () => {
    expect(createRankingFieldFactCandidates(['fieldShore'], false)).toEqual([
      { key: 'field:none', facts: [] },
    ]);
  });

  it('enumerates only relevant satisfiable field facts', () => {
    const candidates = createRankingFieldFactCandidates(
      ['fieldHeaven', 'fieldHell', 'fieldShore'],
      true,
    );
    expect(candidates).toHaveLength(6);
    expect(candidates.some(({ facts }) => facts.every(({ present }) => !present))).toBe(true);
    expect(
      candidates.every(({ facts }) => {
        const positive = facts.filter(({ present }) => present).map(({ trait }) => trait);
        return !(positive.includes('fieldHeaven') && positive.includes('fieldHell'));
      }),
    ).toBe(true);
    expect(
      candidates.every(({ facts }) =>
        ['fieldHeaven', 'fieldHell', 'fieldShore'].every((trait) =>
          facts.some((fact) => fact.trait === trait),
        ),
      ),
    ).toBe(true);
  });

  it('fails closed when the finite search bound would be exceeded', () => {
    const traits = Array.from(
      { length: Math.ceil(Math.log2(MAX_RANKING_FIELD_CANDIDATES + 1)) },
      (_, index) => `field:${index}`,
    );
    expect(() => createRankingFieldFactCandidates(traits, true)).toThrow(
      /ranking_field_candidate_limit/,
    );
  });

  it.each(['atLeast', 'atMost', 'equal'] as const)(
    'enumerates field traitCount %s facts including the all-absent witness',
    (comparison) => {
      const candidates = createRankingFieldCandidatesForConditions(
        [
          {
            kind: 'traitCount',
            scope: 'field',
            traits: ['fieldShore', 'fieldSunlight'],
            comparison,
            count: 1,
          },
        ],
        true,
      );
      expect(candidates).toHaveLength(4);
      expect(candidates.some(({ facts }) => facts.every(({ present }) => !present))).toBe(true);
    },
  );

  it.each([
    {
      name: 'present:false',
      condition: { kind: 'trait', scope: 'field', trait: 'fieldShore', present: false },
    },
    {
      name: 'not',
      condition: {
        kind: 'not',
        expression: { kind: 'trait', scope: 'field', trait: 'fieldShore', present: true },
      },
    },
    {
      name: 'traitCount atMost',
      condition: {
        kind: 'traitCount',
        scope: 'field',
        traits: ['fieldShore', 'fieldSunlight'],
        comparison: 'atMost',
        count: 0,
      },
    },
    {
      name: 'traitCount equal',
      condition: {
        kind: 'traitCount',
        scope: 'field',
        traits: ['fieldShore', 'fieldSunlight'],
        comparison: 'equal',
        count: 0,
      },
    },
    {
      name: 'nested absence',
      condition: {
        kind: 'all',
        expressions: [
          { kind: 'trait', scope: 'field', trait: 'fieldShore', present: false },
          {
            kind: 'not',
            expression: {
              kind: 'any',
              expressions: [
                { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: true },
              ],
            },
          },
        ],
      },
    },
  ] satisfies readonly { name: string; condition: ConditionExpression }[])(
    'materializes the all-absent $name witness as explicit executor facts',
    ({ condition }) => {
      const candidate = createRankingFieldCandidatesForConditions([condition], true).find(
        ({ facts }) => facts.length > 0 && facts.every(({ present }) => !present),
      );
      if (!candidate) throw new Error('all-absent field candidate required');
      const scenario = materializeRankingField(
        createDefaultResolvedScenario(master, undefined),
        candidate,
        true,
      );
      const prepared = prepareCalculationScenario(scenario, master);
      if (
        prepared.status !== 'executable' ||
        !prepared.orderedScenario ||
        !prepared.canonicalInputs
      )
        throw new Error('executable field scenario required');
      const execution = executeOrderedScenario(prepared.orderedScenario, prepared.canonicalInputs);
      if (execution.state.activationContext === null)
        throw new Error('executable battle state required');

      expect(
        scenario.worldFactAssertions.filter(({ decisionKey }) =>
          decisionKey.startsWith('ranking:field:'),
        ),
      ).toHaveLength(candidate.facts.length);
      expect(evaluateConditionExpression(condition, execution.state).truth).toBe(true);
      expect(
        candidate.facts.every(({ trait }) =>
          scenario.worldFactAssertions.some(
            ({ fact }) => fact.kind === 'trait' && fact.trait === trait && !fact.present,
          ),
        ),
      ).toBe(true);

      const damageIndex = prepared.orderedScenario.operations.findIndex(
        (operation) => operation.kind === 'executeNpDamage',
      );
      const operations = [...prepared.orderedScenario.operations];
      operations.splice(damageIndex, 0, fieldConditionalModifier(condition));
      const conditionalExecution = executeOrderedScenario(
        { ...prepared.orderedScenario, operations },
        prepared.canonicalInputs,
        {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects: 'satisfied',
          areaView: 'included',
        },
      );
      const baselineDamage = calculateDamageResolution(execution.input, versions);
      const conditionalDamage = calculateDamageResolution(conditionalExecution.input, versions);
      if (baselineDamage.status !== 'calculated' || conditionalDamage.status !== 'calculated')
        throw new Error('calculated damage required');
      expect(conditionalExecution.input.attackBuff).toBe(1);
      expect(conditionalDamage.rows[0].average).toBeGreaterThan(baselineDamage.rows[0].average);
    },
  );
});
