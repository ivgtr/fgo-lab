import {
  compileEffectCached,
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
  findActorForm,
  findNoblePhantasmVariant,
  getPassivesForActorForm,
  noblePhantasmVariantKey,
  type CanonicalInputDefinition,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { RankingPolicyConditions } from './rankingContracts';
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
  conditions: RankingPolicyConditions,
): readonly SourceEffect[] {
  const terminalPassives = getPassivesForActorForm(servant, program.expectedTerminalFormId).flatMap(
    (passive) =>
      sourceEffects({
        servant,
        actorFormId: program.expectedTerminalFormId,
        phase: 'passive',
        origin: 'passive',
        sourceInstanceId: `passive:${servant.id}`,
        skillId: passive.id,
        skillName: passive.name,
        effects: passive.effects,
        valueIndex: 0,
        valueSetIndex: 0,
        noblePhantasmVariant: null,
        preparationStochasticOutcome: null,
      }),
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
      valueIndex: conditions.npLevel - 1,
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
    return [...terminalPassives, ...preparationSources];
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
    valueIndex: conditions.npLevel - 1,
    valueSetIndex: 0,
    noblePhantasmVariant: attackVariant.ref,
    preparationStochasticOutcome: null,
  });
  return [...terminalPassives, ...preparationSources, ...attackSources];
}

export function compileStaticRankingSemantics(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  conditions: RankingPolicyConditions,
): StaticRankingSemantics {
  const sources = sourcesForProgram(servant, program, conditions);
  const operations: BattleOperation[] = [];
  const unsupported: EffectProjection[] = [];
  for (const source of sources) {
    const compiled = compileEffectCached(source, operations.length, servant.actorFormGraph.forms);
    operations.push(...compiled.operations);
    unsupported.push(
      ...compiled.projections.filter(({ executionSupport }) => executionSupport === 'unsupported'),
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
            noblePhantasmDamageDependency(damage, index + 1, conditions.npLevel),
          ),
        )
      : [];
  const plannedOperations = planOperationActivations(operations);
  const definitions = new Map<string, CanonicalInputDefinition>();
  const liveDefinitions = [
    ...plannedOperations.flatMap((operation) => operation.inputDefinitions),
    ...sources
      .filter(({ effect }) => effectChangesPreparation(effect))
      .flatMap(runtimeInputDefinitionsForSource),
  ];
  for (const definition of liveDefinitions) {
    const existing = definitions.get(definition.key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition))
      throw new TypeError(`ranking_canonical_input_definition_conflict:${definition.key}`);
    definitions.set(definition.key, definition);
  }
  return {
    sources,
    operations: plannedOperations,
    unsupported,
    conditions: [
      ...plannedOperations.flatMap((operation) =>
        operation.kind === 'preserveSemanticEffect' ? [] : [operation.condition],
      ),
      ...damageConditions,
    ],
    inputDefinitions: [...definitions.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
  };
}
