import { stackDomainWitnesses, UnsupportedStackQuantity } from './rankingStackDomain';
import { mergeInputDefinitions, stackOwnedWitnessCondition } from '@fgo-lab/battle-execution';
import {
  compileEffectCached,
  effectReadsOc,
  compileOcSourceProgram,
  hasOcExecution,
  hasOcConditionReader,
  effectChangesPreparation,
  hasUnsupportedPreparationStackRequirement,
  noblePhantasmDamageDependency,
  planOperationActivations,
  runtimeInputDefinitionsForSource,
  type BattleOperation,
  type ConditionExpression,
  type EffectProjection,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  findActorForm,
  findNoblePhantasmVariant,
  getPassivesForActorForm,
  noblePhantasmVariantKey,
  type CanonicalInputDefinition,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';

import type {
  RankingPreparationSourceUse,
  StaticRankingPreparationProgram,
} from './rankingStaticPreparation';

export interface StaticRankingSemantics {
  sources: readonly SourceEffect[];
  operations: readonly BattleOperation[];
  unsupported: readonly EffectProjection[];
  conditions: readonly ConditionExpression[];
  inputDefinitions: readonly CanonicalInputDefinition[];
  stackWitnesses: ReadonlyMap<string, readonly number[]>;
}

function sourceEffects(input: {
  servant: ServantMaster;
  actorFormId: RankingPreparationSourceUse['actorFormId'];
  phase: SourceEffect['phase'];
  origin: SourceEffect['origin'];
  sourceInstanceId: string;
  skillId: string;
  skillName: string;
  effects: readonly MasterEffect[];
  valueIndex: number;
  valueSetIndex: number;
  noblePhantasmVariant: SourceEffect['noblePhantasmVariant'];
  preparationStochasticOutcome: SourceEffect['preparationStochasticOutcome'];
}): SourceEffect[] {
  const form = findActorForm(input.servant, input.actorFormId);
  return input.effects.map((effect) => ({
    phase: input.phase,
    compilationPurpose: 'dependency',
    origin: input.origin,
    sourceInstanceId: input.sourceInstanceId,
    sourceId: input.servant.id,
    sourceName: input.servant.name,
    sourceTraits: form?.traits ?? input.servant.traits,
    skillId: input.skillId,
    skillName: input.skillName,
    effect,
    valueSetIndex: input.valueSetIndex,
    valueIndex: input.valueIndex,
    limitBreak: false,
    sourceEnabled: true,
    enabledByDefault:
      input.origin === 'passive' ? effect.inclusionPolicy.default === 'include' : true,
    noblePhantasmVariant: input.noblePhantasmVariant,
    preparationStochasticOutcome: input.preparationStochasticOutcome,
  }));
}

function sourcesForProgram(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  npLevel: number,
): readonly SourceEffect[] {
  const forms = [
    ...new Map(
      [
        program.initialFormId,
        ...program.sourceUses.map((source) => source.actorFormId),
        program.expectedTerminalFormId,
      ].map((form) => [actorFormKey(form), form]),
    ).values(),
  ];
  const automaticSources = forms.flatMap((form) =>
    getPassivesForActorForm(servant, form).flatMap((passive) =>
      sourceEffects({
        servant,
        actorFormId: form,
        phase: 'passive',
        origin: 'passive',
        sourceInstanceId: `passive:${servant.id}`,
        skillId: passive.id,
        skillName: passive.name,
        // Earlier form damage passives expire, but their preparation dependencies remain live.
        effects:
          actorFormKey(form) === actorFormKey(program.expectedTerminalFormId)
            ? passive.effects
            : passive.effects.filter(
                (effect) => hasOcExecution(effect) || effectChangesPreparation(effect),
              ),
        valueIndex: 0,
        valueSetIndex: 0,
        noblePhantasmVariant: null,
        preparationStochasticOutcome: null,
      }).map((source) => ({ ...source, constantFormKey: actorFormKey(form) })),
    ),
  );
  const preparationSources = program.sourceUses.flatMap((sourceUse) => {
    if (sourceUse.kind === 'skill')
      return sourceEffects({
        servant,
        actorFormId: sourceUse.actorFormId,
        phase: 'attackerSkill',
        origin: 'attacker',
        sourceInstanceId: `attacker:${servant.id}`,
        skillId: sourceUse.skill.id,
        skillName: sourceUse.skill.name,
        effects: sourceUse.effects,
        valueIndex: sourceUse.skillLevel - 1,
        valueSetIndex: 0,
        noblePhantasmVariant: null,
        preparationStochasticOutcome: null,
      });
    const variant = findNoblePhantasmVariant(servant, sourceUse.noblePhantasmVariant);
    if (!variant) return [];
    const key = noblePhantasmVariantKey(variant.ref);
    return sourceEffects({
      servant,
      actorFormId: sourceUse.actorFormId,
      phase: 'preparationNoblePhantasm',
      origin: 'np',
      sourceInstanceId: `np:${key}`,
      skillId: `np:${key}`,
      skillName: variant.name,
      effects: sourceUse.effects,
      valueIndex: npLevel - 1,
      valueSetIndex: 0,
      noblePhantasmVariant: variant.ref,
      preparationStochasticOutcome: null,
    });
  });
  const attackVariant = findNoblePhantasmVariant(
    servant,
    program.attackProfile.noblePhantasmVariant,
  );
  if (!attackVariant || attackVariant.kind !== 'attack')
    return [...automaticSources, ...preparationSources];
  const key = noblePhantasmVariantKey(attackVariant.ref);
  const attackSources = sourceEffects({
    servant,
    actorFormId: attackVariant.ref.actorFormId,
    phase: 'beforeNpDamage',
    origin: 'np',
    sourceInstanceId: `np:${key}`,
    skillId: `np:${key}`,
    skillName: attackVariant.name,
    effects: attackVariant.effects.filter(({ timing }) => timing === 'beforeDamage'),
    valueIndex: npLevel - 1,
    valueSetIndex: 0,
    noblePhantasmVariant: attackVariant.ref,
    preparationStochasticOutcome: null,
  });
  return [...automaticSources, ...preparationSources, ...attackSources];
}

export function compileStaticRankingSemantics(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  npLevel: number,
): StaticRankingSemantics {
  const sources = sourcesForProgram(servant, program, npLevel);
  const operations: BattleOperation[] = [];
  const unsupported: EffectProjection[] = [];
  let uncertainOcCell = false;
  for (const source of sources) {
    if (hasUnsupportedPreparationStackRequirement(source.effect))
      throw new UnsupportedStackQuantity('unsupportedPreparationStackQuantity');
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
    ...sources
      .filter(({ effect }) => effectChangesPreparation(effect) || hasOcConditionReader(effect))
      .flatMap(runtimeInputDefinitionsForSource),
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
      ...sources
        .filter(({ effect }) => hasOcConditionReader(effect))
        .map((source) => compileOcSourceProgram(source).condition),
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
              !sources.some(
                (source) =>
                  hasOcConditionReader(source.effect) &&
                  runtimeInputDefinitionsForSource(source).some(
                    (definition) => definition.key === key,
                  ),
              ),
          ),
        ),
    inputDefinitions: definitions.sort((left, right) => left.key.localeCompare(right.key)),
  };
}
