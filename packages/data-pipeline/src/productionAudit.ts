import {
  canonicalNoblePhantasmVariantSemanticsKey,
  getNoblePhantasmVariants,
  noblePhantasmVariantKey,
  type MasterDataSnapshot,
  type MasterEffect,
} from '@fgo-lab/master-data';
import {
  canonicalAuditDigest,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { sha256 } from './artifact';

export interface DataPipelineAuditCounters {
  candidateCount: number;
  damageRequestCount: number;
}

export interface DataPipelineProductionAudit {
  boundary: 'data-pipeline';
  masterDataVersion: string;
  records: readonly CanonicalAuditRecord[];
  digest: string;
  inventory: {
    servants: number;
    craftEssences: number;
    mysticCodes: number;
    effects: number;
    operations: number;
    damageFunctions: number;
    noblePhantasmVariantIdentities: number;
    rawFunctionTypes: number;
    rawBuffTypes: number;
    rawParameterKeys: number;
    rawPlayerChoiceOccurrences: number;
    probabilisticOccurrences: number;
    playerChoiceSelections: number;
    stochasticOutcomeSelections: number;
    binaryOutcomeSelections: number;
    successCountOutcomeSelections: number;
  };
  failures: readonly {
    kind: 'normalizationExclusion';
    identity: string;
    reason: string;
  }[];
  counters: DataPipelineAuditCounters;
}

interface EffectOccurrence {
  identity: string;
  effect: MasterEffect;
}

function effectOccurrences(master: MasterDataSnapshot): EffectOccurrence[] {
  return [
    ...master.servants.flatMap((servant) => [
      ...servant.skills.flatMap((skill) =>
        skill.effects.map((effect) => ({
          identity: `servant:${servant.id}:skill:${skill.id}:${effect.occurrenceId}`,
          effect,
        })),
      ),
      ...servant.passives.flatMap((skill) =>
        skill.effects.map((effect) => ({
          identity: `servant:${servant.id}:passive:${skill.id}:${effect.occurrenceId}`,
          effect,
        })),
      ),
      ...getNoblePhantasmVariants(servant).flatMap((variant) =>
        variant.effects.map((effect) => ({
          identity: `servant:${servant.id}:np:${noblePhantasmVariantKey(variant.ref)}:${effect.occurrenceId}`,
          effect,
        })),
      ),
    ]),
    ...master.craftEssences.flatMap((craftEssence) =>
      craftEssence.effects.map((effect) => ({
        identity: `craftEssence:${craftEssence.id}:${effect.occurrenceId}`,
        effect,
      })),
    ),
    ...master.mysticCodes.flatMap((mysticCode) =>
      mysticCode.skills.flatMap((skill) =>
        skill.effects.map((effect) => ({
          identity: `mysticCode:${mysticCode.id}:skill:${skill.id}:${effect.occurrenceId}`,
          effect,
        })),
      ),
    ),
  ].sort((left, right) => left.identity.localeCompare(right.identity));
}

const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort();
const jsonValue = (value: unknown): CanonicalAuditRecord['value'] =>
  JSON.parse(JSON.stringify(value)) as CanonicalAuditRecord['value'];

export function compileDataPipelineProductionAudit(
  master: MasterDataSnapshot,
): DataPipelineProductionAudit {
  const occurrences = effectOccurrences(master);
  const variantRecords: CanonicalAuditRecord[] = master.servants.flatMap((servant) => {
    const variantsByCanonicalId = new Map<
      string,
      { kind: string; card: string | null; targetScope: string | null; formQualifiedRefs: string[] }
    >();
    for (const variant of getNoblePhantasmVariants(servant)) {
      if (variant.canonicalId !== sha256(canonicalNoblePhantasmVariantSemanticsKey(variant)))
        throw new TypeError(
          `noble_phantasm_variant_canonical_id_mismatch:${servant.id}:${noblePhantasmVariantKey(variant.ref)}`,
        );
      const current = variantsByCanonicalId.get(variant.canonicalId);
      variantsByCanonicalId.set(variant.canonicalId, {
        kind: variant.kind,
        card: variant.kind === 'attack' ? variant.card : null,
        targetScope: variant.kind === 'attack' ? variant.targetScope : null,
        formQualifiedRefs: [
          ...(current?.formQualifiedRefs ?? []),
          noblePhantasmVariantKey(variant.ref),
        ].sort(),
      });
    }
    return [...variantsByCanonicalId].map(([canonicalId, value]) => ({
      identity: `np-variant:${servant.id}:${canonicalId}`,
      value,
    }));
  });
  const effectRecords: CanonicalAuditRecord[] = occurrences.map(({ identity, effect }) => ({
    identity: `effect:${identity}`,
    value: {
      activation: effect.gameActivation,
      buffTypes: sortedUnique(effect.atlasEvidence.buffTypes),
      conditionKeys: sortedUnique(effect.atlasEvidence.buffConditionKeys),
      functionType: effect.atlasEvidence.functionType,
      inputKinds: effect.inputDefinitions.map(({ kind }) => kind).sort(),
      operationKinds: effect.execution.map(({ kind }) => kind),
      operations: jsonValue(effect.execution),
      parameterKeys: sortedUnique(
        effect.atlasEvidence.parameterSets.flatMap((set) =>
          set.flatMap((parameter) => Object.keys(parameter)),
        ),
      ),
      proc: effect.proc.kind,
      selection: jsonValue(effect.selection),
    },
  }));
  const damageRecords: CanonicalAuditRecord[] = master.servants.flatMap((servant) =>
    getNoblePhantasmVariants(servant).flatMap((variant) =>
      variant.kind === 'attack'
        ? variant.damage.map((damage, index) => ({
            identity: `damage:${servant.id}:${noblePhantasmVariantKey(variant.ref)}:${String(index)}`,
            value: {
              card: variant.card,
              kind: damage.kind,
              rawFunctionType: damage.rawFunctionType,
              targetScope: variant.targetScope,
            },
          }))
        : [],
    ),
  );
  const rawFunctionTypes = sortedUnique(
    occurrences.map(({ effect }) => effect.atlasEvidence.functionType),
  );
  const rawBuffTypes = sortedUnique(
    occurrences.flatMap(({ effect }) => effect.atlasEvidence.buffTypes),
  );
  const rawParameterKeys = sortedUnique(
    occurrences.flatMap(({ effect }) =>
      effect.atlasEvidence.parameterSets.flatMap((set) =>
        set.flatMap((parameter) => Object.keys(parameter)),
      ),
    ),
  );
  const rawPlayerChoiceOccurrences = occurrences.filter(({ effect }) =>
    effect.atlasEvidence.parameterSemantics.choice.some(
      (key) => key === 'ActSet' || key === 'ActSelectIndex',
    ),
  ).length;
  const probabilisticOccurrences = occurrences.filter(
    ({ effect }) => effect.proc.kind !== 'guaranteed',
  ).length;
  const playerChoiceSelections = occurrences.filter(
    ({ effect }) => effect.selection?.kind === 'playerChoice',
  ).length;
  const stochasticOutcomeSelections = occurrences.filter(
    ({ effect }) => effect.selection?.kind === 'stochasticOutcome',
  ).length;
  const binaryOutcomeSelections = occurrences.filter(
    ({ effect }) =>
      effect.selection?.kind === 'stochasticOutcome' && effect.selection.group.kind === 'binary',
  ).length;
  const successCountOutcomeSelections = occurrences.filter(
    ({ effect }) =>
      effect.selection?.kind === 'stochasticOutcome' &&
      effect.selection.group.kind === 'successCount',
  ).length;
  if (rawPlayerChoiceOccurrences !== playerChoiceSelections)
    throw new TypeError('production_audit_player_choice_classification_mismatch');
  if (
    probabilisticOccurrences !== stochasticOutcomeSelections ||
    stochasticOutcomeSelections !== binaryOutcomeSelections + successCountOutcomeSelections
  )
    throw new TypeError('production_audit_stochastic_outcome_classification_mismatch');
  const inventory = {
    servants: master.servants.length,
    craftEssences: master.craftEssences.length,
    mysticCodes: master.mysticCodes.length,
    effects: occurrences.length,
    operations: occurrences.reduce((count, { effect }) => count + effect.execution.length, 0),
    damageFunctions: damageRecords.length,
    noblePhantasmVariantIdentities: variantRecords.length,
    rawFunctionTypes: rawFunctionTypes.length,
    rawBuffTypes: rawBuffTypes.length,
    rawParameterKeys: rawParameterKeys.length,
    rawPlayerChoiceOccurrences,
    probabilisticOccurrences,
    playerChoiceSelections,
    stochasticOutcomeSelections,
    binaryOutcomeSelections,
    successCountOutcomeSelections,
  };
  const failures = master.normalization.attackFunctions.excluded.map((failure) => ({
    kind: 'normalizationExclusion' as const,
    identity: `attack-function:${failure.servantId}:${failure.noblePhantasmId}:${failure.functionId}`,
    reason: JSON.stringify(failure),
  }));
  const records: CanonicalAuditRecord[] = [
    { identity: 'inventory', value: inventory },
    {
      identity: 'raw-vocabulary',
      value: {
        buffTypes: rawBuffTypes,
        functionTypes: rawFunctionTypes,
        parameterKeys: rawParameterKeys,
      },
    },
    ...failures.map(({ identity, reason }) => ({
      identity: `normalization-exclusion:${identity}`,
      value: { reason },
    })),
    ...variantRecords,
    ...effectRecords,
    ...damageRecords,
  ];
  return {
    boundary: 'data-pipeline',
    masterDataVersion: master.version,
    records,
    digest: canonicalAuditDigest(records),
    inventory,
    failures,
    counters: {
      candidateCount: 0,
      damageRequestCount: 0,
    },
  };
}
