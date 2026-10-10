import type { PreparationOcAttemptSnapshot } from '@fgo-lab/battle-execution/preparation-audit';
import type {
  BattlePointState,
  PreparationTransitionResult,
  AppliedPreparationAction,
  readBattlePoint,
  PreNoblePhantasmState,
  PreparedOrderedScenario,
  OrderedScenarioExecution,
} from '@fgo-lab/battle-execution';
import type { BattlePointDomain, NoblePhantasmVariant } from '@fgo-lab/master-data';
import type { DamageResolutionInput, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { CalculationExecutionObservation, ScenarioPreparationOutcome } from './scenario';

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

export interface BattlePointPreparationRejectionObservation {
  damageInputGenerated?: DamageResolutionInput;
  orderedScenario?: PreparedOrderedScenario;
  orderedExecution?: OrderedScenarioExecution;
  transitions: {
    before: PreNoblePhantasmState;
    command: PreNoblePhantasmCommand;
    result: PreparationTransitionResult;
    attempts: readonly PreparationOcAttemptSnapshot[] | undefined;
  }[];
  rejection?: Extract<ScenarioPreparationOutcome, { status: 'rejected' }>;
}
const rejectionObservations = new WeakMap<object, BattlePointPreparationRejectionObservation>();
export function attachBattlePointPreparationRejectionObservation(
  owner: object,
  observation: BattlePointPreparationRejectionObservation,
): void {
  rejectionObservations.set(owner, observation);
}
export function battlePointPreparationRejectionObservationFor(owner: object) {
  return rejectionObservations.get(owner);
}

/** Preserve the original selected preparation capture when its product wrapper is copied. */
export function carryBattlePointPreparationObservation<T extends object>(from: object, to: T): T {
  const capture = rejectionObservations.get(from);
  if (capture) rejectionObservations.set(to, capture);
  return to;
}
