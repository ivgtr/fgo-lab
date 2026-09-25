import {
  activationChoiceGroupKey,
  activationFactKey,
  activationOperationTriggerKey,
  activationSourceQuantityKey,
  type ActivationFact,
  type AnalyzedActivationFactSet,
} from '@fgo-lab/schema';
import type { ConditionExpression } from './contracts';

export type ActivationConditionAnalysis =
  | {
      status: 'supported';
      atoms: readonly ActivationFact[];
      materialization:
        | { kind: 'none' }
        | { kind: 'deterministic'; facts: readonly ActivationFact[] }
        | { kind: 'ambiguous' };
    }
  | { status: 'unsupported'; reason: 'negatedActivationRequirement' };

function isActivationAtom(
  condition: ConditionExpression,
): condition is ActivationFact & ConditionExpression {
  return (
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger' ||
    condition.kind === 'sourceQuantity'
  );
}

export function analyzeActivationCondition(
  condition: ConditionExpression,
): ActivationConditionAnalysis {
  if (isActivationAtom(condition))
    return {
      status: 'supported',
      atoms: [condition],
      materialization: { kind: 'deterministic', facts: [condition] },
    };
  if (condition.kind === 'not') {
    const child = analyzeActivationCondition(condition.expression);
    return child.status === 'supported' && child.atoms.length === 0
      ? { status: 'supported', atoms: [], materialization: { kind: 'none' } }
      : { status: 'unsupported', reason: 'negatedActivationRequirement' };
  }
  if (condition.kind !== 'all' && condition.kind !== 'any')
    return { status: 'supported', atoms: [], materialization: { kind: 'none' } };
  const children = condition.expressions.map(analyzeActivationCondition);
  if (children.some(({ status }) => status === 'unsupported'))
    return { status: 'unsupported', reason: 'negatedActivationRequirement' };
  const supported = children.filter(
    (child): child is Extract<ActivationConditionAnalysis, { status: 'supported' }> =>
      child.status === 'supported',
  );
  const atoms = supported.flatMap((child) => child.atoms);
  if (atoms.length === 0) return { status: 'supported', atoms, materialization: { kind: 'none' } };
  if (condition.kind === 'all') {
    const ambiguous = supported.some(({ materialization }) => materialization.kind === 'ambiguous');
    return {
      status: 'supported',
      atoms,
      materialization: ambiguous ? { kind: 'ambiguous' } : { kind: 'deterministic', facts: atoms },
    };
  }
  const activationBranches = supported.filter(({ atoms: branchAtoms }) => branchAtoms.length > 0);
  if (
    activationBranches.length !== 1 ||
    activationBranches[0]!.materialization.kind !== 'deterministic'
  )
    return { status: 'supported', atoms, materialization: { kind: 'ambiguous' } };
  return {
    status: 'supported',
    atoms,
    materialization: activationBranches[0]!.materialization,
  };
}

export function conditionHasActivationFact(condition: ConditionExpression): boolean {
  const analysis = analyzeActivationCondition(condition);
  return analysis.status === 'unsupported' || analysis.atoms.length > 0;
}

export function conditionAllowsEffectLocalDecision(condition: ConditionExpression | null): boolean {
  if (condition === null) return false;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(conditionAllowsEffectLocalDecision);
  if (condition.kind === 'not') return conditionAllowsEffectLocalDecision(condition.expression);
  return (
    condition.kind === 'trait' ||
    condition.kind === 'traitCount' ||
    isActivationAtom(condition) ||
    condition.kind === 'targetPredicate' ||
    condition.kind === 'quantity'
  );
}

export function conditionHasNonActivationDecision(condition: ConditionExpression | null): boolean {
  if (condition === null) return false;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(conditionHasNonActivationDecision);
  if (condition.kind === 'not') return conditionHasNonActivationDecision(condition.expression);
  return (
    condition.kind === 'trait' ||
    condition.kind === 'traitCount' ||
    condition.kind === 'targetPredicate' ||
    condition.kind === 'quantity' ||
    condition.kind === 'inputQuantity'
  );
}

export function conditionRequiresActivationFact(
  condition: ConditionExpression,
  fact: ActivationFact,
): boolean {
  const analysis = analyzeActivationCondition(condition);
  return (
    analysis.status === 'supported' &&
    analysis.atoms.some((atom) => activationFactKey(atom) === activationFactKey(fact))
  );
}

export function activationChoiceKeys(condition: ConditionExpression): string[] {
  const analysis = analyzeActivationCondition(condition);
  if (analysis.status !== 'supported') return [];
  return analysis.atoms.flatMap((atom) =>
    atom.kind === 'choice' ? [activationFactKey(atom)] : [],
  );
}

export function conditionIsActivationLocal(condition: ConditionExpression): boolean {
  if (condition.kind === 'always' || isActivationAtom(condition)) return true;
  return condition.kind === 'all' && condition.expressions.every(conditionIsActivationLocal);
}

export function evaluateActivationRequirement(
  condition: ConditionExpression,
  factSet: AnalyzedActivationFactSet,
): boolean | null {
  if (condition.kind === 'choice') {
    const selected = factSet.choices.get(
      activationChoiceGroupKey(condition.source, condition.family),
    );
    return selected === undefined ? null : selected === condition.candidate;
  }
  if (condition.kind === 'operationTrigger')
    return factSet.operationTriggers.has(
      activationOperationTriggerKey(condition.source, condition.position),
    )
      ? true
      : null;
  if (condition.kind === 'sourceQuantity') {
    const range = factSet.sourceQuantityRanges.get(
      activationSourceQuantityKey(condition.source, condition.quantity, condition.subjectId),
    );
    if (!range) return null;
    const required =
      condition.comparison === 'atLeast'
        ? { min: condition.value, max: Number.MAX_SAFE_INTEGER }
        : { min: Number.MIN_SAFE_INTEGER, max: condition.value };
    if (range.max < required.min || range.min > required.max) return false;
    return range.min >= required.min && range.max <= required.max ? true : null;
  }
  if (condition.kind === 'all') {
    const values = condition.expressions.map((child) =>
      evaluateActivationRequirement(child, factSet),
    );
    if (values.includes(false)) return false;
    return values.every((value) => value === true) ? true : null;
  }
  if (condition.kind === 'any') {
    const values = condition.expressions.map((child) =>
      evaluateActivationRequirement(child, factSet),
    );
    if (values.includes(true)) return true;
    return values.every((value) => value === false) ? false : null;
  }
  if (condition.kind === 'not') {
    const value = evaluateActivationRequirement(condition.expression, factSet);
    return value === null ? null : !value;
  }
  return null;
}

export function hasMissingMandatoryActivationFact(
  condition: ConditionExpression,
  factSet: AnalyzedActivationFactSet,
): boolean {
  if (isActivationAtom(condition))
    return evaluateActivationRequirement(condition, factSet) === null;
  if (condition.kind === 'all')
    return condition.expressions.some((child) => hasMissingMandatoryActivationFact(child, factSet));
  if (condition.kind === 'any')
    return (
      condition.expressions.length > 0 &&
      condition.expressions.every((child) => hasMissingMandatoryActivationFact(child, factSet))
    );
  return condition.kind === 'not'
    ? hasMissingMandatoryActivationFact(condition.expression, factSet)
    : false;
}
