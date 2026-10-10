import { rankingStaticSourceProjection } from './rankingProgramSources';
import { stackDomainWitnesses, UnsupportedStackQuantity } from './rankingStackDomain';
import {
  mergeInputDefinitions,
  populationLocalActors,
  stackOwnedWitnessCondition,
} from '@fgo-lab/battle-execution';
import {
  compileEffectCached,
  effectReadsOc,
  compileOcSourceProgram,
  hasOcConditionReader,
  effectChangesPreparation,
  noblePhantasmDamageDependency,
  planOperationActivations,
  runtimeInputDefinitionsForSource,
  type BattleOperation,
  type ConditionExpression,
  type EffectProjection,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import {
  findNoblePhantasmVariant,
  type CanonicalInputDefinition,
  type ServantMaster,
} from '@fgo-lab/master-data';

import type { StaticRankingPreparationProgram } from './rankingStaticPreparation';

export interface StaticRankingSemantics {
  sources: readonly SourceEffect[];
  operations: readonly BattleOperation[];
  unsupported: readonly EffectProjection[];
  conditions: readonly ConditionExpression[];
  inputDefinitions: readonly CanonicalInputDefinition[];
  stackWitnesses: ReadonlyMap<string, readonly number[]>;
}

function populationReadConditions(
  sources: readonly SourceEffect[],
): readonly ConditionExpression[] {
  const reads = new Map<string, ConditionExpression>();
  for (const source of sources)
    for (const operation of source.effect.execution) {
      if (
        operation.kind !== 'resourceMutation' ||
        operation.amount.kind !== 'populationCount' ||
        operation.amount.selector.basis !== 'actorTraits'
      )
        continue;
      for (const scope of populationLocalActors(operation.amount.selector.scope))
        for (const trait of operation.amount.selector.traits)
          reads.set(`${scope}:${trait}`, { kind: 'trait', scope, trait, present: true });
    }
  return [...reads.values()];
}

export function compileStaticRankingSemantics(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  npLevel: number,
): StaticRankingSemantics {
  const sources = rankingStaticSourceProjection(servant, program, npLevel);
  const operations: BattleOperation[] = [];
  const unsupported: EffectProjection[] = [];
  let uncertainOcCell = false;
  for (const source of sources) {
    const rows =
      source.origin === 'np' && effectReadsOc(source.effect)
        ? [0, 1, 2, 3, 4]
        : [source.valueSetIndex];
    const variants = rows.map((valueSetIndex) =>
      compileEffectCached(
        { ...source, valueSetIndex },
        operations.length,
        servant.actorFormGraph.forms,
      ),
    );
    operations.push(
      ...(variants.length === 1
        ? variants[0]!.operations
        : new Map(
            variants
              .flatMap((compiled) => compiled.operations)
              .map((operation) => [JSON.stringify(operation), operation]),
          ).values()),
    );
    unsupported.push(
      ...variants[0]!.projections.filter(
        ({ executionSupport }) => executionSupport === 'unsupported',
      ),
    );
    // A missing alternate cell is rejected if selected at runtime; it cannot justify reduction.
    uncertainOcCell ||= variants
      .slice(1)
      .some((compiled) =>
        compiled.projections.some(({ executionSupport }) => executionSupport === 'unsupported'),
      );
  }
  const attackVariant = findNoblePhantasmVariant(
    servant,
    program.attackProfile.noblePhantasmVariant,
  );
  const damageConditions =
    attackVariant?.kind === 'attack'
      ? attackVariant.damage.flatMap((damage) =>
          Array.from({ length: damage.parametersByOvercharge.length }, (_, index) =>
            noblePhantasmDamageDependency(damage, index + 1, npLevel),
          ),
        )
      : [];
  const plannedOperations = planOperationActivations(operations);
  const preparationSources = sources.filter(
    ({ effect }) => effectChangesPreparation(effect) || hasOcConditionReader(effect),
  );
  const liveDefinitions = [
    ...(attackVariant?.kind === 'attack'
      ? attackVariant.damage.flatMap((damage) => {
          if (damage.kind !== 'traitCount') return [];
          if (damage.quantity.kind === 'unsupported')
            throw new UnsupportedStackQuantity(
              `unsupported_stack_quantity:${damage.quantity.reason}`,
            );
          return damage.quantity.kind === 'stacks' ? damage.quantity.inputs : [];
        })
      : []),
    ...plannedOperations.flatMap((operation) => operation.inputDefinitions),
    ...preparationSources.flatMap(runtimeInputDefinitionsForSource),
  ];
  const definitions = mergeInputDefinitions(liveDefinitions);
  return {
    sources,
    operations: plannedOperations,
    unsupported,
    conditions: [
      ...plannedOperations.flatMap((operation) =>
        operation.kind === 'preserveSemanticEffect' ? [] : [operation.condition],
      ),
      ...damageConditions,
      ...preparationSources.map((source) => compileOcSourceProgram(source).condition),
      ...populationReadConditions(sources),
    ].map((condition) => stackOwnedWitnessCondition(condition, definitions)),
    stackWitnesses: uncertainOcCell
      ? new Map()
      : new Map(
          [
            ...stackDomainWitnesses(
              attackVariant?.kind === 'attack' ? attackVariant.damage : [],
              plannedOperations,
            ),
          ].filter(
            ([key]) =>
              !preparationSources.some((source) =>
                runtimeInputDefinitionsForSource(source).some(
                  (definition) => definition.key === key,
                ),
              ),
          ),
        ),
    inputDefinitions: definitions.sort((left, right) => left.key.localeCompare(right.key)),
  };
}
