import {
  activationFactKey,
  analyzeActivationFactSet,
  type ActivationFact,
  type ActivationFactSetIssue,
  type ActivationSourceRef,
} from '@fgo-lab/schema';
import {
  analyzeActivationCondition,
  evaluateActivationRequirement,
  hasMissingMandatoryActivationFact,
} from './activationCondition';
import type {
  ActivationContext,
  BattleOperation,
  ConditionExpression,
  EffectDecision,
  ExecutionIssue,
} from './contracts';

export type ActivationContextResult =
  | { status: 'valid'; context: ActivationContext }
  | { status: 'invalid'; issues: readonly ExecutionIssue[] };

export interface ActivationRequirementOwner {
  operationId: string;
  decisionKey: string | null;
  enabledByDefault: boolean;
  sourceEnabled: boolean;
  decisionPlan: BattleOperation['decisionPlan'];
  activation: BattleOperation['activation'];
  condition: ConditionExpression;
  facts: readonly ActivationFact[];
}

export function activationSourceRefForOperation(operation: BattleOperation): ActivationSourceRef {
  return {
    origin: operation.source.origin,
    sourceInstanceId: operation.source.sourceInstanceId,
    skillId: operation.source.skillId || null,
  };
}

export function collectActivationRequirementOwners(
  operations: readonly BattleOperation[],
): ActivationRequirementOwner[] {
  return operations.flatMap((operation) => {
    const analysis = analyzeActivationCondition(operation.condition);
    return analysis.status === 'supported' && analysis.atoms.length > 0
      ? [
          {
            operationId: operation.operationId,
            decisionKey: operation.decisionKey,
            enabledByDefault: operation.enabledByDefault,
            sourceEnabled: operation.sourceEnabled,
            decisionPlan: operation.decisionPlan,
            activation: operation.activation,
            condition: operation.condition,
            facts: analysis.atoms,
          },
        ]
      : [];
  });
}

export function activationRequirementOwnerSelected(
  owner: ActivationRequirementOwner,
  decisions: ReadonlyMap<string, EffectDecision>,
): boolean {
  if (!owner.sourceEnabled) return false;
  if (owner.activation.kind === 'linkedDecisions')
    return owner.activation.links.some(
      (link) => decisions.get(link.decisionKey)?.operationEnabled === true,
    );
  if (owner.decisionKey === null) return owner.enabledByDefault;
  const decision = decisions.get(owner.decisionKey);
  if (decision) return decision.operationEnabled;
  return owner.decisionPlan.condition === 'userMayAssume' ? false : owner.enabledByDefault;
}

function operationSelected(
  operation: BattleOperation,
  decisions: ReadonlyMap<string, EffectDecision>,
): boolean {
  return activationRequirementOwnerSelected(
    {
      operationId: operation.operationId,
      decisionKey: operation.decisionKey,
      enabledByDefault: operation.enabledByDefault,
      sourceEnabled: operation.sourceEnabled,
      decisionPlan: operation.decisionPlan,
      activation: operation.activation,
      condition: operation.condition,
      facts: [],
    },
    decisions,
  );
}

function factSetIssue(issue: ActivationFactSetIssue): ExecutionIssue {
  return {
    kind: 'invalidActivationContext',
    detail: issue.kind,
    factKey: issue.factKey,
  };
}

function validateFactReachability(
  facts: readonly ActivationFact[],
  operations: readonly BattleOperation[],
): ExecutionIssue[] {
  const operationSources = new Set(
    operations.map((operation) => JSON.stringify(activationSourceRefForOperation(operation))),
  );
  const requirementKeys = new Set(
    collectActivationRequirementOwners(operations).flatMap(({ facts: required }) =>
      required.map(activationFactKey),
    ),
  );
  const issues: ExecutionIssue[] = [];
  for (const fact of facts) {
    const factKey = activationFactKey(fact);
    if (!operationSources.has(JSON.stringify(fact.source)))
      issues.push({ kind: 'invalidActivationContext', detail: 'unknownFact', factKey });
    else if (!requirementKeys.has(factKey))
      issues.push({ kind: 'invalidActivationContext', detail: 'orphanFact', factKey });
  }
  return issues;
}

function validateSelectedOperationRequirements(
  operations: readonly BattleOperation[],
  decisions: ReadonlyMap<string, EffectDecision>,
  context: ActivationContext,
): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  for (const operation of operations) {
    const analysis = analyzeActivationCondition(operation.condition);
    if (analysis.status === 'unsupported') {
      issues.push({
        kind: 'invalidActivationContext',
        detail: analysis.reason,
        operationId: operation.operationId,
      });
      continue;
    }
    if (
      !operationSelected(operation, decisions) ||
      analysis.atoms.length === 0 ||
      evaluateActivationRequirement(operation.condition, context) === false ||
      !hasMissingMandatoryActivationFact(operation.condition, context)
    )
      continue;
    issues.push({
      kind: 'invalidActivationContext',
      detail: 'missingRequiredFact',
      operationId: operation.operationId,
    });
  }
  return issues;
}

export function buildActivationContext(
  facts: readonly ActivationFact[],
  operations: readonly BattleOperation[],
  decisions: ReadonlyMap<string, EffectDecision>,
): ActivationContextResult {
  const factSet = analyzeActivationFactSet(facts);
  if (factSet.status === 'invalid')
    return { status: 'invalid', issues: factSet.issues.map(factSetIssue) };
  const reachabilityIssues = validateFactReachability(facts, operations);
  const requirementIssues = validateSelectedOperationRequirements(
    operations,
    decisions,
    factSet.factSet,
  );
  const issues = [...reachabilityIssues, ...requirementIssues];
  return issues.length > 0
    ? { status: 'invalid', issues }
    : { status: 'valid', context: factSet.factSet };
}
