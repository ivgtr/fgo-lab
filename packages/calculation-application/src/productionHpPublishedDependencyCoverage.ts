import { isDeepStrictEqual } from 'node:util';
import type { BattleOperation, ConditionExpression, SourceEffect } from '@fgo-lab/battle-execution';
import { hpCandidateObservationFor } from '@fgo-lab/battle-execution/preparation-audit';
import { getNoblePhantasmVariants, noblePhantasmVariantKey } from '@fgo-lab/master-data';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { hpProofCoverageInventory, type HpProofDeclaration } from './productionHpProofCoverage';
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
  | 'npVariantSelectionMismatch';
interface Failure {
  reason: HpPublishedDependencyReason;
  path: string;
}
const hpLeaves = (condition: ConditionExpression): ConditionExpression[] =>
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
  requests.forEach(({ prepared, calculation, ownerScope }, requestIndex) => {
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
    const conditionDeclarations = (operation: BattleOperation, comparison: string, value: number) =>
      dependencies.filter(
        (d) =>
          d.identity.kind === 'condition' &&
          sourceMatches(d, operation.source, operation.source.origin === 'np' ? ref : null) &&
          'comparison' in d.value &&
          d.value.comparison === comparison &&
          'value' in d.value &&
          d.value.value === value,
      );
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
      hpLeaves(operation.condition).forEach((leaf, position) => {
        if (leaf.kind !== 'quantity') return;
        const d = one(
          conditionDeclarations(operation, leaf.comparison, leaf.value),
          `requests.${requestIndex}.operations.${sequence}.conditions.${position}`,
        );
        if (d)
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
        if (!matches.length)
          fail('unmatchedCanonical', `requests.${requestIndex}.operations.${sequence}.expression`);
        matches.forEach((d, position) =>
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
      if (!candidate && target?.selection !== 'unresolved') fail('missingCapture', candidatePath);
      if (candidate && candidate.seed.hp !== ordered?.hp)
        fail('requestOwnerMismatch', `${candidatePath}.seed`);
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
          conditionDeclarations(operation, read.comparison, read.expectedValue),
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
    if (ownerScope === 'supportProjection')
      candidates.forEach((captured) => {
        const candidate = hpCandidateObservationFor(captured.candidateState);
        candidate?.valueReads.forEach((read, position) => {
          if (
            !dependencies.some(
              (declaration) =>
                declaration.identity.kind === 'valueExpression' &&
                sourceMatches(declaration, read.operation.source, null),
            )
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
              sourceMatches(binding.declaration, read.operation.source, null),
          );
          if (
            !operation ||
            operation !== read.operation ||
            read.result.operation !== operation ||
            event?.operationId !== operation.operationId ||
            event.operationOutcome !==
              (group?.outcome === 'rolledBack' ? 'unsupported' : read.result.outcome) ||
            !group?.operationIds.includes(operation.operationId) ||
            selected.length !== 1
          ) {
            fail('valueReadMismatch', `requests.${requestIndex}.valueReads.${position}`);
            return;
          }
          const declaration = selected[0]!.declaration;
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
    unobserved: [
      'availableActionInventory',
      'valueExpressionActualRead',
      'ocRateExpressionActualRead',
      'wholeNativeNoncommitCoverage',
      'successfulRecoveryCoverage',
    ],
    qualification:
      'Correspondence within the original control producer requests only. Direct scenario owner is not variant or cell selection. Declaration, selected cell, reached step, native action, append, actual read and NP evaluation are distinct; absent stages are not zero, unsupported or product exclusion.',
    productClosure: false as const,
    gate: { passed: failures.length === 0, failures, firstDifference: failures[0] ?? null },
  };
}
