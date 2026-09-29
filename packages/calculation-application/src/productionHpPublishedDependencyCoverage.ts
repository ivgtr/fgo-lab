import { isDeepStrictEqual } from 'node:util';
import type { BattleOperation, ConditionExpression, SourceEffect } from '@fgo-lab/battle-execution';
import {
  compiledSourcesFor,
  hpCandidateObservationFor,
} from '@fgo-lab/battle-execution/preparation-audit';
import { getNoblePhantasmVariants, noblePhantasmVariantKey } from '@fgo-lab/master-data';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
} from '@fgo-lab/master-data/production-audit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import {
  hpProofCoverageInventory,
  pairedHpRequirementLeaves,
  type HpProofDeclaration,
} from './productionHpProofCoverage';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

/** The original producer retains every request before its family selectors. */
export interface HpPublishedDependencyRequest {
  prepared: PreparedCalculationScenario;
  calculation?: CalculationExecution;
  ownerScope?: 'supportProjection';
  requestPhase?: 'original' | 'repairAttempt' | 'withInputs' | 'selected';
}
type Stage =
  | 'canonicalCondition'
  | 'canonicalNp'
  | 'expressionContext'
  | 'selectedPreparationCell'
  | 'actualConditionRead'
  | 'actualValueRead'
  | 'npEvaluation';
export interface HpPublishedDependencyBinding {
  family: 'publishedDependency';
  declaration: HpProofDeclaration;
  requestIndex: number;
  stage: Stage;
  position: number;
  operation: BattleOperation | null;
  sequence: number | null;
  group: number | null;
  sourceInstanceId: string;
  actor: string | null;
  recipient: string | null;
  actionId: string | null;
  actionIndex: number | null;
  candidateIndex: number | null;
  /** Original owner/capture references, validated before persistence. */
  reference: object;
  detail: object;
}
export type HpPublishedDependencyReason =
  | 'duplicateDeclaration'
  | 'requestOwnerMismatch'
  | 'unmatchedCanonical'
  | 'ambiguousCanonical'
  | 'missingCapture'
  | 'missingBinding'
  | 'duplicateBinding'
  | 'unmatchedBinding'
  | 'foreignDeclaration'
  | 'foreignReference'
  | 'bindingMismatch'
  | 'orderMismatch'
  | 'conditionReadMismatch'
  | 'valueReadMismatch'
  | 'npVariantSelectionMismatch'
  | 'candidatePreflightMismatch'
  | 'candidateEventMismatch';
interface Failure {
  reason: HpPublishedDependencyReason;
  path: string;
  canonicalIdentity?: string;
  firstDifference?: CanonicalAuditDifference;
}
type HpConditionLeaf = Extract<ConditionExpression, { kind: 'quantity' }>;
const hpLeaves = (condition: ConditionExpression): HpConditionLeaf[] =>
  condition.kind === 'all' || condition.kind === 'any'
    ? condition.expressions.flatMap(hpLeaves)
    : condition.kind === 'not'
      ? hpLeaves(condition.expression)
      : condition.kind === 'quantity' && condition.quantity === 'attackerHpPermille'
        ? [condition]
        : [];

const variantMatches = (
  declaration: HpProofDeclaration,
  ref: SourceEffect['noblePhantasmVariant'],
) =>
  declaration.identity.variant === null
    ? ref === null
    : ref !== null &&
      noblePhantasmVariantKey(declaration.identity.variant.ref) === noblePhantasmVariantKey(ref);
const sourceMatches = (
  declaration: HpProofDeclaration,
  source: BattleOperation['source'],
  ref: SourceEffect['noblePhantasmVariant'],
) =>
  (declaration.identity.origin === source.origin ||
    (declaration.identity.origin === 'attacker' && source.origin === 'support')) &&
  declaration.identity.owner === source.sourceId &&
  (declaration.identity.origin === 'np'
    ? declaration.identity.variant !== null &&
      declaration.identity.skill === declaration.identity.variant.ref.noblePhantasmId &&
      source.skillId === `np:${noblePhantasmVariantKey(declaration.identity.variant.ref)}`
    : declaration.identity.origin === 'craftEssence'
      ? source.skillId === `ce:${declaration.identity.skill}`
      : declaration.identity.skill === source.skillId) &&
  declaration.identity.occurrence === source.effectOccurrenceId &&
  declaration.effect?.id === source.effectId &&
  variantMatches(declaration, ref);
const compiledNpValueCell = (
  dependencies: readonly HpProofDeclaration[],
  ordered: PreparedCalculationScenario['orderedScenario'],
  operation: BattleOperation,
): HpProofDeclaration | null => {
  if (!ordered || operation.source.origin !== 'np') return null;
  const sources = compiledSourcesFor(ordered)?.filter(
    (source) =>
      source.phase === 'beforeNpDamage' &&
      source.sourceInstanceId === operation.source.sourceInstanceId &&
      source.effect.id === operation.source.effectId &&
      source.effect.occurrenceId === operation.source.effectOccurrenceId,
  );
  if (sources?.length !== 1) return null;
  const source = sources[0]!;
  const operationIndices = source.effect.execution.flatMap((candidate, index) =>
    (candidate.kind === 'damageModifier' || candidate.kind === 'modifierRateChange') &&
    candidate.valueExpressions[source.valueSetIndex]?.[source.valueIndex]
      ? [index]
      : [],
  );
  if (operationIndices.length !== 1) return null;
  const operationIndex = operationIndices[0]!;
  const matches = dependencies.filter(
    (declaration) =>
      declaration.identity.kind === 'valueExpression' &&
      declaration.effect === source.effect &&
      sourceMatches(declaration, operation.source, source.noblePhantasmVariant) &&
      declaration.identity.path ===
        `execution.${operationIndex}.valueExpressions.${source.valueSetIndex}.${source.valueIndex}`,
  );
  return matches.length === 1 ? matches[0]! : null;
};
const recipient = (declaration: HpProofDeclaration) => {
  const operation = declaration.operation;
  return operation && 'route' in operation
    ? operation.route.target
    : operation && 'recipient' in operation
      ? operation.recipient
      : (declaration.effect?.requirement.recipient ?? null);
};

