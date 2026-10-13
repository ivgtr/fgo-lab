import { actorFormKey, type ActorFormId, type NoblePhantasmVariantRef } from '@fgo-lab/master-data';
import type { AtlasNp, AtlasServant, AtlasTraitRef } from './atlasContract';
import {
  activePassives,
  activeSkills,
  availableInForm,
  equipConditions,
  type RawSkill,
} from './actorFormSkillNormalization';
import { transformTarget } from './rawActorFormTransitions';

export interface RawActorForm {
  id: ActorFormId;
  actor: AtlasServant;
  initial: boolean;
  name: string;
  traits: string[];
  skills: RawSkill[];
  passives: RawSkill[];
}

export interface RawVariant {
  form: RawActorForm;
  np: AtlasNp;
  ref: NoblePhantasmVariantRef;
}

export interface RawVariantGroup {
  id: string;
  baseVariant: NoblePhantasmVariantRef;
  variants: RawVariant[];
}

export function stateTraitName(
  trait: AtlasTraitRef,
  traitNameById: ReadonlyMap<number, string>,
): string | null {
  if (trait.id === 3004) return null;
  if (trait.name && trait.name !== 'unknown') return trait.name;
  if (typeof trait.id === 'number')
    return traitNameById.get(trait.id) ?? `traitId:${String(trait.id)}`;
  return null;
}

function formTraitNames(
  actor: AtlasServant,
  form: ActorFormId,
  traitNameById: ReadonlyMap<number, string>,
): string[] {
  const costumeId =
    typeof actor.id === 'number' && form.limitCount > 10
      ? actor.id + (form.limitCount - 10) * 10
      : null;
  const exact =
    costumeId !== null
      ? actor.ascensionAdd?.individuality?.costume?.[String(costumeId)]
      : actor.ascensionAdd?.individuality?.ascension?.[String(form.limitCount)];
  const ascensionBase = actor.ascensionAdd?.individuality?.ascension?.['0'];
  const fallback = ascensionBase?.length ? ascensionBase : (actor.traits ?? []);
  return [
    ...new Set(
      (exact?.length ? exact : fallback).flatMap((trait) => {
        const name = stateTraitName(trait, traitNameById);
        return name ? [name] : [];
      }),
    ),
  ];
}

function significantInitialLimits(actor: AtlasServant): number[] {
  if (typeof actor.id !== 'number') throw new TypeError('missing_actor_form_identity');
  const limits = new Set<number>();
  for (const np of actor.noblePhantasms ?? [])
    for (const condition of equipConditions(np.npSvts, {
      actorId: actor.id,
      num: np.num,
      priority: np.priority,
    }))
      if (condition.condTargetId === actor.id) limits.add(condition.condNum);
  for (const skill of [...(actor.skills ?? []), ...(actor.classPassive ?? [])]) {
    for (const condition of equipConditions(skill.skillSvts, {
      actorId: actor.id,
      num: skill.num,
      priority: skill.priority,
    }))
      if (condition.condTargetId === actor.id) limits.add(condition.condNum);
    for (const fn of skill.functions ?? []) {
      const target = transformTarget(fn);
      if (target?.actorId === String(actor.id)) limits.add(target.limitCount);
    }
  }
  if (limits.size === 0) return [0];
  limits.add(1);
  return [...limits].sort((left, right) => left - right);
}

function formName(actor: AtlasServant, id: ActorFormId): string {
  if (id.limitCount === 0) return actor.name ?? '不明な形態';
  if (id.limitCount === 1) return '第1・第2再臨';
  if (id.limitCount === 3) return '第3再臨';
  return `バトルキャラ ${String(id.limitCount)}`;
}

function makeForm(
  actor: AtlasServant,
  id: ActorFormId,
  initial: boolean,
  traitNameById: ReadonlyMap<number, string>,
): RawActorForm {
  return {
    actor,
    id,
    initial,
    name: formName(actor, id),
    traits: formTraitNames(actor, id, traitNameById),
    skills: activeSkills(actor, id),
    passives: activePassives(actor, id),
  };
}

