import type { PreNoblePhantasmState } from './preparationContracts';

/** The candidate needs initial physical facts, not the preparation action history. */
export type InitialPreparationFacts = Pick<
  PreNoblePhantasmState,
  'hp' | 'inputFacts' | 'battlePoints' | 'buffInstances'
> & {
  readonly quantityProofs: PreNoblePhantasmState['conditionFactProofs']['quantities'];
};

export function captureInitialPreparationFacts(
  state: PreNoblePhantasmState,
): InitialPreparationFacts {
  return {
    hp: state.hp,
    inputFacts: state.inputFacts,
    battlePoints: state.battlePoints,
    buffInstances: state.buffInstances,
    quantityProofs: state.conditionFactProofs.quantities,
  };
}