/** Scenario ownership is weaker than canonical selection or an execution read. */
export function directScenarioOwnerIndex(requests: readonly HpPublishedDependencyRequest[]) {
  const owners = new Map<string, number[]>();
  const supportOwners = new Map<string, number[]>();
  const add = (origin: HpProofDeclaration['identity']['origin'], owner: string, index: number) => {
    const key = JSON.stringify([origin, owner]);
    const indices = owners.get(key);
    if (indices) indices.push(index);
    else owners.set(key, [index]);
  };
  requests.forEach(({ prepared, ownerScope }, index) => {
    const scenario = prepared.scenario;
    if (scenario.mode !== 'resolved') return;
    for (const origin of ['attacker', 'passive', 'np'] as const)
      add(origin, scenario.attacker.servantId, index);
    if (ownerScope === 'supportProjection')
      for (const source of scenario.support?.composition.sources ?? [])
        for (const skill of source.skills)
          if (skill.enabled) {
            const key = JSON.stringify([source.servantId, skill.skillId]);
            const indices = supportOwners.get(key);
            if (indices) indices.push(index);
            else supportOwners.set(key, [index]);
          }
    if (scenario.craftEssence) add('craftEssence', scenario.craftEssence.craftEssenceId, index);
    if (scenario.mysticCode) add('mysticCode', scenario.mysticCode.mysticCodeId, index);
  });
  return { owners, supportOwners };
}

