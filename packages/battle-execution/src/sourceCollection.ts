import {
  getPrimaryNoblePhantasm,
  type MasterDataSnapshot,
  type MasterEffect,
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
  valueSetIndex: number;
  valueIndex: number;
  limitBreak: boolean;
  enabledByDefault: boolean;
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
        valueSetIndex: 0,
        valueIndex: skillLevel - 1,
        limitBreak: false,
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
          valueSetIndex: 0,
          valueIndex: 0,
          limitBreak: scenario.craftEssence.limitBreak === 4,
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
            valueSetIndex: 0,
            valueIndex: selected.skillLevel - 1,
            limitBreak: false,
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
        valueSetIndex: input.overcharge - 1,
        valueIndex: input.npLevel - 1,
        limitBreak: false,
        enabledByDefault: true,
      });
  return { sources, issues };
}