export function eligibleNps(form: RawActorForm): AtlasNp[] {
  const nps = form.actor.noblePhantasms ?? [];
  const actorId = form.actor.id;
  if (typeof actorId !== 'number') throw new TypeError('missing_actor_form_identity');
  const owner = (np: AtlasNp) => ({ actorId, num: np.num, priority: np.priority });
  return nps.filter((np) => {
    const ownConditions = equipConditions(np.npSvts, owner(np));
    const conditionedParents = nps.filter(
      (candidate) =>
        candidate.script?.tdTypeChangeIDs?.includes(np.id ?? -1) &&
        equipConditions(candidate.npSvts, owner(candidate)).length > 0,
    );
    if (ownConditions.length === 0 && (np.priority ?? 0) <= 0 && conditionedParents.length > 0)
      return conditionedParents.some((candidate) =>
        availableInForm(candidate.npSvts, form.id, owner(candidate)),
      );
    return availableInForm(np.npSvts, form.id, owner(np));
  });
}

export function extractReachableActorForms(
  servant: AtlasServant,
  actorById: ReadonlyMap<number, AtlasServant>,
  traitNameById: ReadonlyMap<number, string>,
): RawActorForm[] {
  if (typeof servant.id !== 'number') throw new TypeError('missing_actor_form_identity');
  const pending = significantInitialLimits(servant).map((limitCount) =>
    makeForm(servant, { actorId: String(servant.id), limitCount }, true, traitNameById),
  );
  const savedActorId = servant.script?.transformInfo?.saveTransform;
  if (typeof savedActorId === 'number') {
    const savedActor = actorById.get(savedActorId);
    if (!savedActor) throw new TypeError(`unknown_saved_actor_form:${String(savedActorId)}`);
    pending.push(
      makeForm(savedActor, { actorId: String(savedActorId), limitCount: 0 }, true, traitNameById),
    );
  }
  const result: RawActorForm[] = [];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const form = pending.shift()!;
    const key = actorFormKey(form.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(form);
    for (const skill of [...form.skills, ...form.passives])
      for (const fn of skill.functions ?? []) {
        const target = transformTarget(fn);
        if (!target) continue;
        const actor = actorById.get(Number(target.actorId));
        if (!actor) throw new TypeError(`unknown_actor_form:${target.actorId}`);
        pending.push(makeForm(actor, target, false, traitNameById));
      }
    for (const np of eligibleNps(form))
      for (const fn of np.functions ?? []) {
        const target = transformTarget(fn);
        if (!target) continue;
        const actor = actorById.get(Number(target.actorId));
        if (!actor) throw new TypeError(`unknown_actor_form:${target.actorId}`);
        pending.push(makeForm(actor, target, false, traitNameById));
      }
  }
  return result;
}

export function uniquePrimaryNp(form: RawActorForm): AtlasNp | null {
  const candidates = eligibleNps(form).filter((np) => typeof np.id === 'number');
  if (candidates.length === 0) return null;
  const attackCandidates = candidates.filter(isAttackNp);
  const eligible = attackCandidates.length > 0 ? attackCandidates : candidates;
  const priority = Math.max(...eligible.map((np) => np.priority ?? 0));
  const selected = eligible.filter((np) => (np.priority ?? 0) === priority);
  if (selected.length !== 1)
    throw new TypeError(`ambiguous_base_noble_phantasm:${actorFormKey(form.id)}`);
  return selected[0]!;
}

export function rawRef(form: RawActorForm, np: AtlasNp): NoblePhantasmVariantRef {
  if (typeof np.id !== 'number') throw new TypeError('incomplete_noble_phantasm_variant_identity');
  return { actorFormId: form.id, noblePhantasmId: String(np.id) };
}

export function isAttackNp(np: AtlasNp): boolean {
  return (np.functions ?? []).some((fn) => fn.funcType?.startsWith('damageNp'));
}
