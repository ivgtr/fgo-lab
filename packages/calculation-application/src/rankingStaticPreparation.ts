import type { ResolvedRankingBasis } from '@fgo-lab/schema';
import {
  terminalMarkerReads,
  noblePhantasmReadsOc,
  npProgramEffects,
  terminalHpReaders,
  type ResourceActor,
} from '@fgo-lab/battle-execution';
import {
  actorFormEquals,
  actorFormKey,
  findActorForm,
  findNoblePhantasmVariant,
  getInitialActorForms,
  getSkillsForActorForm,
  noblePhantasmVariantKey,
  type ActorFormId,
  type MasterEffect,
  type MasterSkill,
  type NoblePhantasmVariantRef,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  attackProfileKey,
  actorFormProfileIdKey,
  createStaticActorFormProfiles,
  createStaticAttackProfiles,
  type AttackProfile,
} from './attackProfile';

export type RankingPreparationSourceUse =
  | {
      kind: 'skill';
      actorFormId: ActorFormId;
      skill: MasterSkill;
      effects: readonly MasterEffect[];
      skillLevel: number;
    }
  | {
      kind: 'noblePhantasm';
      actorFormId: ActorFormId;
      noblePhantasmVariant: NoblePhantasmVariantRef;
      effects: readonly MasterEffect[];
    };

export interface StaticRankingPreparationProgram {
  key: string;
  attackProfile: AttackProfile;
  initialFormId: ActorFormId;
  initialNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  expectedTerminalFormId: ActorFormId;
  commands: readonly PreNoblePhantasmCommand[];
  sourceUses: readonly RankingPreparationSourceUse[];
  terminalReadsOc?: boolean;
  terminalHpReaders?: readonly ResourceActor[];
  terminalMarkerReads?: readonly string[];
  terminalBattlePointDomainIds?: readonly string[];
}

interface StaticState {
  initialFormId: ActorFormId;
  currentFormId: ActorFormId;
  selectedVariant: NoblePhantasmVariantRef | null;
  usedSkillSlots: ReadonlySet<1 | 2 | 3>;
  transformUsed: boolean;
  commands: readonly PreNoblePhantasmCommand[];
  sourceUses: readonly RankingPreparationSourceUse[];
}

function commandKey(command: PreNoblePhantasmCommand): string {
  return JSON.stringify(command);
}

function programKey(commands: readonly PreNoblePhantasmCommand[]): string {
  return commands.map(commandKey).join('|');
}

function staticStateKey(state: StaticState): string {
  return JSON.stringify({
    initialFormId: actorFormKey(state.initialFormId),
    currentFormId: actorFormKey(state.currentFormId),
    selectedVariant: state.selectedVariant ? noblePhantasmVariantKey(state.selectedVariant) : null,
    usedSkillSlots: [...state.usedSkillSlots].sort(),
    transformUsed: state.transformUsed,
    commands: state.commands.map(commandKey),
  });
}

