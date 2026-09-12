import {
  ATTACKER_RESOURCE_ACTOR,
  compileOcSourceProgram,
  conditionQuantityReads,
  effectExecutesInNpProgram,
  effectChangesPreparation,
  expressionQuantityReads,
  noblePhantasmDamageDependency,
  resourceQueriesMayIntersect,
  currentResourceQuery,
  mutationResourceAccess,
  resourceSourceActor,
  resourceRecipientActor,
  type QuantityRead,
  type ResourceKind,
  type ResourceQuery,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import type { MasterEffect, ServantMaster } from '@fgo-lab/master-data';
import {
  rankingProgramSourceGroups,
  type RankingProgramSourceGroup,
} from './rankingProgramSources';
import type { StaticRankingPreparationProgram } from './rankingStaticPreparation';

interface Position {
  group: number;
  effect: string | null;
  source: string | null;
  operation: number | null;
  phase: 'effect' | 'npUse' | 'damage' | 'ordinaryDependency';
}
type InstanceRead = Extract<QuantityRead, { kind: 'buffInstances' }>;
const instanceQueries = (reads: readonly QuantityRead[]): InstanceRead[] =>
  reads.filter((read): read is InstanceRead => read.kind === 'buffInstances');
interface Access {
  instanceReads?: readonly InstanceRead[];
  instanceWrite?: {
    actor: InstanceRead['actor'];
    operation: Extract<MasterEffect['execution'][number], { kind: 'buffInstanceMutation' }>;
  };
  position: Position;
  reads: readonly ResourceQuery[];
  writes: readonly ResourceQuery[];
  opaqueReason: string | null;
  recipient: string | null;
  cells: number;
  /** Required guards are declared separately until installed in the executor. */
  hpGuard: boolean;
  rate?: { kind: 'grant'; values: readonly ResourceQuery[] } | { kind: 'use' };
}

const queries = (reads: readonly QuantityRead[]): ResourceQuery[] =>
  reads.flatMap((read) => (read.kind === 'resource' ? [read.query] : []));
function uniqueQueries(reads: readonly ResourceQuery[]): ResourceQuery[] {
  return [...new Map(reads.map((query) => [JSON.stringify(query), query])).values()];
}
function opaqueReason(operation: MasterEffect['execution'][number]): string | null {
  switch (operation.kind) {
    case 'unsupported':
      return operation.reason;
    case 'populationMutation':
      return operation.mutation === 'unsupported'
        ? 'unsupportedPopulationMutation'
        : 'populationStateDependency';
    case 'buffInstanceMutation':
      return operation.mutation === 'move' || operation.mutation === 'unsupported'
        ? 'unsupportedBuffInstanceMutation'
        : null;
    case 'stateMutation':
    case 'transformActorForm':
    case 'selectNoblePhantasmVariant':
    case 'removeOcState':
    case 'ocRemovalResistance':
      return operation.kind;
    case 'contextMutation':
      return operation.mutation === 'addQuantity' ? null : 'contextResourceDependency';
    case 'resourceMutation':
      return operation.amount.kind === 'dependent'
        ? 'dependentResourceAmount'
        : operation.amount.kind === 'populationCount'
          ? 'populationStateDependency'
          : null;
    case 'damageModifier':
    case 'modifierRateChange':
    case 'ignoreDefense':
    case 'ignoreDamageCut':
    case 'boundedPhaseIrrelevant':
    case 'ocStateNonIntersection':
    case 'grantOcBoost':
    case 'grantOcApplicationRate':
      return null;
    default: {
      const unclassified: never = operation;
      throw new TypeError(`unclassified_resource_program_operation:${String(unclassified)}`);
    }
  }
}

function effectAccesses(source: SourceEffect, group: number): Access[] {
  if (!effectExecutesInNpProgram(source.effect)) return [];
  const sourceKey = JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    source.constantFormKey ?? null,
  ]);
  const program = compileOcSourceProgram(source);
  const valueContext = {
    actor: resourceSourceActor(source),
    sourceActor: resourceSourceActor(source),
    inputDefinitions: source.effect.inputDefinitions,
  };
  const conditionContext = {
    ...valueContext,
    actor: program.conditionActor === 'source' ? valueContext.actor : ATTACKER_RESOURCE_ACTOR,
  };
  const conditionReads = conditionQuantityReads(program.condition, conditionContext);
  const preparationReadsCondition =
    effectChangesPreparation(source.effect, source.origin) || program.operations.length > 0;
  const position = (operation: number | null, phase: Position['phase']): Position => ({
    group,
    effect: source.effect.occurrenceId,
    source: sourceKey,
    operation,
    phase,
  });
  const empty = {
    writes: [],
    reads: [],
    cells: 0,
    hpGuard: false,
    recipient: null,
    opaqueReason: null,
  };
  const result: Access[] = [
    {
      ...empty,
      position: position(null, preparationReadsCondition ? 'effect' : 'ordinaryDependency'),
      reads: uniqueQueries(queries(conditionReads)),
      ...(instanceQueries(conditionReads).length
        ? { instanceReads: instanceQueries(conditionReads) }
        : {}),
      // BP actor/domain is known, but today's activation facts do not implement its live query.
      opaqueReason:
        conditionReads.find((read) => read.kind === 'unresolved')?.reason ??
        (queries(conditionReads).some((read) => read.resource === 'battlePoint')
          ? 'unresolvedLiveBattlePointRead'
          : null),
    },
  ];
  for (const [index, operation] of source.effect.execution.entries()) {
    const mutation =
      operation.kind === 'resourceMutation' ? mutationResourceAccess(operation, source) : null;
    const writes: ResourceQuery[] = mutation
      ? [mutation.write]
      : operation.kind === 'contextMutation' && operation.mutation === 'addQuantity'
        ? [currentResourceQuery('battlePoint', ATTACKER_RESOURCE_ACTOR, operation.subjectId)]
        : [];
    const reads = mutation ? queries(mutation.amountReads) : [];
    const instanceReads =
      mutation?.amountReads.filter((read): read is InstanceRead => read.kind === 'buffInstances') ??
      [];
    if (operation.kind === 'buffInstanceMutation' && operation.grantLimit)
      instanceReads.push({
        kind: 'buffInstances',
        actor: resourceRecipientActor(source, operation.recipient),
        trait: operation.grantLimit.trait,
        lifetime: 'all',
      });
    if ('valueExpressions' in operation) {
      const quantityReads = [
        ...operation.valueExpressions.flat(),
        ...(operation.limitBreakValueExpressions?.flat() ?? []),
      ].flatMap((expression) => expressionQuantityReads(expression, valueContext));
      const values = uniqueQueries(queries(quantityReads));
      const instances = instanceQueries(quantityReads);
      if (values.length || instances.length)
        result.push({
          ...empty,
          position: position(index, 'ordinaryDependency'),
          reads: values,
          ...(instances.length ? { instanceReads: instances } : {}),
        });
    }
    if (operation.kind === 'grantOcApplicationRate') {
      const values = uniqueQueries(
        queries(
          [...operation.cells.flat(), ...(operation.limitBreakCells?.flat() ?? [])].flatMap(
            ({ amount }) => expressionQuantityReads(amount, valueContext),
          ),
        ),
      );
      if (values.length)
        result.push({
          ...empty,
          position: position(index, 'effect'),
          recipient: operation.route.target,
          rate: { kind: 'grant', values },
        });
    }
    const reason = opaqueReason(operation);
    if (
      writes.length === 0 &&
      reads.length === 0 &&
      reason === null &&
      operation.kind !== 'grantOcBoost' &&
      operation.kind !== 'buffInstanceMutation' &&
      instanceReads.length === 0
    )
      continue;
    result.push({
      ...empty,
      position: position(index, 'effect'),
      ...(instanceReads.length ? { instanceReads } : {}),
      ...(operation.kind === 'buffInstanceMutation'
        ? {
            instanceWrite: {
              actor: resourceRecipientActor(source, operation.recipient),
              operation,
            },
          }
        : {}),
      writes,
      reads,
      opaqueReason: reason,
      ...(operation.kind === 'grantOcBoost' ? { rate: { kind: 'use' as const } } : {}),
      cells:
        operation.kind === 'resourceMutation' && operation.amount.kind !== 'dependent'
          ? operation.amount.values.flat().length +
            (operation.amount.limitBreakValues?.flat().length ?? 0)
          : 0,
      recipient:
        'recipient' in operation
          ? operation.recipient
          : 'route' in operation
            ? operation.route.target
            : null,
    });
  }
  return result;
}

