import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
import type { ConditionEvaluationState } from './condition';
import { evaluateCondition } from './condition';
import { traitConditionEvaluationSource } from './conditionSemantics';
import type { ConditionExpression } from './contracts';
import type { OcSourceProgram } from './ocSourceProgram';

export const OC_WORLD_TRAIT_INPUT_PREFIX = 'oc:world:';
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
        label: '攻撃役のHP割合',
        description: 'OC条件の評価に用いる現在HP割合',
        minimum: 0,
        maximum: 1000,
        step: 10,
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
    if (condition.kind !== 'trait' || traitConditionEvaluationSource(condition) !== 'worldFacts')
      return null;
    if (
      program.conditionActor === 'source' &&
      (condition.scope === 'attacker' || condition.scope === 'attackerState')
    )
      return null;
    const fact = {
      kind: 'trait' as const,
      scope: condition.scope,
      trait: condition.trait,
      present: true,
    };
    const owner = condition.scope.startsWith('attacker')
      ? 'attacker'
      : condition.scope.startsWith('target')
        ? 'target'
        : 'field';
    return {
      key: OC_WORLD_TRAIT_INPUT_PREFIX + JSON.stringify(fact),
      kind: 'worldTraitPresence',
      owner,
      label: `${condition.trait}の有無`,
      description: 'OC条件の事実を指定（0:なし、1:あり）',
      minimum: 0,
      maximum: 1,
      step: 1,
      defaultValue: null,
      defaultReason: null,
    };
  };
  return visit(program.condition);
}