/** Borrow existing captures only. A canonical context is neither selection nor an actual HP read. */
export function hpPublishedDependencyBindings(
  declarations: readonly HpProofDeclaration[],
  requests: readonly HpPublishedDependencyRequest[],
) {
  const bindings: HpPublishedDependencyBinding[] = [];
  const failures: Failure[] = [];
  const dependencies = declarations.filter((d) => d.identity.kind !== 'writer');
  const fail = (reason: HpPublishedDependencyReason, path: string) =>
    failures.push({ reason, path });
  const failCondition = (
    path: string,
    identity: string,
    expected: string | null,
    actual: string | null,
  ) => {
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity, value: expected }],
      [{ identity, value: actual }],
    );
    if (!firstDifference) throw new TypeError('hp_condition_difference_missing');
    failures.push({
      reason: 'conditionReadMismatch',
      path,
      canonicalIdentity: identity,
      firstDifference: { ...firstDifference, path },
    });
  };
  // Compilation binds new condition objects; declaration references must still belong to the
  // original shared master, not an equal foreign inventory supplied to both sides of the gate.
  if (requests[0]) {
    const canonical = new Map(
      hpProofCoverageInventory(requests[0].prepared.master).map((d) => [
        JSON.stringify(d.identity),
        d,
      ]),
    );
    declarations.forEach((d, index) => {
      const original = canonical.get(JSON.stringify(d.identity));
      if (
        !original ||
        d.effect !== original.effect ||
        d.operation !== original.operation ||
        d.value !== original.value
      )
        fail('foreignDeclaration', `declarations.${index}.owner`);
    });
  }
  requests.forEach(({ prepared, calculation }, requestIndex) => {
    if (!calculation) {
      fail('requestOwnerMismatch', `requests.${requestIndex}.calculation`);
      return;
    }
    const observation =
      'executionObservation' in prepared ? prepared.executionObservation : undefined;
    if (
      prepared.master !== requests[0]?.prepared.master ||
      calculation.executionObservation !== observation
    )
      fail('requestOwnerMismatch', `requests.${requestIndex}.owner`);
    const ordered = prepared.orderedScenario;
    const compiledNpCell = (operation: BattleOperation) =>
      compiledNpValueCell(dependencies, ordered, operation);
    const transport = battlePointPreparationRejectionObservationFor(prepared);
    if (prepared.scenario.mode === 'resolved' && prepared.status !== 'invalid' && !transport)
      fail('missingCapture', `requests.${requestIndex}.preparation`);
    if (transport && transport !== battlePointPreparationRejectionObservationFor(calculation))
      fail('requestOwnerMismatch', `requests.${requestIndex}.preparationOwner`);
    const target = observation?.targetExecution;
    const ref =
      prepared.status === 'executable'
        ? (prepared.resolved.noblePhantasmVariant?.ref ?? null)
        : null;
    const push = (
      declaration: HpProofDeclaration,
      binding: Omit<
        HpPublishedDependencyBinding,
        'family' | 'declaration' | 'requestIndex' | 'recipient' | 'candidateIndex'
      >,
      candidateIndex: number | null = null,
    ) =>
      bindings.push({
        family: 'publishedDependency',
        declaration,
        requestIndex,
        recipient: recipient(declaration),
        candidateIndex,
        ...binding,
      });
    const one = (matches: HpProofDeclaration[], path: string) => {
      if (matches.length !== 1) {
        fail(matches.length ? 'ambiguousCanonical' : 'unmatchedCanonical', path);
        return undefined;
      }
      return matches[0];
    };
    const conditionReadPlan: {
      operation: BattleOperation;
      sequence: number;
      declaration: HpProofDeclaration;
      leaf: HpConditionLeaf;
    }[] = [];
    const npDeclaration = (
      operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
      path: string,
    ) =>
      one(
        dependencies.filter(
          (d) =>
            d.identity.kind === 'hpRatioLow' &&
            d.identity.owner === operation.source.sourceId &&
            d.identity.variant !== null &&
            operation.source.sourceInstanceId ===
              `np:${noblePhantasmVariantKey(d.identity.variant.ref)}` &&
            d.value === operation.damage,
        ),
        path,
      );
    (ordered?.operations ?? []).forEach((operation, sequence) => {
      const conditionDeclarations = dependencies.filter(
        (d) =>
          d.identity.kind === 'condition' &&
          sourceMatches(d, operation.source, operation.source.origin === 'np' ? ref : null),
      );
      const sourceEffect = conditionDeclarations[0]?.effect;
      if (conditionDeclarations.some((d) => d.effect !== sourceEffect))
        fail('ambiguousCanonical', `requests.${requestIndex}.operations.${sequence}.conditions`);
      let compiledCondition: ConditionExpression = operation.condition;
      if (conditionDeclarations.length && operation.source.origin === 'np') {
        const wrapper = operation.condition;
        if (
          wrapper.kind !== 'all' ||
          wrapper.expressions.length !== 2 ||
          wrapper.expressions[1]?.kind !== 'noblePhantasmVariant' ||
          !ref ||
          noblePhantasmVariantKey(wrapper.expressions[1].variant) !== noblePhantasmVariantKey(ref)
        )
          failCondition(
            `requests.${requestIndex}.operations.${sequence}.wrapper`,
            JSON.stringify([requestIndex, operation.source]),
            JSON.stringify(['all', 2, ref ? noblePhantasmVariantKey(ref) : null]),
            JSON.stringify([
              wrapper.kind,
              wrapper.kind === 'all' ? wrapper.expressions.length : null,
              wrapper.kind === 'all' && wrapper.expressions[1]?.kind === 'noblePhantasmVariant'
                ? noblePhantasmVariantKey(wrapper.expressions[1].variant)
                : null,
            ]),
          );
        else compiledCondition = wrapper.expressions[0]!;
      }
      const originalCondition = sourceEffect?.requirement.expression;
      const pairs = originalCondition
        ? pairedHpRequirementLeaves(originalCondition, compiledCondition, 'requirement.expression')
        : hpLeaves(compiledCondition).length
          ? null
          : [];
      if (pairs === null)
        failCondition(
          `requests.${requestIndex}.operations.${sequence}.structure`,
          JSON.stringify([requestIndex, operation.source]),
          originalCondition ? JSON.stringify(originalCondition) : null,
          JSON.stringify(compiledCondition),
        );
      (pairs ?? []).forEach(({ path, original, compiled: leaf }, position) => {
        const d = one(
          conditionDeclarations.filter(
            (declaration) => declaration.identity.path === path && declaration.value === original,
          ),
          `requests.${requestIndex}.operations.${sequence}.conditions.${position}`,
        );
        if (d) {
          conditionReadPlan.push({ operation, sequence, declaration: d, leaf });
          push(d, {
            stage: 'canonicalCondition',
            position,
            operation,
            sequence,
            group: null,
            sourceInstanceId: operation.source.sourceInstanceId,
            actor: null,
            actionId: null,
            actionIndex: null,
            reference: leaf,
            detail: { leaf },
          });
        }
      });
      if (operation.kind === 'executeNpDamage' && operation.damage.kind === 'hpRatioLow') {
        const d = npDeclaration(operation, `requests.${requestIndex}.operations.${sequence}.np`);
        if (d)
          push(d, {
            stage: 'canonicalNp',
            position: 0,
            operation,
            sequence,
            group: null,
            sourceInstanceId: operation.source.sourceInstanceId,
            actor: 'attacker',
            actionId: null,
            actionIndex: null,
            reference: operation.damage,
            detail: { damage: operation.damage },
          });
      }
      if (
        operation.kind === 'addModifier' &&
        (operation.valueExpression?.kind === 'inverseHpLinear' ||
          operation.valueExpression?.kind === 'hpRangeLinear')
      ) {
        // There is no original compiled-cell index/ref. Record effect context for each declared cell,
        // never infer the selected cell from an equal resolved expression/value.
        const matches = dependencies.filter(
          (d) =>
            d.identity.kind === 'valueExpression' &&
            sourceMatches(d, operation.source, operation.source.origin === 'np' ? ref : null),
        );
        const contextMatches = matches.length
          ? matches
          : [compiledNpCell(operation)].filter((d) => d !== null);
        if (!contextMatches.length)
          fail('unmatchedCanonical', `requests.${requestIndex}.operations.${sequence}.expression`);
        contextMatches.forEach((d, position) =>
          push(d, {
            stage: 'expressionContext',
            position,
            operation,
            sequence,
            group: null,
            sourceInstanceId: operation.source.sourceInstanceId,
            actor: null,
            actionId: null,
            actionIndex: null,
            reference: operation.valueExpression!,
            detail: {
              expression: operation.valueExpression,
              qualification: 'Effect context only; no selected-cell or actual-read proof.',
            },
          }),
        );
      }
    });
    const candidates =
      target?.selection === 'ambiguous'
        ? target.candidates
        : target?.selection === 'selected'
          ? [target]
          : target
            ? [{ candidateIndex: null, candidateState: target.candidateState }]
            : [];
    candidates.forEach((captured) => {
      const candidate = hpCandidateObservationFor(captured.candidateState);
      const candidatePath = `requests.${requestIndex}.candidates.${captured.candidateIndex}`;
      const preflight = captured.candidateState?.preflight;
      const aborted = preflight?.status === 'aborted';
      if (aborted) {
        if (
          !preflight.issues.some((issue) => issue.kind === 'invalidActivationContext') ||
          candidate ||
          captured.candidateState?.executionGroups.length !== 0 ||
          ('operationEvents' in captured && captured.operationEvents.length !== 0)
        )
          fail('candidatePreflightMismatch', candidatePath);
      } else if (preflight?.status !== 'ready' && target?.selection !== 'unresolved')
        fail('candidatePreflightMismatch', candidatePath);
      if (!candidate && !aborted && target?.selection !== 'unresolved')
        fail('missingCapture', candidatePath);
      if (candidate && candidate.seed.hp !== ordered?.hp)
        fail('requestOwnerMismatch', `${candidatePath}.seed`);
      if (target?.selection === 'selected' && preflight?.status === 'ready' && candidate) {
        const actualReads = candidate.reads;
        for (
          let position = 0;
          position < Math.max(conditionReadPlan.length, actualReads.length);
          position++
        ) {
          const planned = conditionReadPlan[position];
          const read = actualReads[position];
          if (
            planned &&
            read &&
            planned.sequence === read.operationSequence &&
            planned.operation.operationId === read.operationId &&
            planned.leaf === read.leaf &&
            read.comparison === planned.leaf.comparison &&
            read.expectedValue === planned.leaf.value
          )
            continue;
          const actualOwner =
            read &&
            conditionReadPlan.find(
              (entry) => entry.sequence === read.operationSequence && entry.leaf === read.leaf,
            );
          const identity = planned
            ? JSON.stringify([
                requestIndex,
                planned.operation.operationId,
                planned.declaration.identity,
              ])
            : JSON.stringify([requestIndex, read?.operationId, position]);
          const path = `requests.${requestIndex}.reads.${position}`;
          const expected = planned
            ? JSON.stringify([
                planned.operation.operationId,
                planned.sequence,
                planned.declaration.identity.path,
                planned.leaf.comparison,
                planned.leaf.value,
              ])
            : null;
          const actual = read
            ? JSON.stringify([
                read.operationId,
                read.operationSequence,
                actualOwner?.declaration.identity.path ?? null,
                read.comparison,
                read.expectedValue,
              ])
            : null;
          failCondition(path, identity, expected, actual);
        }
      }
      candidate?.reads.forEach((read, position) => {
        const operation = ordered?.operations[read.operationSequence];
        const group = captured.candidateState?.executionGroups[read.operationGroupIndex];
        const event =
          'operationEvents' in captured
            ? captured.operationEvents[read.operationSequence]
            : undefined;
        if (
          !operation ||
          operation.operationId !== read.operationId ||
          !group?.operationIds.includes(read.operationId)
        ) {
          fail('unmatchedCanonical', `requests.${requestIndex}.reads.${position}`);
          return;
        }
        if (
          event?.operationId !== operation.operationId ||
          event.sequence !== read.operationSequence ||
          event.operationOutcome !==
            (group.outcome === 'rolledBack' ? 'unsupported' : event.operationOutcome)
        ) {
          fail('conditionReadMismatch', `requests.${requestIndex}.reads.${position}`);
          return;
        }
        const d = one(
          conditionReadPlan
            .filter(
              (entry) => entry.sequence === read.operationSequence && entry.leaf === read.leaf,
            )
            .map((entry) => entry.declaration),
          `requests.${requestIndex}.reads.${position}`,
        );
        if (d)
          push(
            d,
            {
              stage: 'actualConditionRead',
              position,
              operation,
              sequence: read.operationSequence,
              group: read.operationGroupIndex,
              sourceInstanceId: operation.source.sourceInstanceId,
              actor: read.actor,
              actionId: null,
              actionIndex: null,
              reference: read,
              detail: {
                permille: read.permille,
                comparison: read.comparison,
                expectedValue: read.expectedValue,
                evaluated: read.evaluated,
                conditionOutcome: read.conditionOutcome,
                hp: read.state.hp,
                transaction: group.outcome,
                operationOutcome: event.operationOutcome,
                projectionOutcome: event.projectionOutcome,
                modifierConsumed:
                  operation.kind === 'addModifier' &&
                  read.evaluated === true &&
                  group.outcome === 'committed' &&
                  group.appliedOperationIds.includes(operation.operationId) &&
                  event.operationOutcome === 'applied' &&
                  event.projectionOutcome === 'applied',
              },
            },
            captured.candidateIndex,
          );
      });
      candidate?.nps.forEach((np, position) => {
        const operation = ordered?.operations[np.operationSequence];
        if (
          !operation ||
          operation.operationId !== np.operationId ||
          !captured.candidateState?.executionGroups[np.operationGroupIndex]?.operationIds.includes(
            np.operationId,
          ) ||
          operation.kind !== 'executeNpDamage' ||
          operation.damage.kind !== 'hpRatioLow'
        ) {
          fail('unmatchedCanonical', `requests.${requestIndex}.nps.${position}`);
          return;
        }
        const d = npDeclaration(operation, `requests.${requestIndex}.nps.${position}`);
        if (d)
          push(
            d,
            {
              stage: 'npEvaluation',
              position,
              operation,
              sequence: np.operationSequence,
              group: np.operationGroupIndex,
              sourceInstanceId: operation.source.sourceInstanceId,
              actor: 'attacker',
              actionId: null,
              actionIndex: null,
              reference: np,
              detail: {
                ratio: np.ratio,
                disposition: np.disposition,
                context: np.context,
                evaluation: np.evaluation,
                input: np.input,
                hp: np.state.hp,
              },
            },
            captured.candidateIndex,
          );
      });
    });
    transport?.transitions.forEach((transition, actionIndex) =>
      transition.attempts?.forEach((attempt) =>
        attempt.sources.forEach((source, position) => {
          const matches = dependencies.filter((d) => {
            if (
              d.effect !== source.effect ||
              !sourceMatches(
                d,
                {
                  origin: source.origin,
                  sourceId: source.sourceId,
                  sourceInstanceId: source.sourceInstanceId,
                  skillId: source.skillId,
                  effectId: source.effect.id,
                  effectOccurrenceId: source.effect.occurrenceId,
                },
                source.noblePhantasmVariant,
              )
            )
              return false;
            if (d.identity.kind === 'condition') return true;
            const operationIndex = d.operation ? source.effect.execution.indexOf(d.operation) : -1;
            const field =
              d.identity.kind === 'valueExpression'
                ? source.limitBreak
                  ? 'limitBreakValueExpressions'
                  : 'valueExpressions'
                : d.identity.kind === 'ocRateExpression'
                  ? source.limitBreak
                    ? 'limitBreakCells'
                    : 'cells'
                  : null;
            return (
              field !== null &&
              d.identity.path ===
                `execution.${operationIndex}.${field}.${source.valueSetIndex}.${source.valueIndex}${d.identity.kind === 'ocRateExpression' ? '.amount' : ''}`
            );
          });
          matches.forEach((d) => {
            const operationIndex = d.operation
              ? source.effect.execution.indexOf(d.operation)
              : null;
            const origins = attempt.stepOrigins.filter(
              (origin) =>
                origin.source === source &&
                (operationIndex === null || origin.operationIndex === operationIndex),
            );
            push(d, {
              stage: 'selectedPreparationCell',
              position,
              operation: null,
              sequence: null,
              group: null,
              sourceInstanceId: source.sourceInstanceId,
              actor: source.origin === 'attacker' ? 'attacker' : source.sourceInstanceId,
              actionId: attempt.actionId,
              actionIndex,
              reference: source,
              detail: {
                source: {
                  origin: source.origin,
                  sourceId: source.sourceId,
                  skillId: source.skillId,
                  valueSetIndex: source.valueSetIndex,
                  valueIndex: source.valueIndex,
                  limitBreak: source.limitBreak,
                  variant: source.noblePhantasmVariant,
                },
                operationIndex,
                steps: origins.map((origin) => ({
                  index: origin.index,
                  operationIndex: origin.operationIndex,
                  reached: attempt.reached.filter((step) => step.index === origin.index),
                })),
                native: attempt.native,
                transitionStatus: transition.result.status,
                ...(d.identity.kind === 'ocRateExpression'
                  ? {
                      terminalAction: transition.command.kind === 'executeAttackNoblePhantasm',
                      laterReachedKinds: attempt.reached
                        .filter((step) => origins.some((origin) => step.index > origin.index))
                        .map((step) => ({ index: step.index, kind: step.step.kind })),
                    }
                  : {}),
                appendedActions: transition.result.state.appliedActions.slice(
                  transition.before.appliedActions.length,
                ),
                qualification:
                  'Original selected source/native action and reached-step context only; not a new native operation or successful-recovery proof.',
              },
            });
          });
        }),
      ),
    );
    if (ordered) {
      const compiledSources = compiledSourcesFor(ordered);
      if (
        !compiledSources &&
        ordered.operations.some((operation) => operation.source.origin === 'np')
      )
        fail('missingCapture', `requests.${requestIndex}.compiledSources`);
      compiledSources
        ?.filter(
          (source) =>
            source.phase === 'beforeNpDamage' &&
            source.noblePhantasmVariant !== null &&
            ref !== null &&
            noblePhantasmVariantKey(source.noblePhantasmVariant) === noblePhantasmVariantKey(ref),
        )
        .forEach((source, position) => {
          const operationSource = {
            origin: source.origin,
            sourceId: source.sourceId,
            sourceInstanceId: source.sourceInstanceId,
            skillId: source.skillId,
            effectId: source.effect.id,
            effectOccurrenceId: source.effect.occurrenceId,
          };
          dependencies
            .filter((declaration) => {
              if (
                declaration.identity.kind !== 'valueExpression' ||
                declaration.effect !== source.effect ||
                !sourceMatches(declaration, operationSource, source.noblePhantasmVariant)
              )
                return false;
              const operationIndex = declaration.operation
                ? source.effect.execution.indexOf(declaration.operation)
                : -1;
              return (
                declaration.identity.path ===
                `execution.${operationIndex}.valueExpressions.${source.valueSetIndex}.${source.valueIndex}`
              );
            })
            .forEach((declaration) =>
              push(declaration, {
                stage: 'selectedPreparationCell',
                position,
                operation: null,
                sequence: null,
                group: null,
                sourceInstanceId: source.sourceInstanceId,
                actor: 'attacker',
                actionId: null,
                actionIndex: null,
                reference: source,
                detail: {
                  source: {
                    origin: source.origin,
                    sourceId: source.sourceId,
                    skillId: source.skillId,
                    valueSetIndex: source.valueSetIndex,
                    valueIndex: source.valueIndex,
                    variant: source.noblePhantasmVariant,
                  },
                  phase: source.phase,
                  qualification:
                    'Compiled NP beforeDamage source cell; candidate read and consumption are separate.',
                },
              }),
            );
        });
    }
    candidates.forEach((captured) => {
      const candidate = hpCandidateObservationFor(captured.candidateState);
      candidate?.valueReads.forEach((read, position) => {
        const compiledCell = compiledNpCell(read.operation);
        if (
          !dependencies.some(
            (declaration) =>
              declaration.identity.kind === 'valueExpression' &&
              sourceMatches(
                declaration,
                read.operation.source,
                read.operation.source.origin === 'np' ? ref : null,
              ),
          ) &&
          !compiledCell
        )
          return;
        const operation = ordered?.operations[read.operationSequence];
        const group = captured.candidateState?.executionGroups[read.operationGroupIndex];
        const event =
          'operationEvents' in captured
            ? captured.operationEvents[read.operationSequence]
            : undefined;
        const selected = bindings.filter(
          (binding) =>
            binding.requestIndex === requestIndex &&
            binding.stage === 'selectedPreparationCell' &&
            binding.sourceInstanceId === read.operation.source.sourceInstanceId &&
            binding.declaration.identity.kind === 'valueExpression' &&
            sourceMatches(
              binding.declaration,
              read.operation.source,
              read.operation.source.origin === 'np' ? ref : null,
            ),
        );
        if (
          !operation ||
          operation !== read.operation ||
          read.result.operation !== operation ||
          event?.operationId !== operation.operationId ||
          event.operationOutcome !==
            (group?.outcome === 'rolledBack' ? 'unsupported' : read.result.outcome) ||
          !group?.operationIds.includes(operation.operationId) ||
          (selected.length !== 1 &&
            !(
              selected.length === 0 &&
              compiledCell &&
              read.result.outcome === 'notApplied' &&
              !read.modifierAppended
            ))
        ) {
          fail('valueReadMismatch', `requests.${requestIndex}.valueReads.${position}`);
          return;
        }
        const declaration = selected[0]?.declaration ?? compiledCell!;
        const committed = group.outcome === 'committed';
        const consumed =
          committed &&
          read.result.outcome === 'applied' &&
          read.contributionIncluded &&
          read.modifierAppended &&
          group.appliedOperationIds.includes(operation.operationId);
        push(
          declaration,
          {
            stage: 'actualValueRead',
            position,
            operation,
            sequence: read.operationSequence,
            group: read.operationGroupIndex,
            sourceInstanceId: operation.source.sourceInstanceId,
            actor: 'attacker',
            actionId: null,
            actionIndex: null,
            reference: read,
            detail: {
              selectedCellPath: declaration.identity.path,
              permille: read.permille,
              resolvedValue: read.value,
              operationOutcome: read.result.outcome,
              contributionIncluded: read.contributionIncluded,
              modifierAppended: read.modifierAppended,
              transaction: group.outcome,
              consumed,
            },
          },
          captured.candidateIndex,
        );
      });
    });
  });
  requests.forEach(({ prepared }, requestIndex) => {
    if (prepared.status !== 'executable') return;
    const selectedRef = prepared.resolved.noblePhantasmVariant?.ref ?? null;
    const target = prepared.executionObservation?.targetExecution;
    if (target?.selection !== 'selected' || target.candidateState?.preflight?.status !== 'ready')
      return;
    const candidateState = target.candidateState;
    const candidate = hpCandidateObservationFor(candidateState);
    if (!candidate) return; // The ready-candidate capture gate above reports this separately.
    const selected = bindings.filter(
      (binding) =>
        binding.requestIndex === requestIndex &&
        binding.stage === 'selectedPreparationCell' &&
        binding.declaration.identity.kind === 'valueExpression',
    );
    const compiledNpCell = (operation: BattleOperation) =>
      compiledNpValueCell(dependencies, prepared.orderedScenario, operation);
    const expected: {
      operation: BattleOperation;
      sequence: number;
      group: number;
      declaration: HpProofDeclaration;
    }[] = [];
    prepared.orderedScenario?.operations.forEach((operation, sequence) => {
      if (
        operation.kind !== 'addModifier' ||
        (operation.valueExpression?.kind !== 'inverseHpLinear' &&
          operation.valueExpression?.kind !== 'hpRangeLinear')
      )
        return;
      const event = target.operationEvents[sequence];
      if (!event) return; // A selected operation without an event has its own typed gate.
      const matches = selected.filter(
        (binding) =>
          binding.sourceInstanceId === operation.source.sourceInstanceId &&
          sourceMatches(
            binding.declaration,
            operation.source,
            operation.source.origin === 'np' ? selectedRef : null,
          ),
      );
      if (matches.length === 0) {
        const compiledCell = compiledNpCell(operation);
        if (!compiledCell || event.operationOutcome !== 'notApplied') return;
        const group = candidateState.executionGroups.findIndex((item) =>
          item.operationIds.includes(operation.operationId),
        );
        if (group < 0) {
          fail(
            'candidateEventMismatch',
            `requests.${requestIndex}.operations.${sequence}.valueRead`,
          );
          return;
        }
        expected.push({ operation, sequence, group, declaration: compiledCell });
        return;
      }
      if (matches.length !== 1) {
        fail('ambiguousCanonical', `requests.${requestIndex}.operations.${sequence}.valueCell`);
        return;
      }
      const group = candidateState.executionGroups.findIndex((item) =>
        item.operationIds.includes(operation.operationId),
      );
      if (group < 0 || event.operationId !== operation.operationId || event.sequence !== sequence) {
        fail('candidateEventMismatch', `requests.${requestIndex}.operations.${sequence}.valueRead`);
        return;
      }
      expected.push({ operation, sequence, group, declaration: matches[0]!.declaration });
    });
    for (
      let position = 0;
      position < Math.max(expected.length, candidate.valueReads.length);
      position++
    ) {
      const planned = expected[position];
      const read = candidate.valueReads[position];
      if (
        planned &&
        read &&
        read.operation === planned.operation &&
        read.operationSequence === planned.sequence &&
        read.operationGroupIndex === planned.group
      )
        continue;
      const identity = JSON.stringify([
        requestIndex,
        target.candidateIndex,
        planned?.operation.operationId ?? read?.operation.operationId ?? null,
        planned?.declaration.identity ?? null,
      ]);
      const path = `requests.${requestIndex}.valueReads.${position}`;
      const firstDifference = firstCanonicalAuditDifference(
        [
          {
            identity,
            value: planned
              ? JSON.stringify([
                  planned.sequence,
                  planned.operation.operationId,
                  planned.group,
                  planned.declaration.identity.path,
                ])
              : null,
          },
        ],
        [
          {
            identity,
            value: read
              ? JSON.stringify([
                  read.operationSequence,
                  read.operation.operationId,
                  read.operationGroupIndex,
                  selected.find(
                    (binding) =>
                      binding.sourceInstanceId === read.operation.source.sourceInstanceId,
                  )?.declaration.identity.path ?? null,
                ])
              : null,
          },
        ],
      );
      if (!firstDifference) throw new TypeError('hp_value_read_difference_missing');
      failures.push({
        reason: 'valueReadMismatch',
        path,
        canonicalIdentity: identity,
        firstDifference: { ...firstDifference, path },
      });
    }
  });
  return { bindings, failures };
}

