import type { ActorFormId } from '@fgo-lab/master-data';
import type { AtlasReleaseCondition, AtlasServant, AtlasServantAssociation } from './atlasContract';

export type RawSkill = NonNullable<AtlasServant['skills']>[number];

export function equipConditions(associations: readonly AtlasServantAssociation[] | undefined) {
  return (associations ?? [])
    .flatMap(({ releaseConditions }) => releaseConditions ?? [])
    .filter(
      (
        condition,
      ): condition is AtlasReleaseCondition & {
        condTargetId: number;
        condNum: number;
      } =>
        condition.condType === 'equipWithTargetCostume' &&
        typeof condition.condTargetId === 'number' &&
        typeof condition.condNum === 'number',
    );
}

export function availableInForm(
  associations: readonly AtlasServantAssociation[] | undefined,
  form: ActorFormId,
): boolean {
  const conditions = equipConditions(associations);
  return (
    conditions.length === 0 ||
    conditions.some(
      ({ condTargetId, condNum }) =>
        String(condTargetId) === form.actorId && condNum === form.limitCount,
    )
  );
}

export function activeSkills(actor: AtlasServant, form: ActorFormId): RawSkill[] {
  const eligible = (actor.skills ?? []).filter((skill) => availableInForm(skill.skillSvts, form));
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
  return (actor.classPassive ?? []).filter((skill) => availableInForm(skill.skillSvts, form));
}
