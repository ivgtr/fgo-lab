import { isDeepStrictEqual } from 'node:util';
import {
  hpPermille,
  preparationOcRatesFor,
  ocRateAppliesToGrant,
} from '@fgo-lab/battle-execution/preparation-audit';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import type { OcLifetimeLimit } from '@fgo-lab/master-data';
import type { HpProofDeclaration } from './productionHpProofCoverage';
import type { HpPublishedDependencyRequest } from './productionHpPublishedDependencyCoverage';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { scalarQuantitySnapshot } from './productionScalarQuantityAudit';

function participates(rate: { decision: import('@fgo-lab/battle-execution').OcRateInstance['decision'] }) {
  return rate.decision.binding.executionIntent === 'physicalBranch' ||
    Object.values(rate.decision.adoption).every(({ kind }) => kind === 'included');
}
function boundParticipation(step: Extract<import('@fgo-lab/battle-execution').OcActionStep, { kind: 'grant' }>) {
  const { binding } = step;
  if (binding.executionIntent === 'physicalBranch' || binding.policy.kind === 'calculator') return true;
  const { policy, activation } = binding;
  return !(policy.selfBuffs === 'excluded' && step.sourceEvidence.source.origin === 'attacker' &&
    binding.gameActivation === 'skillUse') &&
    !(policy.areaView === 'excluded' && binding.contributionScope === 'partyWide') &&
    !(policy.conditionalEffects === 'baseline' &&
      (activation.read.certainty !== 'guaranteed' ||
       activation.proc.kind !== 'resolved' || activation.proc.certainty !== 'guaranteed'));
}

