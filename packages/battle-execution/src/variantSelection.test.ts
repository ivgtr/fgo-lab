import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet, type DamageResolutionInput } from '@fgo-lab/schema';
import type {
  AttackNoblePhantasmVariant,
  ActorFormId,
  NoblePhantasmVariant,
  NpDamageSpec,
} from '@fgo-lab/master-data';
import type { BattleOperation } from './contracts';
import { createInitialBattleState } from './state';
import {
  applyRuntimeNoblePhantasmVariantSelection,
  applySelectedNoblePhantasmContext,
  resolveSelectedNoblePhantasmVariant,
} from './variantSelection';

const parameter = { ratePermille: 1_000, valuePermille: 3_000 };
const row: NpDamageSpec['parametersByOvercharge'][number] = [
  parameter,
  parameter,
  parameter,
  parameter,
  parameter,
];
const damage: NpDamageSpec = {
  kind: 'standard' as const,
  rawFunctionType: 'damageNp' as const,
  functionId: 'damage',
  target: 'all' as const,
  stateTraitNames: [],
  parametersByOvercharge: [row, row, row, row, row],
  rawPath: 'fixture',
};
const attack = (
  actorFormId: ActorFormId,
  noblePhantasmId: string,
  card: 'arts' | 'buster',
): AttackNoblePhantasmVariant => ({
  kind: 'attack',
  canonicalId: noblePhantasmId,
  ref: { actorFormId, noblePhantasmId },
  name: noblePhantasmId,
  priority: 1,
  effects: [],
  card,
  targetScope: 'all',
  damage: [damage],
});
const baseForm = { actorId: 'form:base', limitCount: 1 };
const changedForm = { actorId: 'form:changed', limitCount: 3 };
const base = attack(baseForm, 'np:base', 'buster');
const changed = attack(changedForm, 'np:changed', 'arts');
const nonAttack: NoblePhantasmVariant = {
  kind: 'nonAttack',
  canonicalId: 'np:defense',
  ref: { actorFormId: baseForm, noblePhantasmId: 'np:defense' },
  name: 'defense',
  priority: 1,
  effects: [],
};
const input = {
  cardType: 'buster',
  attackerStateTraits: [],
  targetStateTraits: [],
  fieldTraits: [],
  target: { traits: [] },
  damageFunction: { status: 'resolved', ignoreDefense: false },
  ignoreDamageCut: false,
  attackerHpPermille: 1_000,
  targetRarity: null,
  battlePointPhase: 0,
} as unknown as DamageResolutionInput;
const activation = analyzeActivationFactSet([]);
if (activation.status !== 'valid') throw new Error('empty activation facts must be valid');
const state = createInitialBattleState(input, base, [], {}, [], [], activation.factSet);
const operationBase = {
  order: 1,
  phase: 'attackerSkill' as const,
  source: {
    origin: 'attacker' as const,
    sourceInstanceId: 'attacker:self',
    sourceId: 'self',
    skillId: 'skill',
    effectId: 'effect',
    effectOccurrenceId: 'effect:0',
    transactionGroupId: 'skill:choice:1',
  },
  contributionScope: 'personal' as const,
  condition: { kind: 'always' as const },
  decisionKey: null,
  decisionPlan: { activation: 'automatic' as const, condition: 'evaluate' as const },
  sourceEnabled: true,
  enabledByDefault: true,
  gameActivation: 'skillUse' as const,
  proc: { kind: 'guaranteed' as const },
  stochasticOutcome: null,
  procRatePermille: 1_000,
  activation: { kind: 'sourceDefault' as const },
  evidence: { rawPath: 'fixture', functionId: 'fixture' },
  presentation: { label: 'fixture', sourceName: 'fixture', skillName: 'fixture' },
  inputDefinitions: [],
};
const selection = {
  ...operationBase,
  operationId: 'select',
  kind: 'selectNoblePhantasmVariant' as const,
  variant: changed.ref,
} satisfies BattleOperation;

