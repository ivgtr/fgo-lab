import { effectExecutesInNpProgram, npProgramEffects } from './npProgramScope';
import type { MasterEffect, OcExecutionOperation } from '@fgo-lab/master-data';
import type { ConditionExpression } from './contracts';
import { evaluateCondition, type ConditionEvaluationState } from './condition';
import { compileEffectCondition } from './operationCompiler';
import type { SourceEffect } from './sourceCollection';

export type OcSourceOperation =
  | OcExecutionOperation
  | Extract<MasterEffect['execution'][number], { kind: 'unsupported' }>
  | (Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }> & { resource: 'hp' });
export interface OcSourceProgram {
  source: SourceEffect;
  condition: ConditionExpression;
  conditionActor: 'attacker' | 'source';
  operations: readonly OcSourceOperation[];
}

export function hasOcExecution(effect: MasterEffect): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return effect.execution.some(
    (operation) =>
      operation.kind === 'ocRemovalResistance' ||
      operation.kind === 'grantOcBoost' ||
      operation.kind === 'grantOcApplicationRate' ||
      operation.kind === 'removeOcState' ||
      (operation.kind === 'unsupported' && operation.reason === 'ocExecutionSemantics'),
  );
}
/** A resistance barrier has no evaluated amount/condition until its unsupported intersection. */
export function hasOcConditionReader(effect: MasterEffect): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return effect.execution.some(
    (operation) =>
      operation.kind === 'grantOcBoost' ||
      operation.kind === 'grantOcApplicationRate' ||
      operation.kind === 'removeOcState',
  );
}
type StaticOcProgram = Omit<OcSourceProgram, 'source'>;
const staticPrograms = new WeakMap<MasterEffect, Map<string, StaticOcProgram>>();
/** Compilation keeps every OC cell. Selection belongs to the individual NP-use receipt. */
export function compileOcSourceProgram(source: SourceEffect): OcSourceProgram {
  const key = JSON.stringify([
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  ]);
  const programs = staticPrograms.get(source.effect) ?? new Map<string, StaticOcProgram>();
  const cached = programs.get(key);
  if (cached) return { source, ...cached };
  const sourceCondition =
    (source.origin === 'support' || source.origin === 'mysticCode') &&
    source.effect.requirement.recipient === 'sourceSelf';
  const program: StaticOcProgram = {
    conditionActor: sourceCondition ? 'source' : 'attacker',
    condition: compileEffectCondition(
      source.effect,
      source.origin,
      source.sourceId,
      source.sourceInstanceId,
      source.skillId,
      sourceCondition,
    ),
    operations: (effectExecutesInNpProgram(source.effect) ? source.effect.execution : []).filter(
      (operation): operation is OcSourceOperation =>
        (operation.kind === 'unsupported' &&
          operation.damageRelevant &&
          operation.reason !== 'dependentResourceAmount') ||
        operation.kind === 'ocRemovalResistance' ||
        operation.kind === 'grantOcBoost' ||
        operation.kind === 'grantOcApplicationRate' ||
        operation.kind === 'removeOcState' ||
        operation.kind === 'ocStateNonIntersection' ||
        (operation.kind === 'resourceMutation' && operation.resource === 'hp'),
    ),
  };
  programs.set(key, program);
  staticPrograms.set(source.effect, programs);
  return { source, ...program };
}
export function evaluateOcSourceCondition(
  program: OcSourceProgram,
  state: ConditionEvaluationState,
) {
  return evaluateCondition(program.condition, state);
}

/** Terminal damage context stays with the damage executor unless a later OC operation reads it. */
export function terminalOcPreparationEffects(
  effects: readonly MasterEffect[],
): readonly MasterEffect[] {
  let laterOc = false;
  const hasOc = effects.some(hasOcExecution);
  const retained = new Set<MasterEffect>();
  for (const effect of [...npProgramEffects(effects)].reverse()) {
    const oc = hasOcExecution(effect);
    const invalidBeforeDamage =
      hasOc &&
      'timing' in effect &&
      effect.timing === 'beforeDamage' &&
      effect.execution.some(
        (operation) => operation.kind === 'unsupported' && operation.damageRelevant,
      );
    if (
      oc ||
      invalidBeforeDamage ||
      (laterOc &&
        effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' ||
            operation.kind === 'buffInstanceMutation' ||
            operation.kind === 'contextMutation' ||
            (operation.kind === 'unsupported' && operation.reason === 'dependentResourceAmount'),
        ))
    )
      retained.add(effect);
    laterOc ||= oc;
  }
  return effects.filter((effect) => retained.has(effect));
}
