import { getSkillsForActorForm, type MasterEffect, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { PreNoblePhantasmState, PreparationFailureCode } from './preparationContracts';

export function selectPreparationEffects(
  effects: readonly MasterEffect[],
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
): readonly MasterEffect[] | PreparationFailureCode {
  const choices = [
    ...new Map(
      effects.flatMap((effect) =>
        effect.choice
          ? [[`${effect.choice.family}:${String(effect.choice.candidate)}`, effect.choice]]
          : [],
      ),
    ).values(),
  ];
  if (choices.length === 0)
    return command.choice === null
      ? effects.filter(({ choice }) => choice === null)
      : 'choiceUnavailable';
  if (command.choice === null) return 'choiceRequired';
  const matched = choices.some(
    (choice) =>
      choice.family === command.choice?.family &&
      String(choice.candidate) === command.choice.candidate,
  );
  if (!matched) return 'choiceUnavailable';
  return effects.filter(
    ({ choice }) =>
      choice === null ||
      (choice.family === command.choice?.family &&
        String(choice.candidate) === command.choice.candidate),
  );
}

export function availablePreparationSkillCommands(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
): readonly Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] {
  const commands: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] = [];
  for (const skill of getSkillsForActorForm(servant, state.currentFormId)) {
    if (![1, 2, 3].includes(skill.slot) || state.usedSkillSlots.has(skill.slot as 1 | 2 | 3))
      continue;
    const choices = [
      ...new Map(
        skill.effects.flatMap((effect) =>
          effect.choice
            ? [[`${effect.choice.family}:${String(effect.choice.candidate)}`, effect.choice]]
            : [],
        ),
      ).values(),
    ];
    const slot = skill.slot as 1 | 2 | 3;
    if (choices.length === 0) {
      commands.push({ kind: 'useSkillSlot', slot, skillLevel: 10, choice: null });
      continue;
    }
    commands.push(
      ...choices.map((choice) => ({
        kind: 'useSkillSlot' as const,
        slot,
        skillLevel: 10,
        choice: { family: choice.family, candidate: String(choice.candidate) },
      })),
    );
  }
  return commands;
}