function skillCommands(
  servant: ServantMaster,
  state: StaticState,
  skillLevels: ResolvedRankingBasis['skillLevels'],
): readonly Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] {
  const commands: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>[] = [];
  for (const skill of getSkillsForActorForm(servant, state.currentFormId)) {
    const slot = skill.slot;
    const skillLevel = skillLevels[String(slot) as '1' | '2' | '3'];
    if (skillLevel === undefined) throw new TypeError('ranking_skill_level_missing');
    if (state.usedSkillSlots.has(slot)) continue;
    const choices = [
      ...new Map(
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.selection?.kind === 'playerChoice'
            ? [
                [
                  `${effect.selection.group.key}:${effect.selection.group.candidate}`,
                  effect.selection.group,
                ] as const,
              ]
            : [],
        ),
      ).values(),
    ];
    if (choices.length === 0)
      commands.push({
        kind: 'useSkillSlot',
        slot,
        skillLevel,
        choice: null,
      });
    else
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

function selectedEffects(
  skill: MasterSkill,
  command: Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>,
): readonly MasterEffect[] {
  return npProgramEffects(skill.effects).filter(
    ({ selection }) =>
      selection?.kind !== 'playerChoice' ||
      (selection.group.key === command.choice?.groupKey &&
        selection.group.candidate === command.choice.candidateKey),
  );
}

function selectedVariantAfterTransition(
  servant: ServantMaster,
  targetFormId: ActorFormId,
  operations: readonly ServantMaster['actorFormGraph']['transitions'][number]['operations'][number][],
): NoblePhantasmVariantRef | null {
  const selected = operations
    .flatMap((operation) =>
      operation.kind === 'selectNoblePhantasmVariant' ? [operation.variant] : [],
    )
    .at(-1);
  return selected ?? findActorForm(servant, targetFormId)?.baseNoblePhantasmVariant ?? null;
}

function structuralBranches(
  servant: ServantMaster,
  state: StaticState,
  sourceKind: 'skill' | 'noblePhantasm',
  sourceId: string,
  selected: readonly MasterEffect[],
): readonly Pick<StaticState, 'currentFormId' | 'selectedVariant'>[] {
  selected = npProgramEffects(selected);
  const occurrences = new Set(selected.map(({ occurrenceId }) => occurrenceId));
  const transitions = servant.actorFormGraph.transitions.filter(
    (transition) =>
      actorFormEquals(transition.from, state.currentFormId) &&
      transition.activation.sourceKind === sourceKind &&
      transition.activation.sourceId === sourceId &&
      transition.activation.effectOccurrenceIds.every((occurrenceId) =>
        occurrences.has(occurrenceId),
      ),
  );
  const directVariants = selected.flatMap(({ execution }) =>
    execution.flatMap((operation) =>
      operation.kind === 'selectNoblePhantasmVariant' ? [operation.variant] : [],
    ),
  );
  return [
    { currentFormId: state.currentFormId, selectedVariant: state.selectedVariant },
    ...transitions.map((transition) => ({
      currentFormId: transition.to,
      selectedVariant: selectedVariantAfterTransition(
        servant,
        transition.to,
        transition.operations,
      ),
    })),
    ...directVariants.map((variant) => ({
      currentFormId: variant.actorFormId,
      selectedVariant: variant,
    })),
  ].filter(
    (branch, index, branches) =>
      branches.findIndex(
        (candidate) =>
          actorFormEquals(candidate.currentFormId, branch.currentFormId) &&
          (candidate.selectedVariant === null
            ? branch.selectedVariant === null
            : branch.selectedVariant !== null &&
              noblePhantasmVariantKey(candidate.selectedVariant) ===
                noblePhantasmVariantKey(branch.selectedVariant)),
      ) === index,
  );
}

export function compileStaticRankingPreparationPrograms(
  servant: ServantMaster,
  skillLevels: ResolvedRankingBasis['skillLevels'],
): readonly StaticRankingPreparationProgram[] {
  const profiles = createStaticAttackProfiles(servant);
  const formProfiles = createStaticActorFormProfiles(servant);
  const pending: StaticState[] = getInitialActorForms(servant).map((form) => ({
    initialFormId: form.id,
    currentFormId: form.id,
    selectedVariant: form.baseNoblePhantasmVariant,
    usedSkillSlots: new Set(),
    transformUsed: false,
    commands: [],
    sourceUses: [],
  }));
  const visited = new Set<string>();
  const programs: StaticRankingPreparationProgram[] = [];
  while (pending.length > 0) {
    const state = pending.shift()!;
    const key = staticStateKey(state);
    const commandsKey = programKey(state.commands);
    if (visited.has(key)) continue;
    visited.add(key);
    const variant = state.selectedVariant
      ? findNoblePhantasmVariant(servant, state.selectedVariant)
      : undefined;
    const formProfile = formProfiles.find(({ formIds }) =>
      formIds.some((formId) => actorFormEquals(formId, state.currentFormId)),
    );
    const canonicalAttackProfile =
      variant?.kind === 'attack' && formProfile
        ? profiles.find(
            (profile) =>
              profile.noblePhantasmVariantCanonicalId === variant.canonicalId &&
              actorFormProfileIdKey(profile.id.terminalActorFormProfileId) ===
                actorFormProfileIdKey(formProfile.id),
          )
        : undefined;
    const attackProfile =
      canonicalAttackProfile && variant?.kind === 'attack'
        ? {
            ...canonicalAttackProfile,
            noblePhantasmVariant: variant.ref,
            noblePhantasmVariantCanonicalId: variant.canonicalId,
            targetScope: variant.targetScope,
            cardType: variant.card,
          }
        : undefined;
    if (attackProfile)
      programs.push({
        key: `${actorFormKey(state.initialFormId)}|${commandsKey}`,
        attackProfile,
        initialFormId: state.initialFormId,
        initialNoblePhantasmVariant:
          findActorForm(servant, state.initialFormId)?.baseNoblePhantasmVariant ?? null,
        expectedTerminalFormId: state.currentFormId,
        commands: [...state.commands, { kind: 'executeAttackNoblePhantasm' }],
        sourceUses: state.sourceUses,
        terminalReadsOc: variant ? noblePhantasmReadsOc(variant) : false,
        terminalHpReaders: variant ? terminalHpReaders(variant) : [],
        terminalMarkerReads: variant ? terminalMarkerReads(variant) : [],
        terminalBattlePointDomainIds:
          variant?.kind === 'attack'
            ? [
                ...new Set(
                  variant.damage.flatMap((damage) =>
                    damage.kind === 'battlePointPhase'
                      ? damage.parametersByOvercharge
                          .flat()
                          .flatMap((cell) =>
                            cell.targetId === undefined ? [] : [String(cell.targetId)],
                          )
                      : [],
                  ),
                ),
              ]
            : [],
      });
    for (const command of skillCommands(servant, state, skillLevels)) {
      const skill = getSkillsForActorForm(servant, state.currentFormId).find(
        ({ slot }) => slot === command.slot,
      );
      if (!skill) continue;
      const effects = selectedEffects(skill, command);
      for (const branch of structuralBranches(servant, state, 'skill', skill.id, effects))
        pending.push({
          ...state,
          ...branch,
          usedSkillSlots: new Set([...state.usedSkillSlots, command.slot]),
          commands: [...state.commands, command],
          sourceUses: [
            ...state.sourceUses,
            {
              kind: 'skill',
              actorFormId: state.currentFormId,
              skill,
              effects,
              skillLevel: command.skillLevel,
            },
          ],
        });
    }
    if (!state.transformUsed && variant?.kind === 'nonAttack')
      for (const branch of structuralBranches(
        servant,
        state,
        'noblePhantasm',
        variant.ref.noblePhantasmId,
        variant.effects,
      ).filter(({ currentFormId }) => !actorFormEquals(currentFormId, state.currentFormId)))
        pending.push({
          ...state,
          ...branch,
          transformUsed: true,
          commands: [...state.commands, { kind: 'useTransformNoblePhantasm' }],
          sourceUses: [
            ...state.sourceUses,
            {
              kind: 'noblePhantasm',
              actorFormId: state.currentFormId,
              noblePhantasmVariant: variant.ref,
              effects: npProgramEffects(variant.effects),
            },
          ],
        });
  }
  return [
    ...new Map(
      programs
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((program) => [`${attackProfileKey(program.attackProfile)}:${program.key}`, program]),
    ).values(),
  ];
}
