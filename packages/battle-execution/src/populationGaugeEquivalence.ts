import { noblePhantasmReadsOc } from './ocDependency';
import { effectExecutesInNpProgram } from './npProgramScope';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import { applyNpResourceTransaction, npMutationFromCanonicalAmount } from './npResource';
import { resolveResourceTargetPolicy } from './effectRouting';
import { canonicalRequirementLeaves } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import { deriveBaseOvercharge } from './npResource';

import type { OcResourceDependencyContext } from './ocResourceDependencies';

/** Positive-only preparation observes population inputs only through terminal damage: either
 * the entire gauge interval has one OC, or the selected terminal NP cannot read OC. */
export function populationInputsHaveEquivalentTerminalDamage(
  sources: readonly SourceEffect[],
  context: Pick<OcResourceDependencyContext, 'semantics' | 'npLevel' | 'initialGauge'>,
  terminalVariant?: NoblePhantasmVariant,
): boolean {
  const hpTransfers = sources.some((source) =>
    source.effect.execution.some(
      (op) =>
        op.kind === 'resourceMutation' && op.resource === 'hp' && op.amount.kind === 'hpTransfer',
    ),
  );
  if (
    hpTransfers &&
    (terminalVariant?.kind !== 'attack' ||
      terminalVariant.damage.some((damage) => damage.kind === 'hpRatioLow') ||
      sources.some(
        (source) =>
          canonicalRequirementLeaves(source.effect.requirement.expression).some(
            (leaf) => leaf.kind === 'quantity' && leaf.quantity === 'attackerHpPermille',
          ) ||
          source.effect.execution.some(
            (op) =>
              (op.kind === 'resourceMutation' &&
                op.resource === 'hp' &&
                op.direction === 'loss' &&
                op.lossFloor === 'zero') ||
              ((op.kind === 'damageModifier' || op.kind === 'modifierRateChange') &&
                op.valueExpressions
                  .flat()
                  .some(
                    (expression) =>
                      expression?.kind === 'inverseHpLinear' ||
                      expression?.kind === 'hpRangeLinear',
                  )),
          ),
      ))
  )
    return false;
  const terminalInsensitive =
    terminalVariant?.kind === 'attack' &&
    terminalVariant.damage.every(
      (damage) => damage.kind === 'standard' || damage.kind === 'defensePiercing',
    ) &&
    !noblePhantasmReadsOc(terminalVariant);
  const functionTraits = new Set(
    sources.flatMap((source) =>
      source.effect.execution.flatMap((op) =>
        op.kind === 'populationFunction'
          ? op.action.kind === 'grant'
            ? op.action.traits
            : [op.action.trait]
          : [],
      ),
    ),
  );
  if (
    sources.some((source) =>
      canonicalRequirementLeaves(source.effect.requirement.expression).some(
        (leaf) =>
          leaf.kind === 'trait' &&
          functionTraits.has(leaf.trait) &&
          (leaf.scope === 'opponent' ||
            leaf.scope === 'opponentState' ||
            ((leaf.scope === 'recipient' || leaf.scope === 'recipientState') &&
              resolveResourceTargetPolicy(source.origin, source.effect.requirement.recipient) ===
                'target')),
      ),
    )
  )
    return false;
  const keys = new Set(
    sources.flatMap((source) =>
      source.effect.inputDefinitions
        .filter(
          (input) =>
            (input.kind === 'transferDonor' && input.resource !== 'enemyHp') ||
            input.kind === 'populationSize' ||
            input.kind === 'populationCount' ||
            input.kind === 'populationActorValue',
        )
        .map((input) => input.key),
    ),
  );
  if (
    sources.some(
      (source) =>
        canonicalRequirementLeaves(source.effect.requirement.expression).some(
          (leaf) => leaf.kind === 'inputQuantity' && keys.has(leaf.inputKey),
        ) ||
        source.effect.execution.some(
          (operation) =>
            (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange') &&
            [
              ...operation.valueExpressions.flat(),
              ...(operation.limitBreakValueExpressions?.flat() ?? []),
            ].some(
              (expression) => expression?.kind === 'inputLinear' && keys.has(expression.inputKey),
            ),
        ),
    )
  )
    return false;
  const capacity = context.semantics.capacityByNpLevel[context.npLevel - 1]!;
  let lower = context.initialGauge;
  let upper = lower;
  if (lower < context.semantics.noblePhantasmUse.requirement) return false;
  for (const source of sources)
    for (const operation of source.effect.execution) {
      if (!effectExecutesInNpProgram(source.effect)) continue;
      if (
        operation.kind === 'populationFunction' &&
        (!terminalInsensitive ||
          source.origin !== 'attacker' ||
          !source.sourceEnabled ||
          source.effect.proc.kind !== 'guaranteed')
      )
        return false;
      if (
        operation.kind === 'populationMutation' &&
        ((operation.mutation !== 'grant' &&
          !(terminalInsensitive && operation.mutation === 'remove')) ||
          source.effect.requirement.expression.kind !== 'always' ||
          source.effect.proc.kind !== 'guaranteed')
      )
        return false;
      if (
        operation.kind === 'transformActorForm' ||
        operation.kind === 'selectNoblePhantasmVariant'
      )
        return false;
      if (operation.kind === 'unsupported' && operation.damageRelevant) return false;
      if (operation.kind !== 'resourceMutation' || operation.resource !== 'npGauge') continue;
      if (source.origin !== 'attacker' || !source.sourceEnabled || !source.enabledByDefault)
        return false;
      const recipient = resolveResourceTargetPolicy(source.origin, operation.recipient);
      if (recipient === 'unresolved') return false;
      if (recipient !== 'attacker') continue;
      if (
        operation.direction !== 'gain' ||
        operation.amount.kind === 'dependent' ||
        operation.amount.kind === 'buffCount'
      )
        return false;
      const coefficient = (
        source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values
      )?.[source.valueSetIndex]?.[source.valueIndex];
      if (coefficient === undefined || coefficient === null || coefficient < 0) return false;
      let min = coefficient;
      let max = coefficient;
      if (operation.amount.kind === 'npTransfer') {
        min = 0;
        max = coefficient * operation.amount.inputKeys.length;
      }
      if (operation.amount.kind === 'populationCount') {
        const selector = operation.amount.selector;
        const maximum =
          selector.scope === 'recipient'
            ? 1
            : selector.scope === 'allActors'
              ? 6
              : selector.scope === 'otherActors'
                ? 5
                : 3;
        min =
          selector.basis === 'inBattle'
            ? coefficient * (selector.scope === 'allActors' ? 2 : 1)
            : 0;
        max =
          selector.counting === 'actors' || selector.basis === 'inBattle'
            ? maximum * coefficient
            : capacity;
      }
      const outcomes: number[] = [];
      for (const [gauge, amount] of [
        [lower, min],
        [upper, max],
      ] as const) {
        const mutation = ['populationCount', 'npTransfer'].includes(operation.amount.kind)
          ? { kind: 'gain' as const, amount }
          : npMutationFromCanonicalAmount(operation, amount);
        const result = applyNpResourceTransaction(
          context.semantics,
          { npLevel: context.npLevel, capacity, gauge },
          { requirement: null, mutations: [mutation] },
        );
        if (result.status !== 'applied') return false;
        outcomes.push(result.state.gauge);
      }
      const certain =
        source.effect.requirement.expression.kind === 'always' &&
        source.effect.proc.kind === 'guaranteed' &&
        source.effect.selection?.kind !== 'stochasticOutcome';
      lower = certain ? outcomes[0]! : Math.min(lower, outcomes[0]!);
      upper = outcomes[1]!;
    }
  return (
    terminalInsensitive ||
    deriveBaseOvercharge(context.semantics, lower) ===
      deriveBaseOvercharge(context.semantics, upper)
  );
}
