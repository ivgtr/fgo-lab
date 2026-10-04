import {
  actorFormKey,
  findActorForm,
  findNoblePhantasmVariant,
  getPassivesForActorForm,
  noblePhantasmVariantKey,
  type ActorFormId,
  type MasterEffect,
  type NoblePhantasmVariant,
  type ServantMaster,
} from '@fgo-lab/master-data';
import {
  hasOcExecution,
  effectChangesPreparation,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import type {
  RankingPreparationSourceUse,
  StaticRankingPreparationProgram,
} from './rankingStaticPreparation';

export interface RankingProgramSourceGroup {
  kind: 'automatic' | 'action' | 'terminal';
  commandIndex: number;
  formId: ActorFormId;
  /** Earlier constant damage effects expire; their ordered preparation reads/writes do not. */
  damageActive: boolean;
  noblePhantasm: NoblePhantasmVariant | null;
  sources: readonly SourceEffect[];
}

function sourceEffects(input: {
  servant: ServantMaster;
  actorFormId: RankingPreparationSourceUse['actorFormId'];
  phase: SourceEffect['phase'];
  origin: SourceEffect['origin'];
  sourceInstanceId: string;
  skillId: string;
  skillName: string;
  effects: readonly MasterEffect[];
  valueIndex: number;
  valueSetIndex: number;
  noblePhantasmVariant: SourceEffect['noblePhantasmVariant'];
  sourceActivation: SourceEffect['sourceActivation'];
}): SourceEffect[] {
  const form = findActorForm(input.servant, input.actorFormId);
  if (!form) throw new TypeError('ranking_program_form_missing');
  return input.effects.map((effect) => ({
    phase: input.phase,
    compilationPurpose: 'dependency',
    origin: input.origin,
    sourceInstanceId: input.sourceInstanceId,
    sourceId: input.servant.id,
    sourceName: input.servant.name,
    sourceTraits: form.traits,
    skillId: input.skillId,
    skillName: input.skillName,
    effect,
    valueSetIndex: input.valueSetIndex,
    valueIndex: input.valueIndex,
    limitBreak: false,
    sourceEnabled: true,
    enabledByDefault:
      input.origin === 'passive' ? effect.inclusionPolicy.default === 'include' : true,
    noblePhantasmVariant: input.noblePhantasmVariant,
    sourceActivation: input.sourceActivation,
  }));
}

/** The selected structural path determines when each form's automatic sources become available. */
export function rankingProgramSourceGroups(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  npLevel: number,
): readonly RankingProgramSourceGroup[] {
  const groups: RankingProgramSourceGroup[] = [];
  let activeForm: string | null = null;
  const activate = (formId: ActorFormId, commandIndex: number) => {
    const key = actorFormKey(formId);
    if (!findActorForm(servant, formId)) throw new TypeError('ranking_program_form_missing');
    if (activeForm === key) return;
    activeForm = key;
    for (const group of groups) if (group.kind === 'automatic') group.damageActive = false;
    groups.push({
      kind: 'automatic',
      commandIndex,
      formId,
      damageActive: key === actorFormKey(program.expectedTerminalFormId),
      noblePhantasm: null,
      sources: getPassivesForActorForm(servant, formId).flatMap((passive) =>
        sourceEffects({
          servant,
          actorFormId: formId,
          phase: 'passive',
          origin: 'passive',
          sourceInstanceId: `passive:${servant.id}`,
          skillId: passive.id,
          skillName: passive.name,
          effects: passive.effects,
          valueIndex: 0,
          valueSetIndex: 0,
          noblePhantasmVariant: null,
          sourceActivation: { kind: 'unread' },
        }).map((source) => ({ ...source, constantFormKey: key })),
      ),
    });
  };
  activate(program.initialFormId, 0);
  for (const [commandIndex, use] of program.sourceUses.entries()) {
    activate(use.actorFormId, commandIndex);
    if (use.kind === 'skill') {
      groups.push({
        kind: 'action',
        commandIndex,
        formId: use.actorFormId,
        damageActive: true,
        noblePhantasm: null,
        sources: sourceEffects({
          servant,
          actorFormId: use.actorFormId,
          phase: 'attackerSkill',
          origin: 'attacker',
          sourceInstanceId: `attacker:${servant.id}`,
          skillId: use.skill.id,
          skillName: use.skill.name,
          effects: use.effects,
          valueIndex: use.skillLevel - 1,
          valueSetIndex: 0,
          noblePhantasmVariant: null,
          sourceActivation: { kind: 'unread' },
        }),
      });
    } else {
      const variant = findNoblePhantasmVariant(servant, use.noblePhantasmVariant);
      if (!variant) throw new TypeError('ranking_program_np_variant_missing');
      const key = noblePhantasmVariantKey(variant.ref);
      groups.push({
        kind: 'action',
        commandIndex,
        formId: use.actorFormId,
        damageActive: true,
        noblePhantasm: variant,
        sources: sourceEffects({
          servant,
          actorFormId: use.actorFormId,
          phase: 'preparationNoblePhantasm',
          origin: 'np',
          sourceInstanceId: `np:${key}`,
          skillId: `np:${key}`,
          skillName: variant.name,
          effects: use.effects,
          valueIndex: npLevel - 1,
          valueSetIndex: 0,
          noblePhantasmVariant: variant.ref,
          sourceActivation: { kind: 'unread' },
        }),
      });
    }
  }
  activate(program.expectedTerminalFormId, program.sourceUses.length);
  const variant = findNoblePhantasmVariant(servant, program.attackProfile.noblePhantasmVariant);
  if (!variant || variant.kind !== 'attack')
    throw new TypeError('ranking_program_attack_variant_missing');
  if (actorFormKey(variant.ref.actorFormId) !== actorFormKey(program.expectedTerminalFormId))
    throw new TypeError('ranking_program_np_form_mismatch');
  const key = noblePhantasmVariantKey(variant.ref);
  groups.push({
    kind: 'terminal',
    commandIndex: program.sourceUses.length,
    formId: variant.ref.actorFormId,
    damageActive: true,
    noblePhantasm: variant,
    sources: sourceEffects({
      servant,
      actorFormId: variant.ref.actorFormId,
      phase: 'beforeNpDamage',
      origin: 'np',
      sourceInstanceId: `np:${key}`,
      skillId: `np:${key}`,
      skillName: variant.name,
      effects: variant.effects.filter(({ timing }) => timing === 'beforeDamage'),
      valueIndex: npLevel - 1,
      valueSetIndex: 0,
      noblePhantasmVariant: variant.ref,
      sourceActivation: { kind: 'unread' },
    }),
  });
  return groups;
}

/** Static damage dependencies use the ordinary projection, not preparation activation order.
 * Each form is represented once. Prior-form preparation effects remain available to the planner.
 */
export function rankingStaticSourceProjection(
  servant: ServantMaster,
  program: StaticRankingPreparationProgram,
  npLevel: number,
): readonly SourceEffect[] {
  const groups = rankingProgramSourceGroups(servant, program, npLevel);
  const automatic = new Map<string, RankingProgramSourceGroup>();
  for (const group of groups)
    if (group.kind === 'automatic') automatic.set(actorFormKey(group.formId), group);
  return [
    ...[...automatic.values()].flatMap((group) =>
      group.sources.filter(
        (source) =>
          group.damageActive ||
          hasOcExecution(source.effect) ||
          effectChangesPreparation(source.effect),
      ),
    ),
    ...groups.filter(({ kind }) => kind !== 'automatic').flatMap(({ sources }) => sources),
  ];
}
