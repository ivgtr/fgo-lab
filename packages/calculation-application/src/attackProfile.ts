import type { PreNoblePhantasmState } from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  getPassivesForActorForm,
  getSkillsForActorForm,
  noblePhantasmVariantKey,
  type ActorFormId,
  type NoblePhantasmVariant,
  type NoblePhantasmVariantCanonicalId,
  type NoblePhantasmVariantRef,
  type ServantMaster,
} from '@fgo-lab/master-data';

export interface ActorFormProfileId {
  servantLineageId: string;
  semantics: {
    skillSlots: readonly {
      slot: number;
      skillVariantId: string;
    }[];
    passiveVariantIds: readonly string[];
    intrinsicTraits: readonly string[];
    baseNoblePhantasmVariantCanonicalId: NoblePhantasmVariantCanonicalId | null;
    reachableAttackNoblePhantasmVariantCanonicalIds: readonly NoblePhantasmVariantCanonicalId[];
  };
}

export interface ActorFormProfile {
  id: ActorFormProfileId;
  formIds: readonly ActorFormId[];
  displayName: string;
}

export interface AttackProfileId {
  servantLineageId: string;
  terminalActorFormProfileId: ActorFormProfileId;
  attackNoblePhantasmVariantCanonicalId: NoblePhantasmVariantCanonicalId;
}

export interface AttackProfile {
  id: AttackProfileId;
  noblePhantasmVariant: NoblePhantasmVariantRef;
  noblePhantasmVariantCanonicalId: NoblePhantasmVariantCanonicalId;
  targetScope: 'single' | 'all';
  cardType: 'buster' | 'arts' | 'quick';
  terminalFormLabel: string | null;
}

function formProfileId(
  servant: ServantMaster,
  formId: ActorFormId,
  reachableAttackVariantIds: readonly NoblePhantasmVariantCanonicalId[],
  variantsByRef: ReadonlyMap<string, NoblePhantasmVariant>,
): ActorFormProfileId {
  const form = servant.actorFormGraph.forms.find(
    ({ id }) => actorFormKey(id) === actorFormKey(formId),
  );
  if (!form) throw new TypeError(`actor_form_missing:${actorFormKey(formId)}`);
  const baseVariantRef = form.baseNoblePhantasmVariant;
  const baseVariant = baseVariantRef
    ? variantsByRef.get(noblePhantasmVariantKey(baseVariantRef))
    : null;
  if (baseVariantRef && !baseVariant)
    throw new TypeError(
      `base_noble_phantasm_variant_missing:${noblePhantasmVariantKey(baseVariantRef)}`,
    );
  return {
    servantLineageId: servant.id,
    semantics: {
      skillSlots: getSkillsForActorForm(servant, formId)
        .map(({ slot, id }) => ({ slot, skillVariantId: id }))
        .sort(
          (left, right) =>
            left.slot - right.slot || left.skillVariantId.localeCompare(right.skillVariantId),
        ),
      passiveVariantIds: getPassivesForActorForm(servant, formId)
        .map(({ id }) => id)
        .sort(),
      intrinsicTraits: [...form.traits].sort(),
      baseNoblePhantasmVariantCanonicalId: baseVariant?.canonicalId ?? null,
      reachableAttackNoblePhantasmVariantCanonicalIds: [...reachableAttackVariantIds].sort(),
    },
  };
}

export function actorFormProfileIdKey(id: ActorFormProfileId): string {
  return JSON.stringify([
    id.servantLineageId,
    id.semantics.skillSlots.map(({ slot, skillVariantId }) => [slot, skillVariantId]),
    id.semantics.passiveVariantIds,
    id.semantics.intrinsicTraits,
    id.semantics.baseNoblePhantasmVariantCanonicalId,
    id.semantics.reachableAttackNoblePhantasmVariantCanonicalIds,
  ]);
}

export function attackProfileKey(profile: AttackProfile): string {
  if (profile.id.servantLineageId !== profile.id.terminalActorFormProfileId.servantLineageId)
    throw new TypeError('attack_profile_lineage_mismatch');
  if (profile.id.attackNoblePhantasmVariantCanonicalId !== profile.noblePhantasmVariantCanonicalId)
    throw new TypeError('attack_profile_variant_mismatch');
  return JSON.stringify([
    profile.id.servantLineageId,
    profile.id.terminalActorFormProfileId.semantics,
    profile.id.attackNoblePhantasmVariantCanonicalId,
  ]);
}

