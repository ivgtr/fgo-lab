import { actorFormKey, noblePhantasmVariantKey, type ActorFormId } from '@fgo-lab/master-data';
import type { AttackProfile } from './attackProfile';
import type { CalculationExecution } from './scenario';

function selectedAverage(
  execution: CalculationExecution,
  attackProfile: AttackProfile,
  expectedTerminalFormId: ActorFormId | undefined,
  npLevel: 1 | 2 | 3 | 4 | 5,
): number | null {
  if (execution.result.status !== 'calculated' || execution.scenario.mode !== 'resolved')
    return null;
  if (
    execution.noblePhantasmVariant?.kind !== 'attack' ||
    noblePhantasmVariantKey(execution.noblePhantasmVariant.ref) !==
      noblePhantasmVariantKey(attackProfile.noblePhantasmVariant) ||
    execution.terminalActorFormId === null ||
    (expectedTerminalFormId !== undefined &&
      actorFormKey(expectedTerminalFormId) !== actorFormKey(execution.terminalActorFormId))
  )
    return null;
  return execution.result.rows[npLevel - 1]?.average ?? null;
}

function externalFactCount(execution: CalculationExecution): number {
  if (execution.scenario.mode !== 'resolved') return 0;
  return execution.scenario.worldFactAssertions.filter(
    ({ decisionKey, fact }) =>
      decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
  ).length;
}

const activationFactCount = (execution: CalculationExecution): number =>
  execution.appliedPreparationActions.reduce(
    (count, action) => count + action.activationFacts.length,
    0,
  );

const transitionCount = (execution: CalculationExecution): number =>
  execution.appliedPreparationActions.filter(({ transition }) => transition !== null).length;

export function rankingExecutionSelection(
  execution: CalculationExecution,
  attackProfile: AttackProfile,
  expectedTerminalFormId: ActorFormId | undefined,
  npLevel: 1 | 2 | 3 | 4 | 5,
  candidateKey: string,
  baselineInputDeviation: number,
) {
  const average = selectedAverage(execution, attackProfile, expectedTerminalFormId, npLevel);
  if (average === null) return null;
  return {
    average,
    externalFactCount: externalFactCount(execution),
    activationFactCount: activationFactCount(execution),
    transitionCount: transitionCount(execution),
    noblePhantasmVariantKey:
      execution.noblePhantasmVariant?.kind === 'attack'
        ? noblePhantasmVariantKey(execution.noblePhantasmVariant.ref)
        : '',
    baselineInputDeviation,
    preparationActionCount: execution.appliedPreparationActions.length,
    candidateKey,
  };
}
