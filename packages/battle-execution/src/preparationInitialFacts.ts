import type { PreparationStateSnapshot } from './preparationContracts';

/** The candidate needs initial physical facts, not the preparation action history. */
export type InitialPreparationFacts = Pick<
  PreparationStateSnapshot,
  'hp' | 'inputFacts' | 'battlePoints' | 'buffInstances'
> & {
  readonly quantityProofs: PreparationStateSnapshot['conditionFactProofs']['quantities'];
};

export function captureInitialPreparationFacts(
  state: PreparationStateSnapshot,
): InitialPreparationFacts {
  return {
    hp: state.hp,
    inputFacts: state.inputFacts,
    battlePoints: state.battlePoints,
    buffInstances: state.buffInstances,
    quantityProofs: state.conditionFactProofs.quantities,
  };
}