const bindingKey = (b: HpPublishedDependencyBinding) =>
  JSON.stringify([
    b.declaration.identity,
    b.requestIndex,
    b.stage,
    b.sequence,
    b.actionIndex,
    b.actionId,
    b.candidateIndex,
    b.position,
  ]);
const isPublishedDependencyFamily = (family: unknown) => family === 'publishedDependency';

/** Fail closed on correspondence errors; absent declaration stages remain explicitly unobserved. */
export function reconcileHpPublishedDependencyCoverage(
  declarations: readonly HpProofDeclaration[],
  requests: readonly HpPublishedDependencyRequest[],
  observed: readonly HpPublishedDependencyBinding[],
) {
  const expected = hpPublishedDependencyBindings(declarations, requests);
  const failures: Failure[] = [...expected.failures];
  const fail = (reason: HpPublishedDependencyReason, path: string) =>
    failures.push({ reason, path });
  const declared = new Set<string>();
  declarations.forEach((d, index) => {
    const key = JSON.stringify(d.identity);
    if (declared.has(key)) fail('duplicateDeclaration', `declarations.${index}`);
    declared.add(key);
  });
  const expectedByKey = new Map(
    expected.bindings.map((b, index) => [bindingKey(b), { binding: b, index }]),
  );
  if (expectedByKey.size !== expected.bindings.length) fail('duplicateBinding', 'expected');
  const seen = new Set<string>();
  observed.forEach((b, index) => {
    const key = bindingKey(b),
      original = expectedByKey.get(key);
    if (seen.has(key)) fail('duplicateBinding', `observed.${index}`);
    seen.add(key);
    if (!declarations.includes(b.declaration)) fail('foreignDeclaration', `observed.${index}`);
    if (!original) {
      fail('unmatchedBinding', `observed.${index}`);
      return;
    }
    if (original.index !== index) fail('orderMismatch', `observed.${index}`);
    if (b.reference !== original.binding.reference || b.operation !== original.binding.operation)
      fail('foreignReference', `observed.${index}`);
    if (
      b.declaration !== original.binding.declaration ||
      !isPublishedDependencyFamily(b.family) ||
      b.sourceInstanceId !== original.binding.sourceInstanceId ||
      b.actor !== original.binding.actor ||
      b.recipient !== original.binding.recipient ||
      b.group !== original.binding.group ||
      !isDeepStrictEqual(b.detail, original.binding.detail)
    )
      fail('bindingMismatch', `observed.${index}`);
  });
  for (const [key, { index }] of expectedByKey)
    if (!seen.has(key)) fail('missingBinding', `expected.${index}`);
  const stages: Stage[] = [
    'canonicalCondition',
    'canonicalNp',
    'expressionContext',
    'selectedPreparationCell',
    'actualConditionRead',
    'actualValueRead',
    'npEvaluation',
  ];
  const bindingsByRequest = requests.map(() => [] as HpPublishedDependencyBinding[]);
  observed.forEach((binding) => bindingsByRequest[binding.requestIndex]?.push(binding));
  const consumerPlans = requests.map(({ prepared }, requestIndex) => {
    if (prepared.status !== 'executable' || !prepared.orderedScenario)
      return { requestIndex, disposition: 'noOrderedPlan' as const, consumers: [] };
    const requestBindings = bindingsByRequest[requestIndex]!;
    const planned = requestBindings.filter(
      (binding) =>
        binding.stage === 'canonicalCondition' ||
        binding.stage === 'expressionContext' ||
        binding.stage === 'canonicalNp',
    );
    if (!planned.length)
      return { requestIndex, disposition: 'noDownstreamConsumer' as const, consumers: [] };
    const target = prepared.executionObservation?.targetExecution;
    const consumers = planned.map((binding) => {
      const selectedCell =
        binding.stage !== 'expressionContext' ||
        requestBindings.some(
          (candidate) =>
            candidate.stage === 'selectedPreparationCell' &&
            candidate.declaration === binding.declaration &&
            candidate.sourceInstanceId === binding.sourceInstanceId,
        );
      const reads = requestBindings.filter(
        (candidate) =>
          candidate.declaration === binding.declaration &&
          candidate.operation === binding.operation &&
          (candidate.stage === 'actualConditionRead' ||
            candidate.stage === 'actualValueRead' ||
            candidate.stage === 'npEvaluation'),
      );
      const event =
        target?.selection === 'selected' && binding.sequence !== null
          ? target.operationEvents[binding.sequence]
          : undefined;
      const operation =
        binding.sequence === null
          ? undefined
          : prepared.orderedScenario?.operations[binding.sequence];
      const groups =
        target?.selection === 'selected'
          ? (target.candidateState?.executionGroups.filter((group) =>
              group.operationIds.includes(binding.operation?.operationId ?? ''),
            ) ?? [])
          : [];
      if (
        event &&
        (event.sequence !== binding.sequence ||
          event.operationId !== binding.operation?.operationId ||
          operation?.operationId !== event.operationId ||
          operation.source.sourceInstanceId !== binding.sourceInstanceId ||
          groups.length !== 1)
      )
        fail('candidateEventMismatch', `requests.${requestIndex}.consumer.${binding.sequence}`);
      if (
        !event &&
        selectedCell &&
        target?.selection === 'selected' &&
        target.candidateState?.preflight?.status === 'ready'
      )
        fail('candidateEventMismatch', `requests.${requestIndex}.consumer.${binding.sequence}`);
      return {
        declaration: binding.declaration.identity,
        operationId: binding.operation?.operationId ?? null,
        sequence: binding.sequence,
        stage: binding.stage,
        disposition: !selectedCell
          ? ('cellNotSelected' as const)
          : reads.length
            ? ('physicalRead' as const)
            : target?.selection !== 'selected'
              ? ('consumerSelectionUnresolved' as const)
              : event
                ? ('consumerReachedWithoutRead' as const)
                : ('consumerNotReached' as const),
        readCount: reads.length,
      };
    });
    return { requestIndex, disposition: 'orderedConsumerPlan' as const, consumers };
  });
  const selectedUnreached = observed.flatMap((binding, bindingIndex) => {
    if (binding.stage !== 'selectedPreparationCell') return [];
    const detail = binding.detail as { steps?: readonly { reached: readonly unknown[] }[] };
    return detail.steps?.length && detail.steps.every((step) => step.reached.length === 0)
      ? [
          {
            bindingIndex,
            requestIndex: binding.requestIndex,
            declaration: binding.declaration.identity,
          },
        ]
      : [];
  });
  const directOwners = directScenarioOwnerIndex(requests);
  const supportOwnerRequests = (d: HpProofDeclaration) =>
    d.identity.origin === 'attacker'
      ? (directOwners.supportOwners.get(JSON.stringify([d.identity.owner, d.identity.skill])) ?? [])
      : [];
  const ownerRequests = (d: HpProofDeclaration) => [
    ...(directOwners.owners.get(JSON.stringify([d.identity.origin, d.identity.owner])) ?? []),
    ...supportOwnerRequests(d),
  ];
  const npBindings = new Map<string, { canonical: number[]; evaluations: number[] }>();
  observed.forEach((binding, index) => {
    if (binding.declaration.identity.kind !== 'hpRatioLow') return;
    const key = JSON.stringify([binding.declaration.identity, binding.requestIndex]);
    const entry = npBindings.get(key) ?? { canonical: [], evaluations: [] };
    if (binding.stage === 'canonicalNp') entry.canonical.push(index);
    if (binding.stage === 'npEvaluation') entry.evaluations.push(index);
    npBindings.set(key, entry);
  });
  const npSelection = (declaration: HpProofDeclaration, requestIndex: number) => {
    const { prepared } = requests[requestIndex]!;
    if (prepared.status !== 'executable')
      return { requestIndex, disposition: 'unobserved' as const, reason: 'notExecutable' as const };
    const selected = prepared.resolved.noblePhantasmVariant;
    if (!selected)
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'noSelectedVariant' as const,
      };
    if (prepared.executionObservation?.targetExecution?.selection !== 'selected')
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'targetNotSelected' as const,
      };
    const owner = prepared.master.servants.find((actor) => actor.id === declaration.identity.owner);
    if (!owner || !getNoblePhantasmVariants(owner).includes(selected)) {
      fail('npVariantSelectionMismatch', `requests.${requestIndex}.selectedVariant`);
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'foreignSelectedVariant' as const,
      };
    }
    const selectedDeclarations = declarations.filter(
      (candidate) =>
        candidate.identity.kind === 'hpRatioLow' &&
        candidate.identity.owner === declaration.identity.owner &&
        candidate.identity.variant?.canonicalId === selected.canonicalId &&
        variantMatches(candidate, selected.ref),
    );
    if (selectedDeclarations.length !== 1) {
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason:
          selectedDeclarations.length === 0
            ? ('selectedVariantHasNoHpDeclaration' as const)
            : ('ambiguousSelectedNpDeclaration' as const),
      };
    }
    const selectedDeclaration = selectedDeclarations[0]!;
    if (selectedDeclaration !== declaration) {
      const ownKey = JSON.stringify([declaration.identity, requestIndex]);
      if (npBindings.get(ownKey)?.evaluations.length) {
        fail('npVariantSelectionMismatch', `requests.${requestIndex}.npEvaluation`);
        return {
          requestIndex,
          disposition: 'unobserved' as const,
          reason: 'conflictingEvaluation' as const,
        };
      }
    }
    const selectedKey = JSON.stringify([selectedDeclaration.identity, requestIndex]);
    const proof = npBindings.get(selectedKey);
    if (
      proof?.canonical.length !== 1 ||
      proof.evaluations.length !== 1 ||
      observed[proof.canonical[0]!]!.operation !== observed[proof.evaluations[0]!]!.operation
    )
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'selectedNpProofMissing' as const,
      };
    return {
      requestIndex,
      disposition:
        selectedDeclaration === declaration
          ? ('selected' as const)
          : ('otherVariantSelected' as const),
      selectedVariant: selectedDeclaration.identity.variant,
      canonicalBinding: proof.canonical[0]!,
      evaluationBinding: proof.evaluations[0]!,
    };
  };
  const ocRateSelection = (declaration: HpProofDeclaration, requestIndex: number) => {
    const { prepared } = requests[requestIndex]!;
    if (prepared.status !== 'executable')
      return { requestIndex, disposition: 'unobserved' as const, reason: 'notExecutable' as const };
    if (!prepared.resolved.noblePhantasmVariant)
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'noSelectedVariant' as const,
      };
    if (prepared.executionObservation?.targetExecution?.selection !== 'selected')
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'targetNotSelected' as const,
      };
    const selectedVariant = prepared.resolved.noblePhantasmVariant;
    const owner = prepared.master.servants.find((actor) => actor.id === declaration.identity.owner);
    if (!owner || !getNoblePhantasmVariants(owner).includes(selectedVariant)) {
      fail('npVariantSelectionMismatch', `requests.${requestIndex}.ocRateVariant`);
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: 'foreignSelectedVariant' as const,
      };
    }
    if (!variantMatches(declaration, selectedVariant.ref))
      return { requestIndex, disposition: 'otherVariantSelected' as const };
    const selected = observed.flatMap((binding, index) =>
      binding.stage === 'selectedPreparationCell' &&
      binding.requestIndex === requestIndex &&
      binding.declaration.identity.kind === 'ocRateExpression' &&
      binding.declaration.operation === declaration.operation &&
      binding.declaration.effect === declaration.effect
        ? [{ binding, index }]
        : [],
    );
    if (selected.length !== 1) {
      if (selected.length > 1) fail('ambiguousCanonical', `requests.${requestIndex}.ocRateCell`);
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: selected.length
          ? ('ambiguousSelectedCell' as const)
          : ('selectedCellMissing' as const),
      };
    }
    const { binding, index } = selected[0]!;
    if (binding.declaration !== declaration)
      return { requestIndex, disposition: 'otherCellSelected' as const, selectedBinding: index };
    const detail = binding.detail as {
      native?: { status: string; outcomes: readonly { step: number; outcome: string }[] };
      transitionStatus: string;
      terminalAction: boolean;
      laterReachedKinds: readonly { index: number; kind: string }[];
      steps: readonly { index: number; reached: readonly unknown[] }[];
      appendedActions: readonly { sourceKind: string }[];
    };
    const selectedStep = detail.steps[0]?.index;
    const committed =
      detail.native?.status === 'committed' &&
      detail.native.outcomes.some(
        (outcome) => outcome.step === selectedStep && outcome.outcome === 'applied',
      ) &&
      detail.transitionStatus === 'applied' &&
      detail.appendedActions.some((action) => action.sourceKind === 'attackNoblePhantasm');
    return {
      requestIndex,
      disposition: committed ? ('selectedCommitted' as const) : ('selectedUnobserved' as const),
      selectedBinding: index,
      reached: detail.steps.some((step) => step.reached.length > 0),
      nativeStatus: detail.native?.status ?? null,
      appended: detail.appendedActions.length,
      actualRead:
        committed &&
        detail.terminalAction &&
        !detail.laterReachedKinds.some((step) => step.kind === 'grant')
          ? ('noLaterGrantInTerminalAction' as const)
          : ('unobserved' as const),
    };
  };
  const supportValueSelection = (declaration: HpProofDeclaration, requestIndex: number) => {
    const selected = observed.flatMap((binding, index) =>
      binding.requestIndex === requestIndex &&
      binding.stage === 'selectedPreparationCell' &&
      binding.declaration.effect === declaration.effect &&
      binding.declaration.operation === declaration.operation
        ? [{ binding, index }]
        : [],
    );
    if (selected.length !== 1) {
      if (selected.length > 1)
        fail('ambiguousCanonical', `requests.${requestIndex}.supportValueCell`);
      return {
        requestIndex,
        disposition: 'unobserved' as const,
        reason: selected.length
          ? ('ambiguousSelectedCell' as const)
          : ('selectedCellMissing' as const),
      };
    }
    const { binding, index } = selected[0]!;
    if (binding.declaration !== declaration)
      return { requestIndex, disposition: 'otherCellSelected' as const, selectedBinding: index };
    const detail = binding.detail as {
      steps: readonly { reached: readonly unknown[] }[];
      native: { status: string; outcomes: readonly { outcome: string }[] };
      appendedActions: readonly unknown[];
    };
    const reached = detail.steps.some((step) => step.reached.length > 0);
    const noNativeStep =
      detail.steps.length === 0 &&
      detail.native.status === 'committed' &&
      detail.native.outcomes.length > 0 &&
      detail.native.outcomes.every((outcome) => outcome.outcome === 'notApplicable');
    const reads = observed.flatMap((candidate, readIndex) =>
      candidate.requestIndex === requestIndex &&
      candidate.stage === 'actualValueRead' &&
      candidate.declaration === declaration
        ? [{ candidate, readIndex }]
        : [],
    );
    if (reads.length > 1) fail('valueReadMismatch', `requests.${requestIndex}.supportValueRead`);
    const read = reads.length === 1 ? reads[0]! : null;
    return {
      requestIndex,
      disposition: noNativeStep
        ? ('selectedCellNoNativeStep' as const)
        : reached
          ? ('selectedCellReached' as const)
          : ('selectedCellUnobserved' as const),
      selectedBinding: index,
      reached,
      nativeStatus: detail.native.status,
      appendedActions: detail.appendedActions.length,
      actualRead: read
        ? {
            status: 'attempted' as const,
            binding: read.readIndex,
            ...(read.candidate.detail as {
              permille: number | null;
              resolvedValue: number | null;
              operationOutcome: string;
              contributionIncluded: boolean;
              modifierAppended: boolean;
              transaction: 'committed' | 'rolledBack';
              consumed: boolean;
            }),
          }
        : ('unobserved' as const),
      recovery: 'unobserved' as const,
    };
  };
  return {
    requestCount: requests.length,
    requests: requests.map(({ prepared, calculation, requestPhase }, index) => ({
      index,
      ...(requestPhase ? { requestPhase } : {}),
      scenario: prepared.scenario,
      preparedStatus: prepared.status,
      resultStatus: calculation?.result.status,
      targetSelection:
        prepared.status === 'executable'
          ? prepared.executionObservation?.targetExecution?.selection
          : undefined,
    })),
    declarations: declarations
      .filter((d) => d.identity.kind !== 'writer')
      .map((d) => ({
        identity: d.identity,
        value: d.value,
        operation: d.operation,
        directScenarioOwnerRequests: ownerRequests(d),
        npVariantSelections:
          d.identity.kind === 'hpRatioLow'
            ? ownerRequests(d).map((requestIndex) => npSelection(d, requestIndex))
            : [],
        ocRateSelections:
          d.identity.kind === 'ocRateExpression'
            ? ownerRequests(d).map((requestIndex) => ocRateSelection(d, requestIndex))
            : [],
        ...(requests.some((request) => request.ownerScope === 'supportProjection') &&
        d.identity.kind === 'valueExpression'
          ? {
              supportValueSelections: supportOwnerRequests(d).map((requestIndex) =>
                supportValueSelection(d, requestIndex),
              ),
            }
          : {}),
        stages: stages.map((stage) => {
          const indices = observed.flatMap((b, index) =>
            b.declaration === d && b.stage === stage ? [index] : [],
          );
          return {
            stage,
            bindings: indices,
            observation: indices.length ? ('connected' as const) : ('unobserved' as const),
          };
        }),
      })),
    bindings: observed.map(({ declaration, operation, reference: _reference, ...b }) => ({
      ...b,
      declaration: declaration.identity,
      operation: operation && {
        operationId: operation.operationId,
        kind: operation.kind,
        source: operation.source,
        phase: operation.phase,
      },
    })),
    consumerPlans,
    selectedUnreached,
    qualification:
      'Correspondence within the original control producer requests only. Direct scenario owner is not variant or cell selection. Declaration, selected cell, reached step, native action, append, actual read and NP evaluation are distinct; absent stages are not zero, unsupported or product exclusion.',
    productClosure: false as const,
    gate: { passed: failures.length === 0, failures, firstDifference: failures[0] ?? null },
  };
}
