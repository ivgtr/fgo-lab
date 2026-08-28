import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet, type DamageResolutionInput } from '@fgo-lab/schema';
import type {
  AttackNoblePhantasmVariant,
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
  parametersByOvercharge: [row, row, row, row, row],
  rawPath: 'fixture',
};
const attack = (
  actorFormId: string,
  noblePhantasmId: string,
  card: 'arts' | 'buster',
): AttackNoblePhantasmVariant => ({
  kind: 'attack',
  ref: { actorFormId, noblePhantasmId },
  name: noblePhantasmId,
  priority: 1,
  effects: [],
  card,
  targetScope: 'all',
  damage: [damage],
});
const base = attack('form:base', 'np:base', 'buster');
const changed = attack('form:changed', 'np:changed', 'arts');
const nonAttack: NoblePhantasmVariant = {
  kind: 'nonAttack',
  ref: { actorFormId: 'form:base', noblePhantasmId: 'np:defense' },
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
  procSelection: { kind: 'effectInclusion' as const },
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
      actorFormId: 'form:changed',
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
      targetFormId: 'form:changed',
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
        { enabled: true, activeDecisionKeys: [], assumesLocalCondition: false },
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
    expect(result.state).toMatchObject({ actorFormId: 'form:changed', card: 'arts' });
    expect(result.state.traits.attackerState.get('variant:changed')).toBe(true);
  });

  it('returns the untouched initial state when the prepared transaction cannot resolve', () => {
    const result = applySelectedNoblePhantasmContext(
      state,
      changed,
      selection,
      [selection],
      new Set(['select']),
      new Map([
        ['select', { enabled: true, activeDecisionKeys: [], assumesLocalCondition: false }],
      ]),
    );
    expect(result.issue).toMatchObject({ detail: 'formMismatch' });
    expect(result.state).toBe(state);
    expect(result.state.noblePhantasmVariant.ref).toEqual(base.ref);
  });
});
