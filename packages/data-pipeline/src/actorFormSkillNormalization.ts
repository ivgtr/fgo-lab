import type { ActorFormId } from '@fgo-lab/master-data';
import type { AtlasReleaseCondition, AtlasServant, AtlasServantAssociation } from './atlasContract';

export type RawSkill = NonNullable<AtlasServant['skills']>[number];

export interface ReleaseOwner {
  actorId: number;
  num: number | undefined;
  priority: number | undefined;
}

function ownerConditions(
  associations: readonly AtlasServantAssociation[] | undefined,
  owner: ReleaseOwner,
): readonly AtlasReleaseCondition[] {
  if (!associations?.length) return [];
  if (owner.num === undefined || owner.priority === undefined)
    throw new TypeError(`incomplete_release_owner:${String(owner.actorId)}`);
  const own = associations.filter(
    ({ svtId, num, priority }) =>
      svtId === owner.actorId && num === owner.num && priority === owner.priority,
  );
  if (own.length !== 1)
    throw new TypeError(
      `ambiguous_release_owner:${String(owner.actorId)}:${String(owner.num)}:${String(owner.priority)}`,
    );
  return own[0]!.releaseConditions ?? [];
}

function checkedConditions(
  associations: readonly AtlasServantAssociation[] | undefined,
  owner: ReleaseOwner,
): readonly (AtlasReleaseCondition & {
  condType: string;
  condTargetId: number;
  condNum: number;
  condGroup: number;
})[] {
  return ownerConditions(associations, owner).map((condition) => {
    const { condType, condTargetId, condNum, condGroup } = condition;
    if (
      !['equipWithTargetCostume', 'questClear', 'svtLimit'].includes(condType ?? '') ||
      !Number.isSafeInteger(condTargetId) ||
      !Number.isSafeInteger(condNum) ||
      !Number.isSafeInteger(condGroup) ||
      condTargetId! < 0 ||
      condNum! < 0 ||
      condGroup! < 0
    )
      throw new TypeError(`unsupported_release_condition:${String(condType)}`);
    if (condType === 'svtLimit' && condTargetId !== owner.actorId)
      throw new TypeError(`foreign_svt_limit:${String(condTargetId)}`);
    return condition as AtlasReleaseCondition & {
      condType: string;
      condTargetId: number;
      condNum: number;
      condGroup: number;
    };
  });
}

export function equipConditions(
  associations: readonly AtlasServantAssociation[] | undefined,
  owner: ReleaseOwner,
) {
  return checkedConditions(associations, owner).filter(
    (condition) => condition.condType === 'equipWithTargetCostume',
  );
}

export function availableInForm(
  associations: readonly AtlasServantAssociation[] | undefined,
  form: ActorFormId,
  owner: ReleaseOwner,
): boolean {
  const conditions = checkedConditions(associations, owner);
  if (conditions.length === 0) return true;
  const groups = new Map<number, typeof conditions>();
  for (const condition of conditions)
    groups.set(condition.condGroup, [...(groups.get(condition.condGroup) ?? []), condition]);
  return [...groups.values()].some((group) =>
    group.every((condition) => {
      if (condition.condType === 'questClear') return true;
      if (condition.condType === 'svtLimit') return true;
      return (
        String(condition.condTargetId) === form.actorId && condition.condNum === form.limitCount
      );
    }),
  );
}

function skillOwner(actor: AtlasServant, skill: RawSkill): ReleaseOwner {
  if (typeof actor.id !== 'number') throw new TypeError('missing_actor_form_identity');
  return { actorId: actor.id, num: skill.num, priority: skill.priority };
}

export function activeSkills(actor: AtlasServant, form: ActorFormId): RawSkill[] {
  const eligible = (actor.skills ?? []).filter((skill) =>
    availableInForm(skill.skillSvts, form, skillOwner(actor, skill)),
  );
  return [1, 2, 3].flatMap((slot) => {
    const candidates = eligible.filter((skill) => skill.num === slot);
    if (candidates.length === 0) return [];
    const priority = Math.max(...candidates.map((skill) => skill.priority ?? 0));
    const selected = candidates.filter((skill) => (skill.priority ?? 0) === priority);
    if (selected.length !== 1)
      throw new TypeError(
        `ambiguous_form_skill:${form.actorId}:${String(form.limitCount)}:${slot}`,
      );
    return selected;
  });
}

export function activePassives(actor: AtlasServant, form: ActorFormId): RawSkill[] {
  return (actor.classPassive ?? []).filter((skill) =>
    availableInForm(skill.skillSvts, form, skillOwner(actor, skill)),
  );
}