function indexNoblePhantasmVariants(
  servant: ServantMaster,
): ReadonlyMap<string, NoblePhantasmVariant> {
  const variantsByRef = new Map<string, NoblePhantasmVariant>();
  for (const variant of servant.noblePhantasmVariantGroups.flatMap(({ variants }) => variants)) {
    const key = noblePhantasmVariantKey(variant.ref);
    if (variantsByRef.has(key)) throw new TypeError(`noble_phantasm_variant_ambiguous:${key}`);
    variantsByRef.set(key, variant);
  }
  return variantsByRef;
}

export function createActorFormProfiles(
  servant: ServantMaster,
  terminalStates: readonly PreNoblePhantasmState[],
): readonly ActorFormProfile[] {
  const reachableByForm = new Map<string, Set<NoblePhantasmVariantCanonicalId>>();
  const variantsByRef = indexNoblePhantasmVariants(servant);
  for (const state of terminalStates) {
    const variantRef = state.selectedNoblePhantasmVariant;
    if (!variantRef) continue;
    const variant = variantsByRef.get(noblePhantasmVariantKey(variantRef));
    if (!variant || variant.kind !== 'attack')
      throw new TypeError(`terminal_attack_variant_invalid:${noblePhantasmVariantKey(variantRef)}`);
    const formKey = actorFormKey(state.currentFormId);
    const variants = reachableByForm.get(formKey) ?? new Set<string>();
    variants.add(variant.canonicalId);
    reachableByForm.set(formKey, variants);
  }
  const formsByIdentity = new Map<string, { id: ActorFormProfileId; formIds: ActorFormId[] }>();
  for (const form of servant.actorFormGraph.forms) {
    const id = formProfileId(
      servant,
      form.id,
      [...(reachableByForm.get(actorFormKey(form.id)) ?? [])],
      variantsByRef,
    );
    const key = actorFormProfileIdKey(id);
    const existing = formsByIdentity.get(key);
    formsByIdentity.set(key, {
      id,
      formIds: [...(existing?.formIds ?? []), form.id],
    });
  }
  return [...formsByIdentity.values()]
    .map(({ id, formIds }) => {
      const sorted = [...formIds].sort((left, right) =>
        actorFormKey(left).localeCompare(actorFormKey(right)),
      );
      return {
        id,
        formIds: sorted,
        displayName:
          servant.actorFormGraph.forms.find(
            ({ id }) => actorFormKey(id) === actorFormKey(sorted[0]!),
          )?.name ?? '',
      };
    })
    .sort((left, right) =>
      actorFormProfileIdKey(left.id).localeCompare(actorFormProfileIdKey(right.id)),
    );
}

export function attackProfileForTerminalState(
  servant: ServantMaster,
  profiles: readonly ActorFormProfile[],
  state: PreNoblePhantasmState,
): AttackProfile {
  const variantRef = state.selectedNoblePhantasmVariant;
  if (!variantRef) throw new TypeError(`terminal_attack_variant_missing:${servant.id}`);
  const variant = indexNoblePhantasmVariants(servant).get(noblePhantasmVariantKey(variantRef));
  if (!variant || variant.kind !== 'attack')
    throw new TypeError(`terminal_attack_variant_invalid:${noblePhantasmVariantKey(variantRef)}`);
  const matchingProfiles = profiles.filter(({ formIds }) =>
    formIds.some((formId) => actorFormKey(formId) === actorFormKey(state.currentFormId)),
  );
  if (matchingProfiles.length === 0)
    throw new TypeError(`terminal_actor_form_profile_missing:${actorFormKey(state.currentFormId)}`);
  if (matchingProfiles.length > 1)
    throw new TypeError(
      `terminal_actor_form_profile_ambiguous:${actorFormKey(state.currentFormId)}`,
    );
  const profile = matchingProfiles[0]!;
  if (profile.id.servantLineageId !== servant.id)
    throw new TypeError(`terminal_actor_form_profile_lineage_mismatch:${servant.id}`);
  if (
    !profile.id.semantics.reachableAttackNoblePhantasmVariantCanonicalIds.includes(
      variant.canonicalId,
    )
  )
    throw new TypeError(
      `terminal_attack_variant_unreachable:${noblePhantasmVariantKey(variantRef)}`,
    );
  return {
    id: {
      servantLineageId: servant.id,
      terminalActorFormProfileId: profile.id,
      attackNoblePhantasmVariantCanonicalId: variant.canonicalId,
    },
    noblePhantasmVariant: variant.ref,
    noblePhantasmVariantCanonicalId: variant.canonicalId,
    targetScope: variant.targetScope,
    cardType: variant.card,
    terminalFormLabel: profiles.length > 1 ? profile.displayName : null,
  };
}
