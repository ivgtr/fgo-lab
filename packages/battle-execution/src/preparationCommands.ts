import { npProgramEffects } from './npProgramScope';
import {
  getSkillsForActorForm,
  playerChoiceForEffect,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { ResolvedRankingBasis, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { PreNoblePhantasmState, PreparationFailureCode } from './preparationContracts';

export function selectPreparationEffects(
  effects: readonly MasterEffect[],
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
): readonly MasterEffect[] | PreparationFailureCode {
  effects = npProgramEffects(effects);
  const choices = choiceGroups(effects);
  if (choices.length === 0)
    return command.choice === null
      ? effects.filter((effect) => playerChoiceForEffect(effect) === null)
      : 'choiceUnavailable';
  if (command.choice === null) return 'choiceRequired';
  const matched = choices.some(
    (choice) =>
      choice.key === command.choice?.groupKey && choice.candidate === command.choice.candidateKey,
  );
  if (!matched) return 'choiceUnavailable';
  return effects.filter((effect) => {
    const choice = playerChoiceForEffect(effect);
    return (
      choice === null ||
      (choice.key === command.choice?.groupKey && choice.candidate === command.choice.candidateKey)
    );
  });
}

function choiceGroups(effects: readonly MasterEffect[]): { key: string; candidate: string }[] {
  return [
    ...new Map(
      effects.flatMap((effect) => {
        const choice = playerChoiceForEffect(effect);
        return choice ? [[`${choice.key}:${choice.candidate}`, choice] as const] : [];
      }),
    ).values(),
  ];
}

export function availablePreparationSkillCommands(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  skillLevels: ResolvedRankingBasis['skillLevels'],
): readonly Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] {
  const commands: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] = [];
  for (const skill of getSkillsForActorForm(servant, state.currentFormId)) {
    if (state.usedSkillSlots.has(skill.slot)) continue;
    const choices = choiceGroups(npProgramEffects(skill.effects));
    const slot = skill.slot;
    const skillLevel = skillLevels[String(slot) as '1' | '2' | '3'];
    if (skillLevel === undefined) throw new TypeError('preparation_skill_level_missing');
    if (choices.length === 0) {
      commands.push({ kind: 'useSkillSlot', slot, skillLevel, choice: null });
      continue;
    }
    commands.push(
      ...choices.map((choice) => ({
        kind: 'useSkillSlot' as const,
        slot,
        skillLevel,
        choice: { groupKey: choice.key, candidateKey: choice.candidate },
      })),
    );
  }
  return commands;
}
