import {
  getPrimaryNoblePhantasm,
  type MasterDataSnapshot,
  type MasterEffect,
  type ModifierValueExpression,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type { ExecutionIssue, ExecutionPhase } from './contracts';
import type { Origin } from './effectRouting';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface SourceEffect {
  phase: ExecutionPhase;
  origin: Origin;
  sourceInstanceId: string;
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  rawValue: number | undefined;
  valueExpression: ModifierValueExpression | null;
  enabledByDefault: boolean;
}

function parameter(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  limitBreak = false,
): number | undefined {
  const sets =
    limitBreak && effect.limitBreakParameterSets
      ? effect.limitBreakParameterSets
      : effect.parameterSets;
  const value = sets[setIndex]?.[valueIndex]?.['Value'];
  return typeof value === 'number' ? value : undefined;
}

function modifierValueExpression(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  limitBreak = false,
): ModifierValueExpression | null {
  const sets =
    limitBreak && effect.limitBreakModifierValueExpressionSets
      ? effect.limitBreakModifierValueExpressionSets
      : effect.modifierValueExpressionSets;
  return sets[setIndex]?.[valueIndex] ?? null;
}

export function collectOperationSources(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
): { sources: SourceEffect[]; issues: ExecutionIssue[] } {
  const sources: SourceEffect[] = [];
  const issues: ExecutionIssue[] = [];
  const attacker = master.servants.find((servant) => servant.id === input.attackerId);
  if (!attacker)
    return {
      sources,
      issues: [
        {
          kind: 'unsupportedOperation',
          operationId: 'attacker',
          detail: 'attacker_source_missing',
        },
      ],
    };
  const appendSkill = (
    origin: Origin,
    phase: ExecutionPhase,
    sourceInstanceId: string,
    sourceId: string,
    skillId: string,
    skillLevel: number,
    enabledByDefault: boolean,
  ) => {
    const servant = master.servants.find((candidate) => candidate.id === sourceId);
    const skill = [...(servant?.skills ?? []), ...(servant?.passives ?? [])].find(
      (candidate) => candidate.id === skillId,
    );
    if (!servant || !skill) {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `${origin}:${sourceId}:${skillId}`,
        detail: 'source_missing',
      });
      return;
    }
    for (const effect of skill.effects)
      sources.push({
        phase,
        origin,
        sourceInstanceId,
        sourceId,
        sourceName: servant.name,
        skillId,
        skillName: skill.name,
        effect,
        rawValue: parameter(effect, 0, skillLevel - 1),
        valueExpression: modifierValueExpression(effect, 0, skillLevel - 1),
        enabledByDefault,
      });
  };
  for (const passive of attacker.passives)
    appendSkill('passive', 'passive', `passive:${attacker.id}`, attacker.id, passive.id, 1, true);
  for (const selected of scenario.attackerSkills)
    appendSkill(
      'attacker',
      'attackerSkill',
      `attacker:${attacker.id}`,
      attacker.id,
      selected.skillId,
      selected.skillLevel,
      false,
    );
  if (scenario.craftEssence) {
    const ce = master.craftEssences.find(
      (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
    );
    if (!ce)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `craftEssence:${scenario.craftEssence.craftEssenceId}`,
        detail: 'source_missing',
      });
    else
      for (const effect of ce.effects)
        sources.push({
          phase: 'craftEssence',
          origin: 'craftEssence',
          sourceInstanceId: `craftEssence:${ce.id}`,
          sourceId: ce.id,
          sourceName: ce.name,
          skillId: `ce:${ce.id}`,
          skillName: ce.name,
          effect,
          rawValue: parameter(effect, 0, 0, scenario.craftEssence.limitBreak === 4),
          valueExpression: modifierValueExpression(
            effect,
            0,
            0,
            scenario.craftEssence.limitBreak === 4,
          ),
          enabledByDefault: true,
        });
  }
  if (scenario.support)
    for (const source of scenario.support.composition.sources)
      for (const skill of source.skills)
        appendSkill(
          'support',
          'support',
          source.sourceInstanceId,
          source.servantId,
          skill.skillId,
          skill.skillLevel,
          false,
        );
  if (scenario.mysticCode) {
    const code = master.mysticCodes.find(
      (candidate) => candidate.id === scenario.mysticCode?.mysticCodeId,
    );
    if (!code)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `mysticCode:${scenario.mysticCode.mysticCodeId}`,
        detail: 'source_missing',
      });
    else
      for (const selected of scenario.mysticCode.skills) {
        const skill = code.skills.find((candidate) => candidate.id === selected.skillId);
        if (!skill) {
          issues.push({
            kind: 'unsupportedOperation',
            operationId: `mysticCode:${code.id}:${selected.skillId}`,
            detail: 'source_missing',
          });
          continue;
        }
        for (const effect of skill.effects)
          sources.push({
            phase: 'mysticCode',
            origin: 'mysticCode',
            sourceInstanceId: `mysticCode:${code.id}`,
            sourceId: code.id,
            sourceName: code.name,
            skillId: skill.id,
            skillName: skill.name,
            effect,
            rawValue: parameter(effect, 0, selected.skillLevel - 1),
            valueExpression: modifierValueExpression(effect, 0, selected.skillLevel - 1),
            enabledByDefault: false,
          });
      }
  }
  const np = getPrimaryNoblePhantasm(attacker);
  if (np)
    for (const effect of np.effects.filter((candidate) => candidate.timing === 'beforeDamage'))
      sources.push({
        phase: 'beforeNpDamage',
        origin: 'np',
        sourceInstanceId: `np:${attacker.id}`,
        sourceId: attacker.id,
        sourceName: attacker.name,
        skillId: `np:${attacker.id}`,
        skillName: '宝具前効果',
        effect,
        rawValue: parameter(effect, input.overcharge - 1, input.npLevel - 1),
        valueExpression: modifierValueExpression(effect, input.overcharge - 1, input.npLevel - 1),
        enabledByDefault: true,
      });
  return { sources, issues };
}
