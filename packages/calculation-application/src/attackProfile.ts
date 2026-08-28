import type { PreNoblePhantasmState } from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  getPassivesForActorForm,
  getSkillsForActorForm,
  noblePhantasmVariantKey,
  type ActorFormId,
  type NoblePhantasmVariantRef,
  type ServantMaster,
} from '@fgo-lab/master-data';

export interface ActorFormProfileId {
  servantLineageId: string;
  representativeFormId: ActorFormId;
}

export interface ActorFormProfile {
  id: ActorFormProfileId;
  formIds: readonly ActorFormId[];
  semanticFingerprint: string;
  displayName: string;
}

export interface AttackProfile {
  servantLineageId: string;
  terminalFormProfileId: ActorFormProfileId;
  noblePhantasmVariant: NoblePhantasmVariantRef;
  targetScope: 'single' | 'all';
  cardType: 'buster' | 'arts' | 'quick';
  terminalFormLabel: string | null;
}

function formSemanticFingerprint(
  servant: ServantMaster,
  formId: ActorFormId,
  reachableAttackVariantIds: readonly string[],
): string {
  const form = servant.actorFormGraph.forms.find(
    ({ id }) => actorFormKey(id) === actorFormKey(formId),
  );
  if (!form) throw new TypeError(`actor_form_missing:${actorFormKey(formId)}`);
  return JSON.stringify({
    skillSlots: getSkillsForActorForm(servant, formId)
      .map(({ slot, id }) => ({ slot, skillVariantId: id }))
      .sort(
        (left, right) =>
          left.slot - right.slot || left.skillVariantId.localeCompare(right.skillVariantId),
      ),
    passiveVariants: getPassivesForActorForm(servant, formId)
      .map(({ id }) => id)
      .sort(),
    intrinsicTraits: [...form.traits].sort(),
    baseNoblePhantasmVariantId: form.baseNoblePhantasmVariant?.noblePhantasmId ?? null,
    reachableAttackVariantIds: [...reachableAttackVariantIds].sort(),
  });
}

export function actorFormProfileIdKey(id: ActorFormProfileId): string {
  return JSON.stringify([
    id.servantLineageId,
    id.representativeFormId.actorId,
    id.representativeFormId.limitCount,
  ]);
}

export function attackProfileKey(profile: AttackProfile): string {
  return JSON.stringify([
    profile.servantLineageId,
    actorFormProfileIdKey(profile.terminalFormProfileId),
    noblePhantasmVariantKey(profile.noblePhantasmVariant),
  ]);
}

export function createActorFormProfiles(
  servant: ServantMaster,
  terminalStates: readonly PreNoblePhantasmState[],
): readonly ActorFormProfile[] {
  const reachableByForm = new Map<string, Set<string>>();
  for (const state of terminalStates) {
    const variant = state.selectedNoblePhantasmVariant;
    if (!variant) continue;
    const formKey = actorFormKey(state.currentFormId);
    const variants = reachableByForm.get(formKey) ?? new Set<string>();
    variants.add(variant.noblePhantasmId);
    reachableByForm.set(formKey, variants);
  }
  const formsByFingerprint = new Map<string, ActorFormId[]>();
  for (const form of servant.actorFormGraph.forms) {
    const fingerprint = formSemanticFingerprint(servant, form.id, [
      ...(reachableByForm.get(actorFormKey(form.id)) ?? []),
    ]);
    formsByFingerprint.set(fingerprint, [...(formsByFingerprint.get(fingerprint) ?? []), form.id]);
  }
  return [...formsByFingerprint]
    .map(([semanticFingerprint, formIds]) => {
      const sorted = [...formIds].sort((left, right) =>
        actorFormKey(left).localeCompare(actorFormKey(right)),
      );
      return {
        id: { servantLineageId: servant.id, representativeFormId: sorted[0]! },
        formIds: sorted,
        semanticFingerprint,
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
  const variant = servant.noblePhantasmVariantGroups
    .flatMap(({ variants }) => variants)
    .find(({ ref }) => noblePhantasmVariantKey(ref) === noblePhantasmVariantKey(variantRef));
  if (!variant || variant.kind !== 'attack')
    throw new TypeError(`terminal_attack_variant_invalid:${noblePhantasmVariantKey(variantRef)}`);
  const profile = profiles.find(({ formIds }) =>
    formIds.some((formId) => actorFormKey(formId) === actorFormKey(state.currentFormId)),
  );
  if (!profile)
    throw new TypeError(`terminal_actor_form_profile_missing:${actorFormKey(state.currentFormId)}`);
  return {
    servantLineageId: servant.id,
    terminalFormProfileId: profile.id,
    noblePhantasmVariant: variant.ref,
    targetScope: variant.targetScope,
    cardType: variant.card,
    terminalFormLabel: profiles.length > 1 ? profile.displayName : null,
  };
}
