import {
  actorFormKey,
  noblePhantasmVariantKey,
  type NoblePhantasmVariantRef,
  type ActorFormNode,
} from '@fgo-lab/master-data';
import type { AtlasServant } from './atlasContract';
import type { RawSkill } from './actorFormSkillNormalization';
import type { VariantSets } from './formQualifiedNpNormalization';
import {
  isAttackNp,
  rawRef,
  type RawActorForm,
  type RawVariant,
  type RawVariantGroup,
} from './rawActorFormExtraction';

export interface AssembledActorFormGraph {
  actorForms: {
    id: RawActorForm['id'];
    baseHp: ActorFormNode['baseHp'];
    name: string;
    initial: boolean;
    defaultInitial: boolean;
    traits: string[];
    skillIds: string[];
    passiveIds: string[];
    baseNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  }[];
  initialFormIds: RawActorForm['id'][];
  defaultInitialFormId: RawActorForm['id'];
  baseNoblePhantasmGroupId: string | null;
  groups: RawVariantGroup[];
  skills: RawSkill[];
  passives: RawSkill[];
}

function assembleVariantGroups(
  variants: readonly RawVariant[],
  sets: VariantSets,
  rootInitialRefs: readonly NoblePhantasmVariantRef[],
): RawVariantGroup[] {
  const byRoot = new Map<string, RawVariant[]>();
  for (const variant of variants) {
    const root = sets.find(noblePhantasmVariantKey(variant.ref));
    byRoot.set(root, [...(byRoot.get(root) ?? []), variant]);
  }
  return [...byRoot.values()]
    .map((members) => {
      const sorted = [...members].sort((left, right) =>
        noblePhantasmVariantKey(left.ref).localeCompare(noblePhantasmVariantKey(right.ref)),
      );
      const memberInitial = sorted.find(({ ref }) =>
        rootInitialRefs.some(
          (candidate) => noblePhantasmVariantKey(candidate) === noblePhantasmVariantKey(ref),
        ),
      );
      const attackMembers = sorted.filter(({ np }) => isAttackNp(np));
      const primary = memberInitial ?? (attackMembers.length > 0 ? attackMembers : sorted)[0]!;
      const memberBase = rawRef(primary.form, primary.np);
      return {
        id: noblePhantasmVariantKey(memberBase),
        baseVariant: memberBase,
        variants: sorted,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveDefaultInitialForm(input: {
  servant: AtlasServant;
  forms: readonly RawActorForm[];
  primaryByForm: ReadonlyMap<string, NoblePhantasmVariantRef>;
  variantByKey: ReadonlyMap<string, RawVariant>;
}): RawActorForm {
  const initialAttackForms = input.forms.filter(({ initial, id }) => {
    const ref = input.primaryByForm.get(actorFormKey(id));
    const variant = ref ? input.variantByKey.get(noblePhantasmVariantKey(ref)) : undefined;
    return initial && variant ? isAttackNp(variant.np) : false;
  });
  const ascensionAttackForms = initialAttackForms.filter(({ id }) => id.limitCount <= 4);
  const rawDefaultActorId = input.servant.script?.transformInfo?.saveTransformDefault;
  const rawDefault =
    typeof rawDefaultActorId === 'number'
      ? input.forms.find(
          ({ initial, id }) =>
            initial && id.actorId === String(rawDefaultActorId) && id.limitCount === 0,
        )
      : undefined;
  if (typeof rawDefaultActorId === 'number' && !rawDefault)
    throw new TypeError(`unknown_default_saved_actor_form:${String(rawDefaultActorId)}`);
  const preferred = ascensionAttackForms.length > 0 ? ascensionAttackForms : initialAttackForms;
  const defaultInitialForm =
    rawDefault ??
    [...preferred].sort(
      (left, right) =>
        right.id.limitCount - left.id.limitCount ||
        actorFormKey(left.id).localeCompare(actorFormKey(right.id)),
    )[0] ??
    input.forms.find(({ initial }) => initial);
  if (!defaultInitialForm)
    throw new TypeError(`missing_default_initial_actor_form:${String(input.servant.id)}`);
  return defaultInitialForm;
}

export function assembleActorFormGraph(input: {
  servant: AtlasServant;
  forms: readonly RawActorForm[];
  variants: readonly RawVariant[];
  sets: VariantSets;
  rootInitialRefs: readonly NoblePhantasmVariantRef[];
  primaryByForm: ReadonlyMap<string, NoblePhantasmVariantRef>;
  variantByKey: ReadonlyMap<string, RawVariant>;
}): AssembledActorFormGraph {
  const groups = assembleVariantGroups(input.variants, input.sets, input.rootInitialRefs);
  const baseGroup = input.rootInitialRefs[0]
    ? groups.find((group) =>
        group.variants.some(
          (variant) =>
            noblePhantasmVariantKey(variant.ref) ===
            noblePhantasmVariantKey(input.rootInitialRefs[0]!),
        ),
      )
    : undefined;
  if (input.rootInitialRefs[0] && !baseGroup)
    throw new TypeError(
      `missing_base_variant_group:${noblePhantasmVariantKey(input.rootInitialRefs[0])}`,
    );
  const defaultInitialForm = resolveDefaultInitialForm(input);
  return {
    actorForms: input.forms.map((form) => ({
      id: form.id,
      baseHp:
        JSON.stringify(form.actor.hpGrowth ?? []) === JSON.stringify(input.servant.hpGrowth ?? [])
          ? { kind: 'lineage' as const }
          : {
              kind: 'form' as const,
              hpByLevel: Object.fromEntries(
                (form.actor.hpGrowth ?? []).flatMap((hp, index) =>
                  Number.isInteger(hp) && hp > 0 ? [[String(index + 1), hp]] : [],
                ),
              ),
            },
      name: form.name,
      initial: form.initial,
      defaultInitial: actorFormKey(form.id) === actorFormKey(defaultInitialForm.id),
      traits: form.traits,
      skillIds: form.skills.map((skill) => String(skill.id)),
      passiveIds: form.passives.map((skill) => String(skill.id)),
      baseNoblePhantasmVariant: input.primaryByForm.get(actorFormKey(form.id)) ?? null,
    })),
    initialFormIds: input.forms.filter(({ initial }) => initial).map(({ id }) => id),
    defaultInitialFormId: defaultInitialForm.id,
    baseNoblePhantasmGroupId: baseGroup?.id ?? null,
    groups,
    skills: [
      ...new Map(
        input.forms.flatMap((form) => form.skills).map((skill) => [String(skill.id), skill]),
      ).values(),
    ],
    passives: [
      ...new Map(
        input.forms.flatMap((form) => form.passives).map((skill) => [String(skill.id), skill]),
      ).values(),
    ],
  };
}
