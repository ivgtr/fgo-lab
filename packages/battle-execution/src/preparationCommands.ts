import { npProgramEffects } from './npProgramScope';
import { getSkillsForActorForm, type MasterEffect, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { PreNoblePhantasmState, PreparationFailureCode } from './preparationContracts';

export function selectPreparationEffects(
  effects: readonly MasterEffect[],
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
): readonly MasterEffect[] | PreparationFailureCode {
  effects = npProgramEffects(effects);
  const choices = [
    ...new Map(
      effects.flatMap((effect) =>
        effect.selection?.kind === 'playerChoice'
          ? [
              [
                `${effect.selection.group.key}:${effect.selection.group.candidate}`,
                effect.selection.group,
              ],
            ]
          : [],
      ),
    ).values(),
  ];
  if (choices.length === 0)
    return command.choice === null
      ? effects.filter(({ selection }) => selection?.kind !== 'playerChoice')
      : 'choiceUnavailable';
  if (command.choice === null) return 'choiceRequired';
  const matched = choices.some(
    (choice) =>
      choice.key === command.choice?.groupKey && choice.candidate === command.choice.candidateKey,
  );
  if (!matched) return 'choiceUnavailable';
  return effects.filter(
    ({ selection }) =>
      selection?.kind !== 'playerChoice' ||
      (selection.group.key === command.choice?.groupKey &&
        selection.group.candidate === command.choice.candidateKey),
  );
}

export function availablePreparationSkillCommands(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
): readonly Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] {
  const commands: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] = [];
  for (const skill of getSkillsForActorForm(servant, state.currentFormId)) {
    if (state.usedSkillSlots.has(skill.slot)) continue;
    const choices = [
      ...new Map(
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.selection?.kind === 'playerChoice'
            ? [
                [
                  `${effect.selection.group.key}:${effect.selection.group.candidate}`,
                  effect.selection.group,
                ],
              ]
            : [],
        ),
      ).values(),
    ];
    const slot = skill.slot;
    if (choices.length === 0) {
      commands.push({ kind: 'useSkillSlot', slot, skillLevel: 10, choice: null });
      continue;
    }
    commands.push(
      ...choices.map((choice) => ({
        kind: 'useSkillSlot' as const,
        slot,
        skillLevel: 10,
        choice: { groupKey: choice.key, candidateKey: choice.candidate },
      })),
    );
  }
  return commands;
}
