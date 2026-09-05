import { describe, expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  type MasterEffect,
  type StackInputDefinition,
} from '@fgo-lab/master-data';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';
import { stackDomainWitnesses } from './rankingStackDomain';
import type { ConditionExpression } from '@fgo-lab/battle-execution';
import { master, servant, source, stackEffectTemplate } from './stackQuantityFixture';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { calculateScenarioWithPolicy } from './scenario';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';

const second = {
  ...source,
  key: 'stack:field:beta',
  owner: 'field' as const,
  maximum: 2,
  quantitySource: { scope: 'field' as const, trait: 'beta' },
};
const first = { ...source, maximum: 2 };
const route = {
  target: 'sourceSelf' as const,
  contributionScope: 'partyWide' as const,
  eligibility: {
    kind: 'requiredRecipient' as const,
    recipient: 'attacker' as const,
    onMissing: 'ignore' as const,
    onMismatch: 'ignore' as const,
  },
};
function fixture(
  effect: Pick<MasterEffect, 'execution' | 'inputDefinitions' | 'requirement'>,
  keepCountNp = false,
) {
  return masterSnapshotSchema.parse({
    ...master,
    servants: [
      {
        ...servant,
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) => ({
            ...variant,
            ...(variant.kind === 'attack' && !keepCountNp
              ? {
                  damage: variant.damage.map((damage) => ({
                    kind: 'standard',
                    functionId: damage.functionId,
                    rawFunctionType: 'damageNp',
                    rawPath: damage.rawPath,
                    target: damage.target,
                    stateTraitNames: [],
                    parametersByOvercharge: damage.parametersByOvercharge,
                  })),
                }
              : {}),
            effects: [
              {
                ...stackEffectTemplate,
                id: 'fixture-count-effect',
                occurrenceId: 'fixture-count-effect:0',
                gameActivation: 'npBeforeDamage',
                timing: 'beforeDamage',
                proc: { kind: 'guaranteed' },
                selection: null,
                ...effect,
              },
            ],
          })),
        })),
      },
    ],
  });
}
const versionContext = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const policy = { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' as const };

function maximum(data: ReturnType<typeof fixture>) {
  const result = calculateRankingPolicyDetail(
    data.servants[0]!,
    data,
    { servantBuilds: {} },
    policy,
    versionContext,
  );
  if (result.status !== 'calculated') throw new Error(JSON.stringify(result));
  return result.detail;
}

describe('stack domain completeness proofs', () => {
  it('does not reduce sources constrained by nested readers or an exclusive group', () => {
    const input: StackInputDefinition = {
      ...second,
      key: 'stack:field:fieldHeaven',
      quantitySource: { scope: 'field', trait: 'fieldHeaven' },
    };
    const data = fixture({
      inputDefinitions: [first, input],
      requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
      execution: [
        {
          kind: 'damageModifier',
          modifier: 'npDamageBuff',
          sign: 1,
          card: null,
          route,
          values: [[0], [], [], [], []],
          semanticSupport: 'supported',
          valueExpressions: [
            [
              {
                kind: 'stackLinear',
                sources: [first, input],
                basePermille: 0,
                perUnitPermille: 100,
                maximumUnits: 2,
                maximumValuePermille: null,
              },
            ],
            [],
            [],
            [],
            [],
          ],
        },
      ],
    });
    const actor = data.servants[0]!;
    const program = compileStaticRankingPreparationPrograms(actor)[0]!;
    const semantics = compileStaticRankingSemantics(actor, program, 1);
    expect(semantics.stackWitnesses.size).toBe(0);
    // Remove the exclusive source to isolate each additional-reader guard.
    const operations = semantics.operations.map((operation) =>
      operation.kind === 'addModifier'
        ? {
            ...operation,
            inputDefinitions: [first, second],
            valueExpression: {
              kind: 'stackLinear' as const,
              sources: [first, second],
              basePermille: 0,
              perUnitPermille: 100,
              maximumUnits: 2,
              maximumValuePermille: null,
            },
          }
        : operation,
    );
    expect(stackDomainWitnesses([], operations).size).toBe(2);
    const conditions: ConditionExpression[] = [
      { kind: 'unsupported', reason: 'unresolvedRecipient' },
      {
        kind: 'all',
        expressions: [
          { kind: 'always' },
          {
            kind: 'any',
            expressions: [
              {
                kind: 'not',
                expression: {
                  kind: 'inputQuantity',
                  inputKey: first.key,
                  comparison: 'equal',
                  value: 1,
                },
              },
              { kind: 'trait', scope: 'field', trait: second.quantitySource.trait, present: false },
            ],
          },
        ],
      },
    ];
    for (const condition of conditions)
      expect(
        stackDomainWitnesses(
          [],
          operations.map((operation) => ({ ...operation, condition })),
        ).size,
      ).toBe(0);
  });

  it.each(['trait', 'stateTrait', 'traitExpression'] as const)(
    'preserves aggregate maxima with an additional %s NP reader',
    (kind) => {
      const target: StackInputDefinition = {
        ...first,
        key: 'stack:targetState:beta',
        owner: 'target',
        quantitySource: { scope: 'targetState', trait: 'beta' },
      };
      const data = fixture({
        inputDefinitions: [first, target],
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
        execution: [
          {
            kind: 'damageModifier',
            modifier: 'npDamageBuff',
            sign: 1,
            card: null,
            route,
            values: [[0], [], [], [], []],
            semanticSupport: 'supported',
            valueExpressions: [
              [
                {
                  kind: 'stackLinear',
                  sources: [first, target],
                  basePermille: 0,
                  perUnitPermille: 100,
                  maximumUnits: 2,
                  maximumValuePermille: null,
                },
              ],
              [],
              [],
              [],
              [],
            ],
          },
        ],
      });
      const variant = data.servants[0]!.noblePhantasmVariantGroups[0]!.variants[0]!;
      if (variant.kind !== 'attack') throw new Error('fixture');
      const old = variant.damage[0]!;
      const rawFunctionTypes = {
        trait: 'damageNpIndividual',
        stateTrait: 'damageNpStateIndividualFix',
        traitExpression: 'damageNpAndOrCheckIndividuality',
      };
      const changed = masterSnapshotSchema.parse({
        ...data,
        servants: [
          {
            ...data.servants[0],
            noblePhantasmVariantGroups: data.servants[0]!.noblePhantasmVariantGroups.map(
              (group) => ({
                ...group,
                variants: group.variants.map((np) => ({
                  ...np,
                  damage: [
                    {
                      ...old,
                      kind,
                      rawFunctionType: rawFunctionTypes[kind],
                      stateTraitNames: ['beta'],
                      parametersByOvercharge: Array.from({ length: 5 }, () =>
                        Array.from({ length: 5 }, () => ({
                          ratePermille: 1000,
                          valuePermille: 3000,
                          targetId: 1,
                          correctionPermille: 2000,
                          targetTrait: { kind: 'trait', name: 'beta' },
                          andCheckTraitIds: [1],
                          andCheckTraits: [{ kind: 'trait', name: 'beta' }],
                        })),
                      ),
                    },
                  ],
                })),
              }),
            ),
          },
        ],
      });
      const actor = changed.servants[0]!;
      for (const program of compileStaticRankingPreparationPrograms(actor)) {
        const semantics = compileStaticRankingSemantics(actor, program, 1);
        expect(semantics.stackWitnesses.size).toBe(0);
      }
      if (kind === 'trait') {
        // Combined target-world witnesses currently conflict with independently assigned
        // state counts. Preserve that explicit support boundary, never a reduced maximum.
        const result = calculateRankingPolicyDetail(
          actor,
          changed,
          { servantBuilds: {} },
          policy,
          versionContext,
        );
        expect(result.status).toBe('unsupported');
        return;
      }
      const detail = maximum(changed);
      const all: number[] = [];
      for (let a = 0; a <= 2; a++)
        for (let b = 0; b <= 2; b++) {
          let scenario = applyCanonicalInputCommand(detail.scenario, {
            kind: 'setCanonicalIntegerInput',
            key: first.key,
            value: a,
          });
          scenario = applyCanonicalInputCommand(scenario, {
            kind: 'setCanonicalIntegerInput',
            key: target.key,
            value: b,
          });
          const candidate = calculateScenarioWithPolicy(
            scenario,
            changed,
            versionContext,
            detail.contributionPolicy,
            { initialNpGauge: detail.candidateEvidence.startNpGauge },
          );
          if (candidate.result.status !== 'calculated') throw new Error('oracle');
          all.push(candidate.result.rows[0].average);
        }
      expect(detail.result.rows[0].average).toBe(Math.max(...all));
      if (kind === 'stateTrait') {
        expect(detail.scenario.canonicalInputValues[target.key]?.value).toBeGreaterThan(0);
        expect(detail.input.npSpecialMultipliers).toEqual([2, 2, 2, 2, 2]);
      }
    },
  );

  it.each([100, -100])(
    'matches every two-source vector for signed capped sum %i',
    (perUnitPermille) => {
      const data = fixture({
        inputDefinitions: [first, second],
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
        execution: [
          {
            kind: 'damageModifier',
            modifier: 'npDamageBuff',
            sign: 1,
            card: null,
            route,
            values: [[0], [], [], [], []],
            semanticSupport: 'supported',
            valueExpressions: [
              [
                {
                  kind: 'stackLinear',
                  sources: [first, second],
                  basePermille: 0,
                  perUnitPermille,
                  maximumUnits: 2,
                  maximumValuePermille: null,
                },
              ],
              [],
              [],
              [],
              [],
            ],
          },
        ],
      });
      const detail = maximum(data);
      const all: number[] = [];
      for (let a = 0; a <= 2; a++)
        for (let b = 0; b <= 2; b++) {
          let scenario = applyCanonicalInputCommand(detail.scenario, {
            kind: 'setCanonicalIntegerInput',
            key: first.key,
            value: a,
          });
          scenario = applyCanonicalInputCommand(scenario, {
            kind: 'setCanonicalIntegerInput',
            key: second.key,
            value: b,
          });
          const execution = calculateScenarioWithPolicy(
            scenario,
            data,
            versionContext,
            detail.contributionPolicy,
            { initialNpGauge: detail.candidateEvidence.startNpGauge },
          );
          if (execution.result.status !== 'calculated') throw new Error('oracle');
          all.push(execution.result.rows[0].average);
        }
      expect(detail.result.rows[0].average).toBe(Math.max(...all));
      expect(detail.areaContribution).not.toBeNull();
      const area = detail.areaContribution!;
      expect(area.withoutAreaScenario.canonicalInputValues).toEqual(
        detail.scenario.canonicalInputValues,
      );
      const repeated = calculateScenarioWithPolicy(
        area.withoutAreaScenario,
        data,
        versionContext,
        area.contributionPolicy,
        { initialNpGauge: detail.candidateEvidence.startNpGauge },
      );
      if (repeated.status !== 'executable') throw new Error('without-area execution');
      expect(repeated.input).toEqual(area.withoutAreaInput);
      expect(repeated.result).toEqual(area.withoutAreaResult);
    },
  );

  it('retains an interior maximum when a second contribution depends on count <= 1', () => {
    const data = fixture(
      {
        inputDefinitions: [source],
        requirement: {
          recipient: 'sourceSelf',
          expression: {
            kind: 'inputQuantity',
            inputKey: source.key,
            comparison: 'atMost',
            value: 1,
          },
        },
        execution: [
          {
            kind: 'damageModifier',
            modifier: 'npDamageBuff',
            sign: 1,
            card: null,
            route,
            values: [[1000], [], [], [], []],
            valueExpressions: [[], [], [], [], []],
            semanticSupport: 'supported',
          },
        ],
      },
      true,
    );
    const detail = maximum(data);
    const all = Array.from({ length: 5 }, (_, count) => {
      const scenario = applyCanonicalInputCommand(detail.scenario, {
        kind: 'setCanonicalIntegerInput',
        key: source.key,
        value: count,
      });
      const execution = calculateScenarioWithPolicy(
        scenario,
        data,
        versionContext,
        detail.contributionPolicy,
        { initialNpGauge: detail.candidateEvidence.startNpGauge },
      );
      if (execution.result.status !== 'calculated') throw new Error('oracle');
      return execution.result.rows[0].average;
    });
    expect(detail.result.rows[0].average).toBe(Math.max(...all));
    expect(detail.scenario.canonicalInputValues[source.key]?.value).toBe(1);
  });
});
