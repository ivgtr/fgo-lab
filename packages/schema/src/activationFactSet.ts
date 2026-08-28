import type { ActivationFact, ActivationSourceRef } from './index';

export interface ActivationQuantityRange {
  min: number;
  max: number;
}

export type ActivationFactSetIssue =
  | { kind: 'nonCanonicalOrder'; index: number; factKey: string }
  | { kind: 'duplicateFact'; index: number; factKey: string }
  | { kind: 'conflictingChoiceSelection'; index: number; factKey: string; groupKey: string }
  | {
      kind: 'conflictingSourceQuantityRange';
      index: number;
      factKey: string;
      ownerKey: string;
    };

export interface AnalyzedActivationFactSet {
  facts: readonly ActivationFact[];
  factKeys: ReadonlySet<string>;
  choices: ReadonlyMap<string, string>;
  operationTriggers: ReadonlySet<string>;
  sourceQuantityRanges: ReadonlyMap<string, ActivationQuantityRange>;
}

export type ActivationFactSetAnalysis =
  | { status: 'valid'; factSet: AnalyzedActivationFactSet }
  | { status: 'invalid'; issues: readonly ActivationFactSetIssue[] };

export function activationSourceKey(source: ActivationSourceRef): string {
  return JSON.stringify([source.origin, source.sourceInstanceId, source.skillId]);
}

export function activationChoiceGroupKey(source: ActivationSourceRef, family: string): string {
  return JSON.stringify([activationSourceKey(source), family]);
}

export function activationOperationTriggerKey(
  source: ActivationSourceRef,
  position: number,
): string {
  return JSON.stringify([activationSourceKey(source), position]);
}

export function activationSourceQuantityKey(
  source: ActivationSourceRef,
  quantity: 'battlePointRate',
  subjectId: string,
): string {
  return JSON.stringify([activationSourceKey(source), quantity, subjectId]);
}

export function activationFactKey(fact: ActivationFact): string {
  const source = activationSourceKey(fact.source);
  if (fact.kind === 'choice')
    return JSON.stringify([fact.kind, source, fact.family, fact.candidate]);
  if (fact.kind === 'operationTrigger') return JSON.stringify([fact.kind, source, fact.position]);
  return JSON.stringify([
    fact.kind,
    source,
    fact.quantity,
    fact.subjectId,
    fact.comparison,
    fact.value,
  ]);
}

function intersectQuantityRange(
  previous: ActivationQuantityRange,
  fact: Extract<ActivationFact, { kind: 'sourceQuantity' }>,
): ActivationQuantityRange {
  return fact.comparison === 'atLeast'
    ? { min: Math.max(previous.min, fact.value), max: previous.max }
    : { min: previous.min, max: Math.min(previous.max, fact.value) };
}

export function analyzeActivationFactSet(
  facts: readonly ActivationFact[],
): ActivationFactSetAnalysis {
  const issues: ActivationFactSetIssue[] = [];
  const factKeys = new Set<string>();
  const choices = new Map<string, string>();
  const operationTriggers = new Set<string>();
  const sourceQuantityRanges = new Map<string, ActivationQuantityRange>();
  let previousKey: string | undefined;
  for (const [index, fact] of facts.entries()) {
    const factKey = activationFactKey(fact);
    if (previousKey !== undefined && previousKey.localeCompare(factKey) > 0)
      issues.push({ kind: 'nonCanonicalOrder', index, factKey });
    previousKey = factKey;
    if (factKeys.has(factKey)) issues.push({ kind: 'duplicateFact', index, factKey });
    factKeys.add(factKey);
    if (fact.kind === 'choice') {
      const groupKey = activationChoiceGroupKey(fact.source, fact.family);
      const selected = choices.get(groupKey);
      if (selected !== undefined && selected !== fact.candidate)
        issues.push({ kind: 'conflictingChoiceSelection', index, factKey, groupKey });
      else choices.set(groupKey, fact.candidate);
    } else if (fact.kind === 'operationTrigger')
      operationTriggers.add(activationOperationTriggerKey(fact.source, fact.position));
    else {
      const ownerKey = activationSourceQuantityKey(fact.source, fact.quantity, fact.subjectId);
      const range = intersectQuantityRange(
        sourceQuantityRanges.get(ownerKey) ?? {
          min: Number.MIN_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
        },
        fact,
      );
      sourceQuantityRanges.set(ownerKey, range);
      if (range.min > range.max)
        issues.push({
          kind: 'conflictingSourceQuantityRange',
          index,
          factKey,
          ownerKey,
        });
    }
  }
  return issues.length > 0
    ? { status: 'invalid', issues }
    : {
        status: 'valid',
        factSet: {
          facts: [...facts],
          factKeys,
          choices,
          operationTriggers,
          sourceQuantityRanges,
        },
      };
}
