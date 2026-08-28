import { actorFormEquals, getSkillsForActorForm, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import { selectPreparationEffects } from './preparationCommands';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationTransitionResult,
} from './preparationContracts';
import { assemblePreparationActivationFacts } from './preparationEvidence';
import {
  appendPreparationEffects,
  findPreparationTransition,
  resolvePreparationStructuralOutcome,
} from './preparationState';

export function reducePreparationSkillAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
): PreparationTransitionResult {
  if (state.usedSkillSlots.has(command.slot)) return rejectPreparation(state, 'skillSlotReused');
  const skills = getSkillsForActorForm(servant, state.currentFormId).filter(
    ({ slot }) => slot === command.slot,
  );
  if (skills.length !== 1) return rejectPreparation(state, 'skillSlotUnavailable');
  const skill = skills[0]!;
  const effects = selectPreparationEffects(skill.effects, command);
  if (typeof effects === 'string') return rejectPreparation(state, effects);
  const transition = findPreparationTransition(servant, state, 'skill', skill.id, effects);
  if (typeof transition === 'string') return rejectPreparation(state, transition);
  const structural = resolvePreparationStructuralOutcome(servant, state, effects);
  if (typeof structural === 'string') return rejectPreparation(state, structural);
  if (transition && !actorFormEquals(transition.to, structural.currentFormId))
    return rejectPreparation(state, 'transitionAtomicity');
  return {
    status: 'applied',
    state: {
      ...state,
      currentFormId: structural.currentFormId,
      selectedNoblePhantasmVariant: structural.selectedVariant,
      usedSkillSlots: new Set([...state.usedSkillSlots, command.slot]),
      activeEffects: appendPreparationEffects(
        state,
        'skill',
        skill.id,
        state.currentFormId,
        effects,
      ),
      activeStateTraits: structural.activeStateTraits,
      appliedActions: [
        ...state.appliedActions,
        {
          command,
          actorFormId: state.currentFormId,
          sourceKind: 'skill',
          sourceId: skill.id,
          selectedEffects: effects.map((effect) => ({
            sourceKind: 'skill',
            sourceId: skill.id,
            actorFormId: state.currentFormId,
            occurrenceId: effect.occurrenceId,
            effect,
          })),
          activationFacts: assemblePreparationActivationFacts(
            servant,
            'skill',
            skill.id,
            state.currentFormId,
            effects,
          ),
          transition,
        },
      ],
    },
  };
}
