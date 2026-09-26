import type {
  BattlePointState,
  PreparationTransitionResult,
  AppliedPreparationAction,
  readBattlePoint,
} from '@fgo-lab/battle-execution';
import type { BattlePointDomain, NoblePhantasmVariant } from '@fgo-lab/master-data';
import type { DamageResolutionInput, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { CalculationExecutionObservation } from './scenario';

export interface BattlePointPreparationObservation {
  transitions: readonly {
    before: { battlePoints: BattlePointState; appliedActionCount: number };
    command: PreNoblePhantasmCommand;
    result: {
      status: PreparationTransitionResult['status'];
      state: {
        battlePoints: BattlePointState;
        appliedActions: readonly AppliedPreparationAction[];
      };
    };
  }[];
  conversion?: {
    state: BattlePointState;
    domain: BattlePointDomain | undefined;
    value: ReturnType<typeof readBattlePoint>;
    phase: number | null;
    input: DamageResolutionInput;
    parameter: Extract<
      NoblePhantasmVariant,
      { kind: 'attack' }
    >['damage'][number]['parametersByOvercharge'][number][number];
  };
}

// Capture-only attachment keeps the ordinary/public observation and existing artifacts stable.
const battlePointPreparationObservations = new WeakMap<
  CalculationExecutionObservation,
  BattlePointPreparationObservation
>();
export function battlePointPreparationObservationFor(
  observation: CalculationExecutionObservation | undefined,
) {
  return observation ? battlePointPreparationObservations.get(observation) : undefined;
}

export function attachBattlePointPreparationObservation(
  observation: CalculationExecutionObservation,
  preparation: BattlePointPreparationObservation,
): void {
  battlePointPreparationObservations.set(observation, preparation);
}