type ObservedReader = Position & { query: ResourceQuery };
export interface ResourceProgramObservation {
  instanceAccesses?: readonly Pick<Access, 'position' | 'instanceReads' | 'instanceWrite'>[];
  kind: 'declaredResourceProgram';
  programKey: string;
  valueCellScope: 'allCanonicalCells';
  readCoverage: 'declaredQueriesPartialExecution';
  sourceGroups: readonly (Pick<
    RankingProgramSourceGroup,
    'kind' | 'commandIndex' | 'formId' | 'damageActive'
  > & {
    noblePhantasmVariant: NonNullable<RankingProgramSourceGroup['noblePhantasm']>['ref'] | null;
  })[];
  mutations: readonly {
    writer: Position;
    resource: ResourceKind;
    recipient: string | null;
    actor: ResourceQuery['actor'];
    domain: string | null;
    cells: number;
    firstPotentialReader: ObservedReader | null;
    firstRequiredHpGuard: ObservedReader | null;
    deferredReader: ObservedReader | null;
    firstOpaqueOperation: Position | null;
  }[];
  opaqueOperations: readonly { position: Position; reason: string }[];
}

function observedReader(
  accesses: readonly Access[],
  writer: ResourceQuery,
  predicate: (access: Access, query: ResourceQuery) => boolean,
): ObservedReader | null {
  for (const access of accesses) {
    const query = access.reads.find(
      (read) => predicate(access, read) && resourceQueriesMayIntersect(writer, read),
    );
    if (query) return { ...access.position, query };
  }
  return null;
}

