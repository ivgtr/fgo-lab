import { sourceMaximumHpInput } from './operationCompiler';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
import type { ConditionEvaluationState } from './condition';
import { evaluateCondition } from './condition';
import { traitConditionEvaluationSource } from './conditionSemantics';
import type { ConditionExpression } from './contracts';
import type { OcSourceProgram } from './ocSourceProgram';

export const SOURCE_CHOICE_INPUT_PREFIX = 'preparation:choice:';
export const OC_WORLD_TRAIT_INPUT_PREFIX = 'oc:world:';
export const SOURCE_WORLD_TRAIT_INPUT_PREFIX = 'preparation:sourceWorld:';
/** Inputs assert individual canonical facts, never the truth of a composite expression. */
export function requiredOcConditionInput(
  program: OcSourceProgram,
  facts: ConditionEvaluationState,
): CanonicalInputDefinition | null {
  const visit = (condition: ConditionExpression): CanonicalInputDefinition | null => {
    if (evaluateCondition(condition, facts) !== null) return null;
    if (condition.kind === 'all' || condition.kind === 'any') {
      for (const child of condition.expressions) {
        const input = visit(child);
        if (input) return input;
      }
      return null;
    }
    if (condition.kind === 'not') return visit(condition.expression);
    if (
      condition.kind === 'quantity' &&
      condition.quantity === 'attackerHpPermille' &&
      condition.subjectId === undefined &&
      program.conditionActor === 'attacker'
    )
      return {
        key: 'oc:hp:attacker',
        kind: 'sourceHpPermille',
        owner: 'attacker',
        label: '準備開始時のHP（%）',
        description: '準備操作を適用する前の攻撃役のHP割合',
        minimum: 0,
        maximum: 1000,
        step: 10,
        defaultValue: null,
        defaultReason: null,
      };
    if (
      condition.kind === 'quantity' &&
      condition.quantity === 'attackerHpPermille' &&
      program.conditionActor === 'source'
    )
      return sourceMaximumHpInput(program.source);
    if (condition.kind === 'choice' && program.choiceCandidates?.length)
      return {
        key:
          SOURCE_CHOICE_INPUT_PREFIX +
          JSON.stringify([condition.source, condition.family, program.choiceCandidates]),
        kind: 'sourceChoice',
        owner: 'source',
        label: `${program.source.skillName}の選択肢`,
        description: `選択肢を0〜${program.choiceCandidates.length - 1}で指定`,
        minimum: 0,
        maximum: program.choiceCandidates.length - 1,
        step: 1,
        defaultValue: null,
        defaultReason: null,
      };
    if (condition.kind === 'traitCount') {
      for (const trait of condition.traits) {
        const input = visit({ kind: 'trait', scope: condition.scope, trait, present: true });
        if (input) return input;
      }
      return null;
    }
    if (condition.kind !== 'trait') return null;
    const markerActor =
      condition.scope === 'attacker' || condition.scope === 'attackerState'
        ? 'attacker'
        : condition.scope === 'target' || condition.scope === 'targetState'
          ? 'target'
          : null;
    const unresolvedMarker = (facts.buffInstances ?? []).find(
      (instance) =>
        instance.actor === markerActor &&
        instance.uncertain &&
        (instance.traits.includes(condition.trait) ||
          instance.marker?.actorTrait === condition.trait),
    );
    if (unresolvedMarker) return unresolvedMarker.requiredInput ?? null;
    if (traitConditionEvaluationSource(condition) !== 'worldFacts') return null;
    const sourceFact =
      program.conditionActor === 'source' &&
      (condition.scope === 'attacker' || condition.scope === 'attackerState');
    const stateScope =
      condition.scope === 'attacker'
        ? 'attackerState'
        : condition.scope === 'target'
          ? 'targetState'
          : null;
    const scope =
      stateScope &&
      facts.traits[condition.scope].get(condition.trait) === false &&
      facts.traits[stateScope].get(condition.trait) === undefined
        ? stateScope
        : condition.scope;
    const fact = {
      kind: 'trait' as const,
      scope,
      trait: condition.trait,
      present: true,
    };
    const owner = condition.scope.startsWith('attacker')
      ? 'attacker'
      : condition.scope.startsWith('target')
        ? 'target'
        : 'field';
    return {
      key: sourceFact
        ? SOURCE_WORLD_TRAIT_INPUT_PREFIX + JSON.stringify([program.source.sourceInstanceId, fact])
        : OC_WORLD_TRAIT_INPUT_PREFIX + JSON.stringify(fact),
      kind: 'worldTraitPresence',
      owner: sourceFact ? 'source' : owner,
      label: `${condition.trait}の有無`,
      description: '準備条件の事実を指定（0:なし、1:あり）',
      minimum: 0,
      maximum: 1,
      step: 1,
      defaultValue: null,
      defaultReason: null,
    };
  };
  return visit(program.condition);
}

/** Retain repaired initial facts as used canonical inputs during subsequent queries and replay. */
export function providedSourceConditionInputs(
  program: OcSourceProgram,
  facts: ConditionEvaluationState,
  values: Readonly<Record<string, number>>,
): CanonicalInputDefinition[] {
  if (program.source.origin !== 'support' && program.source.origin !== 'mysticCode') return [];
  const definitions: CanonicalInputDefinition[] = [];
  const absent = {
    ...facts,
    traits: {
      ...facts.traits,
      attacker: new Map<string, boolean>(),
      attackerState: new Map<string, boolean>(),
    },
    quantities: { ...facts.quantities, attackerHpPermille: null },
  };
  const ownerProgram = { ...program, conditionActor: 'source' as const };
  const max = requiredOcConditionInput(
    {
      ...ownerProgram,
      condition: {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'atLeast',
        value: 0,
      },
    },
    absent,
  );
  if (max && Object.hasOwn(values, max.key)) definitions.push(max);
  const register = (condition: typeof program.condition): void => {
    if (condition.kind === 'all' || condition.kind === 'any')
      return condition.expressions.forEach(register);
    if (condition.kind === 'not') return register(condition.expression);
    if (condition.kind !== 'trait' || !['attacker', 'attackerState'].includes(condition.scope))
      return;
    for (const scope of ['attacker', 'attackerState'] as const) {
      const input = requiredOcConditionInput(
        { ...ownerProgram, condition: { ...condition, scope } },
        absent,
      );
      if (input && Object.hasOwn(values, input.key)) definitions.push(input);
    }
  };
  register(program.condition);
  return definitions;
}
