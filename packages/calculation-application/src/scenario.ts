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
import { applyNpDamageHandler } from './npDamageHandler';

export interface ResolvedCalculationInput {
  input: DamageResolutionInput;
  precision: EffectResolution['precision'];
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
    attackerTraitCounts: traitCounts(attackerTraits),
    targetTraitCounts: traitCounts(input.target.traits),
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
  return {
    input: resolved.input,
    precision: resolved.precision,
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
  options: { releaseValidated: boolean },
) {
  const resolved = resolveCalculationInput(baseInput, selection, master);
  const calculation = calculateDamageResolution(resolved.input, versions);
  const effects = resolved.effects.map((effect) => ({
    effectKey: effect.effectKey,
    state: effect.calculationSupported
      ? effect.applied
        ? ('applied' as const)
        : ('rejected' as const)
      : ('unsupported' as const),
    reasonCode: effect.reason,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  let result: CalculationResult;
  if (calculation.status === 'unsupported' || resolved.precision === 'unsupported')
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
      ],
      versions,
    };
  else
    result = {
      ...calculation,
      effects,
      precision:
        resolved.precision === 'approximate' || calculation.precision === 'approximate'
          ? 'approximate'
          : 'exact',
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
    };
  if (!options.releaseValidated && result.status === 'calculated')
    result = {
      ...result,
      precision: 'approximate',
      issues: [
        ...result.issues,
        {
          code: 'diagnostic_fixture_not_release_validated',
          detail: 'diagnostic_fixture_not_release_validated',
        },
      ],
    };
  return {
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
  };
}
