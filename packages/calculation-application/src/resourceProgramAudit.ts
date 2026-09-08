import {
  compileOcSourceProgram,
  conditionReadsResource,
  effectExecutesInNpProgram,
  effectChangesPreparation,
  noblePhantasmDamageDependency,
  resolveResourceTargetPolicy,
  type SourceEffect,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import type { MasterEffect, ModifierValueExpression, ServantMaster } from '@fgo-lab/master-data';
import {
  rankingProgramSourceGroups,
  type RankingProgramSourceGroup,
} from './rankingProgramSources';
import type { StaticRankingPreparationProgram } from './rankingStaticPreparation';

type Resource = 'hp' | 'npGauge' | 'battlePoint' | 'criticalStars';
interface Position {
  group: number;
  effect: string | null;
  source: string | null;
  operation: number | null;
  phase: 'effect' | 'npUse' | 'damage' | 'ordinaryDependency';
}
interface Access {
  position: Position;
  reads: readonly Resource[];
  writes: readonly Resource[];
  opaqueReason: string | null;
  recipient: string | null;
  actor: 'attacker' | 'target' | 'other' | 'unresolved';
  cells: number;
  /** Required HP guards are separately observed, not claimed to exist in today's executor. */
  hpGuard: boolean;
  ocAccess?: 'grantHpRate' | 'useRate';
}

function expressionResource(
  expression: ModifierValueExpression | { kind: 'fixed'; value: number } | null,
): Resource | null {
  if (expression?.kind === 'inverseHpLinear' || expression?.kind === 'hpRangeLinear') return 'hp';
  if (expression?.kind === 'inputLinear' && expression.inputKey === 'battle:criticalStars')
    return 'criticalStars';
  return null;
}

const resources = ['hp', 'npGauge', 'battlePoint', 'criticalStars'] as const;
function opaqueReason(operation: MasterEffect['execution'][number]): string | null {
  switch (operation.kind) {
    case 'unsupported':
      return operation.reason;
    case 'stateMutation':
    case 'transformActorForm':
    case 'selectNoblePhantasmVariant':
    case 'removeOcState':
    case 'ocRemovalResistance':
      return operation.kind;
    case 'contextMutation':
      return operation.mutation === 'addQuantity' ? null : 'contextResourceDependency';
    case 'resourceMutation':
      return operation.amount.kind === 'dependent' ? 'dependentResourceAmount' : null;
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

/** Existing resource readers do not resolve source-qualified BP rates or foreign actors. */
function opaqueConditionReason(condition: ConditionExpression): string | null {
  if (condition.kind === 'all' || condition.kind === 'any')
    return (
      condition.expressions.map(opaqueConditionReason).find((reason) => reason !== null) ?? null
    );
  if (condition.kind === 'not') return opaqueConditionReason(condition.expression);
  if (condition.kind === 'sourceQuantity') return 'unresolvedSourceQuantityRead';
  if (condition.kind === 'quantity' && condition.subjectId !== undefined)
    return 'unresolvedResourceActor';
  return condition.kind === 'unsupported' ? condition.reason : null;
}

function effectAccesses(source: SourceEffect, group: number): Access[] {
  if (!effectExecutesInNpProgram(source.effect)) return [];
  const sourceKey = JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    source.constantFormKey ?? null,
  ]);
  const ocProgram = compileOcSourceProgram(source);
  const condition = ocProgram.condition;
  const preparationReadsCondition =
    effectChangesPreparation(source.effect, source.origin) || ocProgram.operations.length > 0;
  // These are observed current readers. Missing canonical amount/actor semantics remain opaque.
  const explicitReads = resources.filter(
    (resource) => resource !== 'npGauge' && conditionReadsResource(condition, resource),
  );
  const result: Access[] = [
    {
      position: {
        group,
        effect: source.effect.occurrenceId,
        source: sourceKey,
        operation: null,
        phase: preparationReadsCondition ? 'effect' : 'ordinaryDependency',
      },
      reads: explicitReads,
      writes: [],
      opaqueReason: opaqueConditionReason(condition),
      recipient: null,
      actor: 'attacker',
      cells: 0,
      hpGuard: false,
    },
  ];
  for (const [index, operation] of source.effect.execution.entries()) {
    const writes: Resource[] =
      operation.kind === 'resourceMutation'
        ? [operation.resource]
        : operation.kind === 'contextMutation' && operation.mutation === 'addQuantity'
          ? ['battlePoint']
          : [];
    const reads: Resource[] =
      operation.kind === 'resourceMutation' && operation.amount.kind === 'currentGaugeRatio'
        ? ['npGauge']
        : [];
    if ('valueExpressions' in operation) {
      const deferredReads = new Set<Resource>();
      for (const expression of [
        ...operation.valueExpressions.flat(),
        ...(operation.limitBreakValueExpressions?.flat() ?? []),
      ]) {
        const resource = expressionResource(expression);
        if (resource !== null) deferredReads.add(resource);
      }
      if (deferredReads.size > 0)
        result.push({
          position: {
            group,
            effect: source.effect.occurrenceId,
            source: sourceKey,
            operation: index,
            phase: 'ordinaryDependency',
          },
          reads: [...deferredReads],
          writes: [],
          opaqueReason: null,
          recipient: null,
          actor: 'attacker',
          cells: 0,
          hpGuard: false,
        });
    }
    const reason = opaqueReason(operation);
    const opaque = reason !== null;
    // OC rate values are read when a later boost uses them, not when the instance is granted.
    if (
      operation.kind === 'grantOcApplicationRate' &&
      [...operation.cells.flat(), ...(operation.limitBreakCells?.flat() ?? [])].some(
        ({ amount }) => expressionResource(amount) === 'hp',
      )
    ) {
      result.push({
        position: {
          group,
          effect: source.effect.occurrenceId,
          source: sourceKey,
          operation: index,
          phase: 'effect',
        },
        reads: [],
        writes: [],
        opaqueReason: null,
        cells: 0,
        hpGuard: false,
        recipient: operation.route.target,
        actor: 'attacker',
        ocAccess: 'grantHpRate',
      });
    }
    if (writes.length === 0 && reads.length === 0 && !opaque && operation.kind !== 'grantOcBoost')
      continue;
    const cells =
      operation.kind === 'resourceMutation' && operation.amount.kind !== 'dependent'
        ? operation.amount.values.flat().length +
          (operation.amount.limitBreakValues?.flat().length ?? 0)
        : 0;
    result.push({
      position: {
        group,
        effect: source.effect.occurrenceId,
        source: sourceKey,
        operation: index,
        phase: 'effect',
      },
      reads,
      ...(operation.kind === 'grantOcBoost' ? { ocAccess: 'useRate' as const } : {}),
      writes,
      opaqueReason: reason,
      cells,
      hpGuard: false,
      actor:
        operation.kind === 'resourceMutation'
          ? (resolveResourceTargetPolicy(source.origin, operation.recipient) ?? 'other')
          : 'unresolved',
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

export interface ResourceProgramObservation {
  kind: 'declaredResourceProgram';
  programKey: string;
  valueCellScope: 'allCanonicalCells';
  readCoverage: 'partialCurrentContracts';
  sourceGroups: readonly (Pick<
    RankingProgramSourceGroup,
    'kind' | 'commandIndex' | 'formId' | 'damageActive'
  > & {
    noblePhantasmVariant: NonNullable<RankingProgramSourceGroup['noblePhantasm']>['ref'] | null;
  })[];
  mutations: readonly {
    writer: Position;
    resource: Resource;
    recipient: string | null;
    actor: 'attacker' | 'target' | 'other' | 'unresolved';
    cells: number;
    firstPotentialReader: Position | null;
    firstRequiredHpGuard: Position | null;
    deferredReader: Position | null;
    firstOpaqueOperation: Position | null;
  }[];
  opaqueOperations: readonly { position: Position; reason: string }[];
}

/** Joins selected source order to current readers and missing terminal HP guards without raw inference. */
export function observeResourceProgram(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
): ResourceProgramObservation {
  const accesses: Access[] = [];
  const groups = rankingProgramSourceGroups(servant, program, 1);
  for (const [groupIndex, group] of groups.entries()) {
    if (group.noblePhantasm)
      accesses.push({
        position: {
          group: groupIndex,
          effect: null,
          source: null,
          operation: null,
          phase: 'npUse',
        },
        reads: ['npGauge'],
        writes: ['npGauge'],
        opaqueReason: null,
        recipient: 'sourceSelf',
        actor: 'attacker',
        cells: 0,
        hpGuard: true,
      });
    for (const source of group.sources) accesses.push(...effectAccesses(source, groupIndex));
    if (group.kind === 'terminal' && group.noblePhantasm?.kind === 'attack') {
      const damage = group.noblePhantasm.damage;
      const reads = resources.filter(
        (resource) =>
          resource !== 'npGauge' &&
          damage.some((item) =>
            item.parametersByOvercharge.some((row, oc) =>
              row.some((_, level) =>
                conditionReadsResource(
                  noblePhantasmDamageDependency(item, oc + 1, level + 1),
                  resource,
                ),
              ),
            ),
          ),
      );
      accesses.push({
        position: {
          group: groupIndex,
          effect: null,
          source: null,
          operation: null,
          phase: 'damage',
        },
        reads,
        writes: [],
        opaqueReason: null,
        recipient: null,
        actor: 'attacker',
        cells: 0,
        hpGuard: true,
      });
    }
  }
  // Conservative possible rate liveness: removals/conditions stay visible as opaque operations.
  // This never proves application or numerical relevance, nor claims a removed instance is live.
  let possibleHpRate = false;
  for (const access of accesses) {
    if (access.ocAccess === 'useRate' && possibleHpRate) access.reads = [...access.reads, 'hp'];
    possibleHpRate ||= access.ocAccess === 'grantHpRate';
  }
  const mutations: ResourceProgramObservation['mutations'][number][] = [];
  for (const [index, access] of accesses.entries()) {
    for (const resource of access.writes) {
      const suffix = accesses.slice(index + 1);
      const actorCanIntersect =
        resource === 'criticalStars' ||
        access.actor === 'attacker' ||
        access.actor === 'unresolved';
      const firstPotentialReader = actorCanIntersect
        ? (suffix.find(
            ({ reads, position }) =>
              position.phase !== 'ordinaryDependency' && reads.includes(resource),
          )?.position ?? null)
        : null;
      // A declared ordinary reader is not ordered against preparation writes until U1-R/U2 closes
      // the replay/receipt boundary. Include earlier declarations too; do not invent a first clock.
      const deferredReader = actorCanIntersect
        ? (accesses.find(
            ({ reads, position }) =>
              position.phase === 'ordinaryDependency' && reads.includes(resource),
          )?.position ?? null)
        : null;
      const firstRequiredHpGuard =
        resource === 'hp' && actorCanIntersect
          ? (suffix.find(({ hpGuard }) => hpGuard)?.position ?? null)
          : null;
      const firstOpaqueOperation =
        suffix.find(({ opaqueReason }) => opaqueReason !== null)?.position ?? null;
      mutations.push({
        writer: access.position,
        resource,
        recipient: access.recipient,
        actor: access.actor,
        cells: access.cells,
        firstPotentialReader,
        firstRequiredHpGuard,
        deferredReader,
        firstOpaqueOperation,
      });
    }
  }
  return {
    kind: 'declaredResourceProgram',
    programKey: program.key,
    valueCellScope: 'allCanonicalCells',
    readCoverage: 'partialCurrentContracts',
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
