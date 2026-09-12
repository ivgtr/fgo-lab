import { actorFormEquals, getSkillsForActorForm, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import { selectPreparationEffects } from './preparationCommands';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationExecutionContext,
  type PreparationTransitionResult,
} from './preparationContracts';
import { assemblePreparationActivationFacts } from './preparationEvidence';
import {
  appendPreparationEffects,
  findPreparationTransition,
  resolvePreparationStructuralOutcome,
} from './preparationState';
import { planPreparationResourceTransaction } from './preparationTransaction';

export function reducePreparationSkillAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  if (state.usedSkillSlots.has(command.slot)) return rejectPreparation(state, 'skillSlotReused');
  const skills = getSkillsForActorForm(servant, state.currentFormId).filter(
    ({ slot }) => slot === command.slot,
  );
  if (skills.length !== 1) return rejectPreparation(state, 'skillSlotUnavailable');
  const skill = skills[0]!;
  const effects = selectPreparationEffects(skill.effects, command);
  if (typeof effects === 'string') return rejectPreparation(state, effects);
  const resource = planPreparationResourceTransaction({
    context,
    servant,
    state,
    command,
    skill,
    effects,
    valueSetIndex: 0,
    valueIndex: command.skillLevel - 1,
    consumeNoblePhantasm: false,
    inputSource: {
      origin: 'attacker',
      sourceInstanceId: `attacker:${servant.id}`,
      skillId: skill.id,
    },
  });
  if (resource.status === 'rejected')
    return rejectPreparation(
      state,
      resource.code,
      resource.requiredInput,
      resource.requiredInputEffectOccurrenceId,
    );
  const transition = findPreparationTransition(
    servant,
    state,
    'skill',
    skill.id,
    resource.preparationEffects,
  );
  if (typeof transition === 'string') return rejectPreparation(state, transition);
  const structural = resolvePreparationStructuralOutcome(
    servant,
    state,
    resource.preparationEffects,
  );
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
        resource.activation,
      ),
      stateTraits: structural.stateTraits,
      stackCounts: structural.stackCounts,
      initialTraitSuppressions: structural.initialTraitSuppressions,
      npResource: resource.resource.state,
      buffInstances: resource.buffInstances,
      ocState: resource.ocState,
      ocInputDefinitions: resource.ocInputDefinitions,
      uncertainContextWrites: resource.uncertainContextWrites,
      baseOvercharge: resource.resource.baseOvercharge,
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
            stochasticOutcome: resource.activation.get(effect)?.procOutcome ?? null,
          })),
          activationFacts: assemblePreparationActivationFacts(
            servant,
            'skill',
            skill.id,
            state.currentFormId,
            effects,
          ),
          transition,
          resourceBefore: state.npResource,
          resourceAfter: resource.resource.state,
          ocUse: resource.ocUse,
          ocOutcomes: resource.ocOutcomes,
          baseOvercharge: resource.resource.baseOvercharge,
        },
      ],
    },
  };
}
