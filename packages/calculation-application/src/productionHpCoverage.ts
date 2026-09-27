import {
  getNoblePhantasmVariants,
  type MasterDataSnapshot,
  type MasterEffect,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import {
  isHpOperation,
  type HpOperation,
  type HpState,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import { isFixedSelfHpWriter } from './productionHpPreparationAudit';
import { isMaximumFixedSelf } from './productionHpMaximumFixedPreparationAudit';
import { isReceiveSelf } from './productionHpReceivePreparationAudit';
import { isGiveSelf, isGiveFixedGain } from './productionHpGivePreparationAudit';
import { isSelectedAllyMaximumFixed } from './productionHpSelectedAllyMaximumFixedPreparationAudit';

/** Suite-lifetime borrowed canonical references, not a second runtime HP model. */
export type HpCoverageSource = {
  owner: string;
  skill: string;
  effect: MasterEffect;
} & (
  | {
      origin: 'np';
      variant: Pick<NoblePhantasmVariant, 'canonicalId' | 'ref'>;
    }
  | { origin: 'attacker' | 'passive' | 'craftEssence' | 'mysticCode'; variant: null }
);

export function hpCoverageSources(master: MasterDataSnapshot): HpCoverageSource[] {
  const hp = (effect: MasterEffect) => effect.execution.some(isHpOperation);
  return [
    ...master.servants.flatMap((actor) => [
      ...actor.skills.flatMap((skill) =>
        skill.effects.filter(hp).map((effect) => ({
          owner: actor.id,
          skill: skill.id,
          origin: 'attacker' as const,
          variant: null,
          effect,
        })),
      ),
      ...actor.passives.flatMap((skill) =>
        skill.effects.filter(hp).map((effect) => ({
          owner: actor.id,
          skill: skill.id,
          origin: 'passive' as const,
          variant: null,
          effect,
        })),
      ),
      ...getNoblePhantasmVariants(actor).flatMap((variant) =>
        variant.effects.filter(hp).map((effect) => ({
          owner: actor.id,
          skill: variant.ref.noblePhantasmId,
          origin: 'np' as const,
          variant,
          effect,
        })),
      ),
    ]),
    ...master.craftEssences.flatMap((ce) =>
      ce.effects.filter(hp).map((effect) => ({
        owner: ce.id,
        skill: ce.id,
        origin: 'craftEssence' as const,
        variant: null,
        effect,
      })),
    ),
    ...master.mysticCodes.flatMap((code) =>
      code.skills.flatMap((skill) =>
        skill.effects.filter(hp).map((effect) => ({
          owner: code.id,
          skill: skill.id,
          origin: 'mysticCode' as const,
          variant: null,
          effect,
        })),
      ),
    ),
  ];
}

function declarationIdentity(source: HpCoverageSource, operationIndex: number) {
  return {
    origin: source.origin,
    owner: source.owner,
    skill: source.skill,
    variant:
      source.variant === null
        ? null
        : {
            canonicalId: source.variant.canonicalId,
            ref: source.variant.ref,
          },
    occurrence: source.effect.occurrenceId,
    operationIndex,
  };
}

/** These predicates own operation eligibility only, not selected or observed coverage. */
export function hpCoverageSelectorMatches(operation: MasterEffect['execution'][number]) {
  const selectors: readonly (readonly [string, boolean])[] = [
    ['fixedSelf', isFixedSelfHpWriter(operation)],
    ['maximumFixedSelf', isMaximumFixedSelf(operation)],
    ['receiveSelf', isReceiveSelf(operation)],
    ['giveSelf', isGiveSelf(operation)],
    ['giveFixedGain', isGiveFixedGain(operation)],
    ['selectedAllyMaximumFixed', isSelectedAllyMaximumFixed(operation)],
  ];
  return selectors.flatMap(([name, matches]) => (matches ? [name] : []));
}

export interface HpCoverageObservation {
  declaration: HpCoverageSource;
  operationIndex: number;
  operation: HpOperation;
  source: SourceEffect;
  state: HpState;
}

export type HpCoverageFailureReason =
  | 'duplicateDeclaration'
  | 'duplicateCell'
  | 'unmatchedCell'
  | 'missingCell'
  | 'foreignSourceReference'
  | 'foreignOperationReference'
  | 'sourceBindingMismatch'
  | 'cellOrderMismatch'
  | 'receiptIdentityMismatch';

function cellIdentity(
  declaration: HpCoverageSource,
  operationIndex: number,
  binding: Pick<SourceEffect, 'origin' | 'limitBreak' | 'valueSetIndex' | 'valueIndex'>,
) {
  return {
    declaration: declarationIdentity(declaration, operationIndex),
    binding: {
      origin: binding.origin,
      limitBreak: binding.limitBreak,
      valueSetIndex: binding.valueSetIndex,
      valueIndex: binding.valueIndex,
    },
  };
}

/** Reconciles structural cells only. Never reexecutes the owner or generates HP expectations. */
export function reconcileHpCoverage(
  sources: readonly HpCoverageSource[],
  observations: readonly HpCoverageObservation[],
) {
  const failures: {
    reason: HpCoverageFailureReason;
    index: number;
    expected: string | null;
    actual: string | null;
  }[] = [];
  const fail = (
    reason: HpCoverageFailureReason,
    index: number,
    expected: string | null,
    actual: string | null,
  ) => {
    failures.push({ reason, index, expected, actual });
  };
  const declarations: {
    identity: ReturnType<typeof declarationIdentity>;
    sourceIndex: number;
    operation: HpOperation;
    requirement: MasterEffect['requirement'];
    selection: MasterEffect['selection'];
    time: MasterEffect['gameActivation'];
    activationContract: Pick<
      MasterEffect,
      | 'proc'
      | 'availability'
      | 'inclusionPolicy'
      | 'triggerScope'
      | 'interaction'
      | 'operationTrigger'
      | 'operationReference'
      | 'stateIdentity'
      | 'inputDefinitions'
    >;
    operationSelectorMatches: string[];
    sourceBoundary: 'attackerSkill' | 'outsideAttackerSkill';
  }[] = [];
  const declarationKeys = new Set<string>();
  const expectedCells = new Map<string, number>();
  let expectedCount = 0;
  for (const [sourceIndex, declaration] of sources.entries())
    for (const [operationIndex, operation] of declaration.effect.execution.entries()) {
      if (!isHpOperation(operation)) continue;
      const identity = declarationIdentity(declaration, operationIndex);
      const declarationKey = JSON.stringify(identity);
      if (declarationKeys.has(declarationKey))
        fail('duplicateDeclaration', sourceIndex, null, declarationKey);
      declarationKeys.add(declarationKey);
      declarations.push({
        identity,
        sourceIndex,
        operation,
        requirement: declaration.effect.requirement,
        selection: declaration.effect.selection,
        time: declaration.effect.gameActivation,
        activationContract: {
          proc: declaration.effect.proc,
          availability: declaration.effect.availability,
          inclusionPolicy: declaration.effect.inclusionPolicy,
          triggerScope: declaration.effect.triggerScope,
          interaction: declaration.effect.interaction,
          operationTrigger: declaration.effect.operationTrigger,
          operationReference: declaration.effect.operationReference,
          stateIdentity: declaration.effect.stateIdentity,
          inputDefinitions: declaration.effect.inputDefinitions,
        },
        operationSelectorMatches: hpCoverageSelectorMatches(operation),
        sourceBoundary:
          declaration.origin === 'attacker' ? 'attackerSkill' : 'outsideAttackerSkill',
      });
      const amount =
        operation.kind === 'resourceMutation'
          ? operation.amount
          : operation.kind === 'hpModifier'
            ? operation
            : null;
      for (const limitBreak of [false, true]) {
        const values = amount ? (limitBreak ? amount.limitBreakValues : amount.values) : [[0]];
        if (!values) continue;
        for (const [valueSetIndex, row] of values.entries())
          for (const [valueIndex, value] of row.entries()) {
            if (value === null) continue;
            for (const origin of [...new Set([declaration.origin, 'support' as const])]) {
              const key = JSON.stringify(
                cellIdentity(declaration, operationIndex, {
                  origin,
                  limitBreak,
                  valueSetIndex,
                  valueIndex,
                }),
              );
              expectedCells.set(key, expectedCount++);
            }
          }
      }
    }
  const seen = new Set<string>();
  const cells = observations.map((observation, index) => {
    const { declaration, operationIndex, operation, source, state } = observation;
    const identity = cellIdentity(declaration, operationIndex, source);
    const key = JSON.stringify(identity);
    const expectedIndex = expectedCells.get(key);
    if (expectedIndex === undefined) fail('unmatchedCell', index, null, key);
    if (seen.has(key)) fail('duplicateCell', index, null, key);
    seen.add(key);
    if (!sources.includes(declaration))
      fail('foreignSourceReference', index, 'borrowedCanonicalSource', 'foreignSourceReference');
    if (declaration.effect.execution[operationIndex] !== operation)
      fail(
        'foreignOperationReference',
        index,
        'borrowedCanonicalOperation',
        'foreignOperationReference',
      );
    if (
      source.effect !== declaration.effect ||
      source.sourceId !== declaration.owner ||
      source.skillId !== declaration.skill ||
      source.sourceInstanceId !== 'cell-source' ||
      source.phase !== (source.origin === 'np' ? 'beforeNpDamage' : 'attackerSkill')
    )
      fail(
        'sourceBindingMismatch',
        index,
        key,
        JSON.stringify({
          origin: source.origin,
          actor: source.sourceInstanceId,
          owner: source.sourceId,
          skill: source.skillId,
          phase: source.phase,
          sameEffect: source.effect === declaration.effect,
        }),
      );
    if (expectedIndex !== undefined && expectedIndex !== index)
      fail('cellOrderMismatch', index, String(expectedIndex), String(index));
    if (
      state.receipts.some(
        (receipt) =>
          receipt.actionId !== 'cell' || receipt.occurrenceId !== declaration.effect.occurrenceId,
      )
    )
      fail(
        'receiptIdentityMismatch',
        index,
        declaration.effect.occurrenceId,
        JSON.stringify(state.receipts),
      );
    return {
      oldCellIndex: index,
      identity,
      phase: source.phase,
      sourceInstanceId: source.sourceInstanceId,
      primitiveOutcome: 'applied' as const,
      receipts: state.receipts.map((receipt, receiptIndex) => ({
        receiptIndex,
        actionId: receipt.actionId,
        occurrenceId: receipt.occurrenceId,
        actor: receipt.actor,
      })),
      recipientOutcome:
        state.receipts.length === 0
          ? ('noReceiptObserved' as const)
          : state.receipts.every((receipt) => receipt.actor === 'excluded')
            ? ('provenEmptyRecipient' as const)
            : ('receiptRecorded' as const),
      donorReceipts: state.donorReceipts ?? null,
    };
  });
  for (const [key, index] of expectedCells)
    if (!seen.has(key)) fail('missingCell', index, key, null);
  const legacyKeys = new Map<string, Set<string>>();
  for (const declaration of declarations) {
    const { owner, skill, occurrence, operationIndex } = declaration.identity;
    const legacyKey = JSON.stringify({ owner, skill, occurrence, operationIndex });
    const identities = legacyKeys.get(legacyKey) ?? new Set<string>();
    identities.add(JSON.stringify(declaration.identity));
    legacyKeys.set(legacyKey, identities);
  }
  const modifierActions: Record<Extract<HpOperation, { kind: 'hpModifier' }>['action'], number> = {
    maximumFixed: 0,
    maximumRate: 0,
    baseFixed: 0,
    baseRate: 0,
    receive: 0,
    give: 0,
    noHealing: 0,
  };
  const resourceAmounts = { fixed: 0, hpTransfer: 0 };
  const resourceUnits = { fixed: 0, percent: 0 };
  let removals = 0;
  for (const { operation } of declarations) {
    if (operation.kind === 'hpModifier') modifierActions[operation.action]++;
    else if (operation.kind === 'resourceMutation') {
      resourceAmounts[operation.amount.kind]++;
      resourceUnits[operation.unit]++;
    } else removals++;
  }
  return {
    qualification:
      'Primitive cells and operation selector eligibility only; not selected preparation, transaction/native outcome, append, actual read, NP consumption or recovery proof.',
    declarations,
    cells,
    declaredPopulation: { modifierActions, resourceAmounts, resourceUnits, removals },
    legacyIdentityCollisions: [...legacyKeys].flatMap(([key, identities]) =>
      identities.size > 1 ? [{ key, identities: [...identities] }] : [],
    ),
    unobserved: [
      'availableAction',
      'selected',
      'reachedPreparation',
      'nativeOutcome',
      'append',
      'actualModifierRead',
      'damageHpRead',
      'npConsumption',
      'recovery',
    ] as const,
    gate: {
      sources: sources.length,
      declarations: declarations.length,
      expectedCells: expectedCount,
      observedCells: observations.length,
      failures,
      firstDifference: failures[0] ?? null,
    },
  };
}