describe('noble phantasm variant selection', () => {
  it('changes the complete form-qualified variant rather than mutating only its card', () => {
    const result = applyRuntimeNoblePhantasmVariantSelection(
      { ...state, actorFormId: changed.ref.actorFormId },
      selection,
      [base, changed],
    );
    expect(result.issue).toBeNull();
    expect(result.state).toMatchObject({
      actorFormId: changedForm,
      card: 'arts',
      noblePhantasmVariant: { ref: changed.ref, targetScope: 'all', damage: [damage] },
    });
  });

  it('rejects unknown, form-mismatched, and non-attack selections before damage', () => {
    expect(
      applyRuntimeNoblePhantasmVariantSelection(state, selection, [base, changed]).issue,
    ).toMatchObject({
      kind: 'invalidNoblePhantasmVariant',
      detail: 'formMismatch',
    });
    expect(applyRuntimeNoblePhantasmVariantSelection(state, selection, [base]).issue).toMatchObject(
      {
        kind: 'invalidNoblePhantasmVariant',
        detail: 'unknownVariant',
      },
    );
    expect(
      resolveSelectedNoblePhantasmVariant(
        { baseNoblePhantasmVariant: base, noblePhantasmVariants: [base, nonAttack] } as never,
        { ...selection, variant: nonAttack.ref },
      ),
    ).toMatchObject({ status: 'rejected', issue: { detail: 'nonAttackDamage' } });
  });

  it('commits form, variant, and state trait as one prepared transaction', () => {
    const transform = {
      ...operationBase,
      operationId: 'transform',
      kind: 'transformActorForm' as const,
      targetFormId: changedForm,
      targetTraits: [],
    } satisfies BattleOperation;
    const trait = {
      ...operationBase,
      operationId: 'trait',
      kind: 'addTrait' as const,
      scope: 'attackerState' as const,
      trait: 'variant:changed',
    } satisfies BattleOperation;
    const operations = [transform, selection, trait];
    const activations = new Map(
      operations.map(({ operationId }) => [
        operationId,
        {
          enabled: true,
          enabledBeforeStochasticOutcome: true,
          stochasticOutcome: { status: 'success' as const },
          activeDecisionKeys: [],
          assumesLocalCondition: false,
        },
      ]),
    );
    const result = applySelectedNoblePhantasmContext(
      state,
      changed,
      selection,
      operations,
      new Set(operations.map(({ operationId }) => operationId)),
      activations,
    );
    expect(result.issue).toBeNull();
    expect(result.state).toMatchObject({ actorFormId: changedForm, card: 'arts' });
    expect(result.state.traits.attackerState.get('variant:changed')).toBe(true);
  });

  it('does not preapply transaction mutations whose stochastic outcome did not succeed', () => {
    const transform = {
      ...operationBase,
      operationId: 'transform',
      kind: 'transformActorForm' as const,
      targetFormId: changedForm,
      targetTraits: ['kept-trait'],
    } satisfies BattleOperation;
    const addTrait = {
      ...operationBase,
      operationId: 'add-trait',
      kind: 'addTrait' as const,
      scope: 'attackerState' as const,
      trait: 'failed-addition',
    } satisfies BattleOperation;
    const removeTrait = {
      ...operationBase,
      operationId: 'remove-trait',
      kind: 'removeTrait' as const,
      scope: 'attacker' as const,
      trait: 'kept-trait',
    } satisfies BattleOperation;
    const suppressTrait = {
      ...operationBase,
      operationId: 'suppress-trait',
      kind: 'suppressInitialTrait' as const,
      scope: 'attacker' as const,
      trait: 'kept-trait',
    } satisfies BattleOperation;
    const operations = [transform, selection, addTrait, removeTrait, suppressTrait];
    const activations = new Map(
      operations.map((operation) => [
        operation.operationId,
        operation === transform || operation === selection
          ? {
              enabled: true,
              enabledBeforeStochasticOutcome: true,
              stochasticOutcome: { status: 'success' as const },
              activeDecisionKeys: [],
              assumesLocalCondition: false,
            }
          : {
              enabled: false,
              enabledBeforeStochasticOutcome: true,
              stochasticOutcome:
                operation === removeTrait
                  ? {
                      status: 'invalid' as const,
                      issue: {
                        kind: 'invalidStochasticOutcome' as const,
                        operationId: operation.operationId,
                        detail: 'missingStochasticOutcome' as const,
                      },
                    }
                  : { status: 'failure' as const },
              activeDecisionKeys: [],
              assumesLocalCondition: false,
            },
      ]),
    );
    const initialState = createInitialBattleState(input, base, [], {}, [], [], activation.factSet);
    const result = applySelectedNoblePhantasmContext(
      initialState,
      changed,
      selection,
      operations,
      new Set(operations.map(({ operationId }) => operationId)),
      activations,
    );
    expect(result.issue).toBeNull();
    expect(result.state).toMatchObject({ actorFormId: changedForm, card: 'arts' });
    expect(result.state.traits.attackerState.has('failed-addition')).toBe(false);
    expect(result.state.traits.attacker.get('kept-trait')).toBe(true);
    expect(result.state.initialTraitSuppressions.attacker.has('kept-trait')).toBe(false);
  });

  it('returns the untouched initial state when the prepared transaction cannot resolve', () => {
    const result = applySelectedNoblePhantasmContext(
      state,
      changed,
      selection,
      [selection],
      new Set(['select']),
      new Map([
        [
          'select',
          {
            enabled: true,
            enabledBeforeStochasticOutcome: true,
            stochasticOutcome: { status: 'success' as const },
            activeDecisionKeys: [],
            assumesLocalCondition: false,
          },
        ],
      ]),
    );
    expect(result.issue).toMatchObject({ detail: 'formMismatch' });
    expect(result.state).toBe(state);
    expect(result.state.noblePhantasmVariant.ref).toEqual(base.ref);
  });
});
