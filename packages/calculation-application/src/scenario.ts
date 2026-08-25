import {
  resolveScenarioEffects,
  type EffectResolution,
  type ResolvedEffect,
} from '@fgo-lab/effect-resolver';
import { getPrimaryNpDamage, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type {
  CalculationEditorState,
  CalculationResult,
  DamageResolutionInput,
  VersionContext,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './damageResolution';
import { evaluateCalculationEvidence } from './evidence';
import { applyNpDamageHandler } from './npDamageHandler';

export interface ResolvedCalculationInput {
  input: DamageResolutionInput;
  precision: EffectResolution['precision'];
  evidenceKeys: string[];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: ResolvedEffect[];
}

function traitCounts(traits: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const trait of traits) counts[trait] = (counts[trait] ?? 0) + 1;
  return counts;
}

export function applyScenarioNpDamageFunction(
  input: DamageResolutionInput,
  damage: Parameters<typeof applyNpDamageHandler>[1],
  attackerTraits: readonly string[],
): DamageResolutionInput {
  return applyNpDamageHandler(input, damage, {
    overcharge: input.overcharge,
    attackerTraitCounts: traitCounts([...attackerTraits, ...input.attackerStateTraits]),
    targetTraitCounts: traitCounts(input.target.traits),
    targetCombinedTraitCounts: traitCounts([...input.target.traits, ...input.targetStateTraits]),
    targetStateTraitCounts: traitCounts(input.targetStateTraits),
    attackerHpPermille: input.attackerHpPermille,
    targetRarity: input.targetRarity,
    battlePointPhase: input.battlePointPhase,
  });
}

export function resolveCalculationInput(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
): ResolvedCalculationInput {
  if (selection.effectMode === 'manual')
    return {
      input: baseInput,
      precision: 'exact',
      evidenceKeys: ['input:manual-final-modifiers'],
      warnings: [],
      trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
      effects: [],
    };
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const damage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  const damageInput =
    attacker && damage
      ? applyScenarioNpDamageFunction(baseInput, damage, attacker.traits)
      : baseInput;
  const resolved = resolveScenarioEffects(damageInput, selection, master);
  const effectEvidenceKeys = resolved.effects.flatMap((effect) => {
    if (effect.state !== 'applied') return [];
    if (effect.reason === 'np_damage_buff_rate') return ['effect-operation:npDamageBuffRate'];
    return effect.kind ? [`effect-operation:${effect.kind}`] : [];
  });
  return {
    input: resolved.input,
    precision: resolved.precision,
    evidenceKeys: ['master:normalized-v6', ...effectEvidenceKeys],
    warnings: resolved.warnings,
    effects: resolved.effects,
    trace: resolved.trace,
  };
}

export function calculateResolvedDamage(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
  versions: VersionContext,
) {
  const resolved = resolveCalculationInput(baseInput, selection, master);
  const calculation = calculateDamageResolution(resolved.input, versions);
  const evidence = evaluateCalculationEvidence([
    ...calculation.evidence.map((entry) => entry.key),
    ...resolved.evidenceKeys,
  ]);
  const effects = resolved.effects.map((effect) => ({
    effectKey: effect.effectKey,
    state: effect.state,
    reasonCode: effect.reason,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  let result: CalculationResult;
  if (
    calculation.status === 'unsupported' ||
    resolved.precision === 'unsupported' ||
    evidence.status === 'unsupported'
  )
    result = {
      status: 'unsupported',
      rows: [],
      effects,
      assumptions: calculation.assumptions,
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
      missingEvidence: [
        ...(calculation.status === 'unsupported' ? calculation.missingEvidence : []),
        ...resolved.warnings,
        ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
      ],
      versions,
      evidence: evidence.evidence,
    };
  else
    result = {
      ...calculation,
      effects,
      precision: evidence.precision,
      evidence: evidence.evidence,
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
    };
  return {
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
  };
}
