import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet, type DamageResolutionInput } from '@fgo-lab/schema';
import type {
  AttackNoblePhantasmVariant,
  ActorFormId,
  NoblePhantasmVariant,
  NpDamageSpec,
} from '@fgo-lab/master-data';
import type { BattleOperation } from './contracts';
import {
  applyInitialTraitSuppression,
  applyTraitRemoval,
  applyWorldFacts,
  createInitialBattleState,
} from './state';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import { applyNoblePhantasmDamage } from './npDamageExecution';
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
  sourceActivation: { kind: 'unread' as const },
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
  it('carries an external initial trait across a form transition while replacing intrinsic traits', () => {
    const damageInput = {
      ...input,
      attackerStateTraits: ['magicBullet', 'magicBullet', 'magicBullet'],
    };
    const initial = createInitialBattleState(
      damageInput,
      base,
      ['initial-only'],
      {},
      [],
      [],
      activation.factSet,
    );
    const asserted = applyWorldFacts(initial, [
      {
        decisionKey: 'world',
        fact: { kind: 'trait', scope: 'attacker', trait: 'magicBullet', present: true },
      },
    ]);
    const transform = {
      ...operationBase,
      operationId: 'transform',
      kind: 'transformActorForm' as const,
      targetFormId: changedForm,
      targetTraits: ['terminal-only'],
    } satisfies BattleOperation;
    const operations = [transform, selection];
    const activations = new Map(
      operations.map((operation) => [
        operation.operationId,
        {
          enabled: true,
          enabledBeforeStochasticOutcome: true,
          stochasticOutcome: { status: 'success' as const },
          activeDecisionKeys: [],
          assumesLocalCondition: false,
        },
      ]),
    );
    const selected = applySelectedNoblePhantasmContext(
      asserted,
      changed,
      selection,
      operations,
      new Set(operations.map((operation) => operation.operationId)),
      activations,
    );
    expect(selected.issue).toBeNull();
    expect(selected.state.traits.attacker.get('magicBullet')).toBe(true);
    expect(selected.state.traitCounts.attacker.magicBullet).toBe(1);
    expect(selected.state.traits.attacker.has('initial-only')).toBe(false);
    expect(selected.state.traits.attacker.get('terminal-only')).toBe(true);
    const excluded = applySelectedNoblePhantasmContext(
      initial,
      changed,
      selection,
      operations,
      new Set(operations.map((operation) => operation.operationId)),
      activations,
    );
    const restored = applySelectedNoblePhantasmContext(
      applyWorldFacts(initial, [
        {
          decisionKey: 'world',
          fact: { kind: 'trait', scope: 'attacker', trait: 'magicBullet', present: true },
        },
      ]),
      changed,
      selection,
      operations,
      new Set(operations.map((operation) => operation.operationId)),
      activations,
    );
    const traitDamage = {
      ...damage,
      kind: 'traitCount' as const,
      rawFunctionType: 'damageNpIndividualSum' as const,
      quantity: { kind: 'stacks' as const, inputs: [] },
      parametersByOvercharge: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({
          ratePermille: 1_000,
          valuePermille: 3_000,
          targetId: 0,
          targetIds: [2],
          targetTraits: [{ kind: 'trait' as const, name: 'magicBullet' }],
          secondaryValuePermille: 1_000,
          correctionPermille: 100,
          maximumTargetCount: 10,
        })),
      ) as NpDamageSpec['parametersByOvercharge'],
    } as NpDamageSpec;
    const npOperation = {
      ...operationBase,
      operationId: 'damage',
      kind: 'executeNpDamage' as const,
      damage: traitDamage,
      overcharge: 1,
      selectedNpLevel: 1,
      npMultipliers: [300, 300, 300, 300, 300] as const,
      specialAttackCondition: { kind: 'always' as const },
      specialAttackDependency: { kind: 'always' as const },
      specialAttackDecisionKey: null,
    } satisfies BattleOperation;
    const specialInput = (candidate: typeof selected) =>
      applyNoblePhantasmDamage(damageInput, npOperation, candidate.state, new Map())
        .npSpecialMultipliers;
    expect(excluded.issue).toBeNull();
    expect(specialInput(selected)).toEqual([1.4, 1.4, 1.4, 1.4, 1.4]);
    expect(specialInput(excluded)).toEqual([1.3, 1.3, 1.3, 1.3, 1.3]);
    expect(specialInput(restored)).toEqual(specialInput(selected));
  });

  it('rejects an external negative against a terminal intrinsic trait without committing selection', () => {
    const asserted = applyWorldFacts(state, [
      {
        decisionKey: 'world',
        fact: { kind: 'trait', scope: 'attacker', trait: 'terminal-only', present: false },
      },
    ]);
    const transform = {
      ...operationBase,
      operationId: 'transform',
      kind: 'transformActorForm' as const,
      targetFormId: changedForm,
      targetTraits: ['terminal-only'],
    } satisfies BattleOperation;
    const operations = [transform, selection];
    const activations = new Map(
      operations.map((operation) => [
        operation.operationId,
        {
          enabled: true,
          enabledBeforeStochasticOutcome: true,
          stochasticOutcome: { status: 'success' as const },
          activeDecisionKeys: [],
          assumesLocalCondition: false,
        },
      ]),
    );
    const selected = applySelectedNoblePhantasmContext(
      asserted,
      changed,
      selection,
      operations,
      new Set(operations.map((operation) => operation.operationId)),
      activations,
    );
    expect(selected.issue?.kind).toBe('constraintConflict');
    expect(selected.state).toBe(asserted);
  });

  it('keeps preapplied and ordered remove and suppress counts consistent', () => {
    const initial = createInitialBattleState(
      { ...input, attackerStateTraits: ['magicBullet'] },
      base,
      ['magicBullet'],
      {},
      [],
      [],
      activation.factSet,
    );
    const remove = {
      ...operationBase,
      operationId: 'remove',
      kind: 'removeTrait' as const,
      scope: 'attackerState' as const,
      trait: 'magicBullet',
    } satisfies BattleOperation;
    const suppress = {
      ...operationBase,
      operationId: 'suppress',
      kind: 'suppressInitialTrait' as const,
      scope: 'attacker' as const,
      trait: 'magicBullet',
    } satisfies BattleOperation;
    const sameFormSelection = { ...selection, variant: base.ref };
    const operations = [sameFormSelection, remove, suppress];
    const activations = new Map(
      operations.map((operation) => [
        operation.operationId,
        {
          enabled: true,
          enabledBeforeStochasticOutcome: true,
          stochasticOutcome: { status: 'success' as const },
          activeDecisionKeys: [],
          assumesLocalCondition: false,
        },
      ]),
    );
    const selected = applySelectedNoblePhantasmContext(
      initial,
      base,
      sameFormSelection,
      operations,
      new Set(operations.map((operation) => operation.operationId)),
      activations,
    );
    expect(selected.issue).toBeNull();
    const ordered = applyInitialTraitSuppression(
      applyTraitRemoval(initial, 'attackerState', 'magicBullet', {
        kind: 'guaranteedWrite',
        clock: initial.conditionReadClock,
      }),
      'attacker',
      'magicBullet',
      { kind: 'guaranteedWrite', clock: initial.conditionReadClock },
    );
    expect(selected.state.traits.attackerState.get('magicBullet')).toBe(false);
    expect(selected.state.traitCounts.attackerState.magicBullet).toBeUndefined();
    expect(selected.state.traits.attacker.get('magicBullet')).toBe(false);
    expect(selected.state.traitCounts.attacker.magicBullet).toBeUndefined();
    expect(selected.state.traitCounts).toEqual(ordered.traitCounts);
    expect(
      fixedConstraintFactsFromState(selected.state).filter(
        (item) => item.fact.kind === 'trait' && item.fact.trait === 'magicBullet',
      ),
    ).toEqual(
      fixedConstraintFactsFromState(ordered).filter(
        (item) => item.fact.kind === 'trait' && item.fact.trait === 'magicBullet',
      ),
    );
  });

  it('rejects an initial-only intrinsic trait against an explicit negative', () => {
    const initial = createInitialBattleState(
      input,
      base,
      ['initial-only'],
      {},
      [],
      [],
      activation.factSet,
    );
    const validation = validateConstraintSet({
      fixedFacts: [
        ...fixedConstraintFactsFromState(initial),
        {
          sourceKey: 'world',
          fact: {
            kind: 'trait' as const,
            scope: 'attacker' as const,
            trait: 'initial-only',
            present: false,
          },
        },
      ],
      expressions: [],
    });
    expect(validation.status).toBe('conflict');
  });

  it('changes the complete form-qualified variant rather than mutating only its card', () => {
    const result = applyRuntimeNoblePhantasmVariantSelection(
      { ...state, actorFormId: changed.ref.actorFormId },
      selection,
      [base, changed],
    );
    // E2E-A036-VARIANT E2E-A037-SEMANTIC-RESULT
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
    // E2E-A036-TRANSACTION
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