/** This is a dependency observation, not an admission verdict or an execution outcome. */
export function observeResourceProgram(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
): ResourceProgramObservation {
  const groups = rankingProgramSourceGroups(servant, program, 1);
  const accesses: Access[] = [];
  const hpGuard: ResourceQuery = {
    resource: 'hp',
    measure: 'alive',
    actor: ATTACKER_RESOURCE_ACTOR,
  };
  for (const [groupIndex, group] of groups.entries()) {
    const empty = { opaqueReason: null, cells: 0, recipient: null };
    const position = (phase: Position['phase']): Position => ({
      group: groupIndex,
      effect: null,
      source: null,
      operation: null,
      phase,
    });
    if (group.noblePhantasm)
      accesses.push({
        ...empty,
        position: position('npUse'),
        reads: [currentResourceQuery('npGauge', ATTACKER_RESOURCE_ACTOR, null), hpGuard],
        writes: [currentResourceQuery('npGauge', ATTACKER_RESOURCE_ACTOR, null)],
        hpGuard: true,
      });
    for (const source of group.sources) accesses.push(...effectAccesses(source, groupIndex));
    if (group.kind === 'terminal' && group.noblePhantasm?.kind === 'attack') {
      const reads = group.noblePhantasm.damage.flatMap((damage) =>
        damage.parametersByOvercharge.flatMap((row, oc) =>
          row.flatMap((_, level) =>
            queries(
              conditionQuantityReads(noblePhantasmDamageDependency(damage, oc + 1, level + 1)),
            ),
          ),
        ),
      );
      accesses.push({
        ...empty,
        position: position('damage'),
        reads: uniqueQueries([...reads, hpGuard]),
        writes: [],
        hpGuard: true,
      });
    }
  }
  // Conservative possible rate liveness. Removal and activation stay opaque: never a grant proof.
  let possibleRateValues: ResourceQuery[] = [];
  for (const access of accesses) {
    if (access.rate?.kind === 'use')
      access.reads = uniqueQueries([...access.reads, ...possibleRateValues]);
    if (access.rate?.kind === 'grant')
      possibleRateValues = uniqueQueries([...possibleRateValues, ...access.rate.values]);
  }
  const mutations: ResourceProgramObservation['mutations'][number][] = [];
  for (const [index, access] of accesses.entries()) {
    const suffix = accesses.slice(index + 1);
    for (const writer of access.writes)
      mutations.push({
        writer: access.position,
        resource: writer.resource,
        recipient: access.recipient,
        actor: writer.actor,
        domain: writer.resource === 'battlePoint' ? writer.domain : null,
        cells: access.cells,
        firstPotentialReader: observedReader(
          suffix,
          writer,
          (read, query) =>
            read.position.phase !== 'ordinaryDependency' &&
            !(query.resource === 'hp' && query.measure === 'alive'),
        ),
        firstRequiredHpGuard:
          writer.resource === 'hp'
            ? observedReader(
                suffix,
                writer,
                (read, query) =>
                  read.hpGuard && query.resource === 'hp' && query.measure === 'alive',
              )
            : null,
        // Ordinary declarations do not establish their order against preparation writes yet.
        deferredReader: observedReader(
          accesses,
          writer,
          (read) => read.position.phase === 'ordinaryDependency',
        ),
        firstOpaqueOperation:
          suffix.find(({ opaqueReason }) => opaqueReason !== null)?.position ?? null,
      });
  }
  const instanceAccesses = accesses
    .filter((access) => access.instanceReads || access.instanceWrite)
    .map(({ position, instanceReads, instanceWrite }) => ({
      position,
      ...(instanceReads ? { instanceReads } : {}),
      ...(instanceWrite ? { instanceWrite } : {}),
    }));
  return {
    ...(instanceAccesses.length ? { instanceAccesses } : {}),
    kind: 'declaredResourceProgram',
    programKey: program.key,
    valueCellScope: 'allCanonicalCells',
    readCoverage: 'declaredQueriesPartialExecution',
    sourceGroups: groups.map(({ kind, commandIndex, formId, damageActive, noblePhantasm }) => ({
      kind,
      commandIndex,
      formId,
      damageActive,
      noblePhantasmVariant: noblePhantasm?.ref ?? null,
    })),
    mutations,
    opaqueOperations: accesses.flatMap(({ position, opaqueReason }) =>
      opaqueReason === null ? [] : [{ position, reason: opaqueReason }],
    ),
  };
}