/** Join native query obligations to physical reads; never evaluate rate/damage semantics here. */
export function reconcileOcRateReads(
  declarations: readonly HpProofDeclaration[],
  requests: readonly HpPublishedDependencyRequest[],
) {
  const failures: {
    reason: 'ocRateReadMismatch' | 'ocRateTransactionMismatch';
    path: string;
    canonicalIdentity: string;
    firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
  }[] = [];
  const rows: {
    requestIndex: number;
    actionIndex: number;
    actionId: string;
    step: number;
    declaration: HpProofDeclaration['identity'];
    instanceId: number;
    actor: string;
    disposition: 'physicalRead' | 'excludedWithoutRead';
    hp: number | null | undefined;
    nativeStatus: 'committed' | 'invalid' | 'unsupported' | 'inputRequired';
    nativeReason: string | null;
    transaction: 'committed' | 'rejected';
    consumed: boolean;
    usesBefore: OcLifetimeLimit;
    usesAfter: OcLifetimeLimit | undefined;
  }[] = [];
  const check = (
    reason: (typeof failures)[number]['reason'],
    identity: string,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    if (isDeepStrictEqual(expected, actual)) return;
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity, value: scalarQuantitySnapshot(expected) }],
      [{ identity, value: scalarQuantitySnapshot(actual) }],
    );
    if (!firstDifference) throw new TypeError('oc_rate_difference_missing');
    failures.push({
      reason,
      path,
      canonicalIdentity: identity,
      firstDifference: {
        ...firstDifference,
        path: firstDifference.path ? `${path}.${firstDifference.path}` : path,
      },
    });
  };
  requests.forEach(({ prepared }, requestIndex) => {
    const transport = battlePointPreparationRejectionObservationFor(prepared);
    if (!transport) return; // The enclosing published gate validates capture availability.
    const grants = transport.transitions.flatMap((transition, actionIndex) =>
      (transition.attempts ?? []).flatMap((attempt) =>
        attempt.reached.flatMap(({ index, step }) =>
          step.kind === 'grant' && step.grant.kind === 'grantOcApplicationRate'
            ? [{ actionIndex, index, step }]
            : [],
        ),
      ),
    );
    transport.transitions.forEach((transition, actionIndex) => {
      transition.attempts?.forEach((attempt) => {
        const capture = preparationOcRatesFor(attempt);
        if (!capture) {
          check(
            'ocRateReadMismatch',
            JSON.stringify([requestIndex, actionIndex, attempt.actionId]),
            'capture',
            true,
            attempt.native === undefined,
          );
          return;
        }
        const actionIdentity = JSON.stringify([requestIndex, actionIndex, attempt.actionId]);
        const isHp = (rate: (typeof capture.queries)[number]['rate']) =>
          rate.amount.kind === 'inverseHpLinear' || rate.amount.kind === 'hpRangeLinear';
        const expectedReads = capture.queries.filter(({ rate }) => participates(rate) && isHp(rate));
        // Rejection discards native outcomes. Earlier reached grants still crossed the
        // selection boundary; missing captures must not turn them into absent consumers.
        const lastReached = attempt.reached.at(-1)?.index;
        for (const { index, step } of attempt.reached) {
          const pendingRejection =
            index === lastReached &&
            attempt.native?.status !== 'committed' &&
            attempt.native?.reason.startsWith('ocRateCondition:');
          if (
            step.kind === 'grant' &&
            step.condition === true &&
            step.grant.lifetime !== 'constant' &&
            (step.limitBreak ? step.grant.limitBreakCells : step.grant.cells)?.[
              step.valueSetIndex
            ]?.[step.valueIndex] &&
            !pendingRejection
          )
            check(
              'ocRateReadMismatch',
              actionIdentity,
              `selection.${index}`,
              1,
              capture.selections.filter((entry) => entry.step === index).length,
            );
        }
        let matchedQueries = 0;
        let previousSelection = -1;
        for (const selection of capture.selections) {
          check(
            'ocRateReadMismatch',
            actionIdentity,
            `selection.${selection.step}.order`,
            true,
            selection.step > previousSelection,
          );
          previousSelection = selection.step;
          const step = attempt.reached.find((entry) => entry.index === selection.step)?.step;
          check(
            'ocRateReadMismatch',
            actionIdentity,
            `selection.${selection.step}.grant`,
            true,
            step?.kind === 'grant' && step.grant.lifetime !== 'constant',
          );
          if (step?.kind !== 'grant') continue;
          const eligible = selection.state.rates.filter((rate) =>
            ocRateAppliesToGrant(rate, selection.state, step),
          );
          const queries = capture.queries.filter((entry) => entry.step === selection.step);
          const blocked = queries.at(-1);
          // Rejection may stop before a later selected rate. It must stop at an actual
          // unresolved HP read or a native unsupported expression, never an absent observation.
          const stopped =
            attempt.native?.status !== 'committed' &&
            blocked && participates(blocked.rate) &&
            (isHp(blocked.rate)
              ? hpPermille(blocked.hp?.actors[blocked.rate.valueOwner]) === null
              : blocked.rate.amount.kind !== 'fixed');
          const expectedCount = stopped ? eligible.indexOf(blocked.rate) + 1 : eligible.length;
          check(
            'ocRateReadMismatch',
            actionIdentity,
            `selection.${selection.step}.queries`,
            expectedCount,
            queries.length,
          );
          eligible
            .slice(0, expectedCount)
            .forEach((rate, index) =>
              check(
                'ocRateReadMismatch',
                actionIdentity,
                `selection.${selection.step}.queries.${index}`,
                true,
                queries[index]?.rate === rate && queries[index].state === selection.state,
              ),
            );
          queries.forEach((query, index) =>
            check(
              'ocRateReadMismatch',
              actionIdentity,
              `selection.${selection.step}.queries.${index}.order`,
              true,
              query === capture.queries[matchedQueries + index] && query.hp === selection.hp,
            ),
          );
          matchedQueries += queries.length;
        }
        check(
          'ocRateReadMismatch',
          actionIdentity,
          'queries.length',
          matchedQueries,
          capture.queries.length,
        );
        check(
          'ocRateReadMismatch',
          actionIdentity,
          'reads.length',
          expectedReads.length,
          capture.reads.length,
        );
        let readIndex = 0;
        capture.queries.forEach((query, queryIndex) => {
          const { rate } = query;
          if (!isHp(rate)) return;
          const writers = grants.filter(
            ({ actionIndex: writerAction, index, step }) =>
              (writerAction < actionIndex ||
                (writerAction === actionIndex && index < query.step)) &&
              step.sourceKey === rate.sourceKey &&
              step.caster === rate.valueOwner &&
              step.grant.kind === 'grantOcApplicationRate' &&
              (step.limitBreak ? step.grant.limitBreakCells : step.grant.cells)?.[
                step.valueSetIndex
              ]?.[step.valueIndex]?.amount === rate.amount,
          );
          const writer = writers.length === 1 ? writers[0] : undefined;
          const matching = writer
            ? declarations.filter(
                (declaration) =>
                  declaration.identity.kind === 'ocRateExpression' &&
                  declaration.operation === writer.step.grant &&
                  declaration.identity.path ===
                    `execution.${declaration.effect!.execution.indexOf(writer.step.grant)}.${writer.step.limitBreak ? 'limitBreakCells' : 'cells'}.${writer.step.valueSetIndex}.${writer.step.valueIndex}.amount`,
              )
            : [];
          const identity = JSON.stringify([
            requestIndex,
            attempt.actionId,
            query.step,
            rate.instanceId,
            matching[0]?.identity ?? null,
          ]);
          const path = `requests.${requestIndex}.actions.${actionIndex}.ocRateQueries.${queryIndex}`;
          check('ocRateReadMismatch', identity, `${path}.writer`, 1, writers.length);
          check('ocRateReadMismatch', identity, `${path}.declaration`, 1, matching.length);
          if (writer?.step.grant.kind === 'grantOcApplicationRate') {
            check(
              'ocRateReadMismatch',
              identity,
              `${path}.writerState`,
              {
                owner: writer.step.recipient,
                valueOwner: writer.step.caster,
                included: boundParticipation(writer.step),
                role: writer.step.grant.role,
                sign: writer.step.grant.sign,
                lifetime: writer.step.grant.lifetime,
                stateTraits: writer.step.grant.stateTraits,
                formKey: writer.step.formKey,
              },
              {
                owner: rate.owner,
                valueOwner: rate.valueOwner,
                included: participates(rate),
                role: rate.role,
                sign: rate.sign,
                lifetime: rate.lifetime,
                stateTraits: rate.stateTraits,
                formKey: rate.formKey,
              },
            );
            check(
              'ocRateReadMismatch',
              identity,
              `${path}.writerReference`,
              true,
              rate.sourceEvidence === writer.step.sourceEvidence,
            );
          }
          const reached = attempt.reached.find(({ index }) => index === query.step)?.step;
          check(
            'ocRateReadMismatch',
            identity,
            `${path}.query`,
            true,
            reached?.kind === 'grant' &&
              query.state.rates.includes(rate) &&
              reached.grant.lifetime !== 'constant' &&
              reached.grant.stateTraits.includes('positive') &&
              rate.owner === (rate.role === 'casterGrant' ? reached.caster : reached.recipient),
          );
          const read = participates(rate) ? capture.reads[readIndex++] : undefined;
          if (participates(rate)) {
            check(
              'ocRateReadMismatch',
              identity,
              `${path}.reader`,
              true,
              read?.rate === rate && read.step === query.step,
            );
            check(
              'ocRateReadMismatch',
              identity,
              `${path}.hp`,
              hpPermille(query.hp?.actors[rate.valueOwner]),
              read?.hp,
            );
          }
          const native = attempt.native;
          const nativeCommitted = native?.status === 'committed';
          const committed = nativeCommitted && transition.result.status === 'applied';
          if (native && !nativeCommitted) {
            check(
              'ocRateTransactionMismatch',
              identity,
              `${path}.rollback`,
              true,
              native.state === attempt.start.ocState &&
                attempt.returned === attempt.start &&
                transition.result.status !== 'applied',
            );
          }
          if (native)
            check(
              'ocRateTransactionMismatch',
              identity,
              `${path}.returnedOcState`,
              true,
              transition.result.status === 'applied'
                ? nativeCommitted && transition.result.state.ocState === native.state
                : transition.result.state === transition.before,
            );
          check(
            'ocRateTransactionMismatch',
            identity,
            `${path}.native`,
            true,
            native !== undefined,
          );
          const after = transition.result.state.ocState.rates.find(
            ({ instanceId }) => instanceId === rate.instanceId,
          );
          // An explicitly removed instance has no surviving use counter to consume.
          const removed =
            committed &&
            !after &&
            attempt.reached.some(
              ({ index, step }) =>
                index > query.step &&
                step.kind === 'remove' &&
                native.outcomes.some(
                  (outcome) => outcome.step === index && outcome.outcome === 'applied',
                ) &&
                step.recipient === rate.owner &&
                rate.lifetime === 'active' &&
                rate.stateTraits.some((trait) => step.selector.includes(trait)),
            );
          const expectedUses =
            committed && rate.uses.kind === 'finite'
              ? { kind: 'finite', remaining: Math.max(0, rate.uses.remaining - 1) }
              : rate.uses;
          if (committed && !removed)
            check('ocRateTransactionMismatch', identity, `${path}.uses`, expectedUses, after?.uses);
          if (matching.length === 1 && native)
            rows.push({
              requestIndex,
              actionIndex,
              actionId: attempt.actionId,
              step: query.step,
              declaration: matching[0]!.identity,
              instanceId: rate.instanceId,
              actor: rate.valueOwner,
              disposition: participates(rate) ? 'physicalRead' : 'excludedWithoutRead',
              hp: read?.hp,
              nativeStatus: native.status,
              nativeReason: native.status === 'committed' ? null : native.reason,
              transaction: committed ? 'committed' : 'rejected',
              consumed:
                committed && !removed && rate.uses.kind === 'finite' && rate.uses.remaining > 0,
              usesBefore: rate.uses,
              usesAfter: after?.uses,
            });
        });
      });
    });
  });
  return { rows, failures };
}
