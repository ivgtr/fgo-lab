import {
  actorFormKey,
  noblePhantasmVariantKey,
  type EffectExecutionOperation,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasServant } from './atlasContract';
import { assembleActorFormGraph } from './actorFormGraphAssembly';
import { VariantSets, selectedVariant } from './formQualifiedNpNormalization';
import {
  eligibleNps,
  extractReachableActorForms,
  rawRef,
  stateTraitName,
  uniquePrimaryNp,
  type RawActorForm,
} from './rawActorFormExtraction';
import { choiceKey, functionChoice, transformTarget } from './rawActorFormTransitions';
import type { NoblePhantasmVariantNormalization } from './noblePhantasmVariantNormalizationContracts';
export type { NoblePhantasmVariantNormalization } from './noblePhantasmVariantNormalizationContracts';

export function normalizeNoblePhantasmVariants(input: {
  servant: AtlasServant;
  allServants: readonly AtlasServant[];
  traitNameById: ReadonlyMap<number, string>;
}): NoblePhantasmVariantNormalization {
  if (typeof input.servant.id !== 'number') throw new TypeError('missing_actor_form_identity');
  const actorById = new Map(
    input.allServants.flatMap((actor) =>
      typeof actor.id === 'number' ? ([[actor.id, actor]] as const) : [],
    ),
  );
  const forms = extractReachableActorForms(input.servant, actorById, input.traitNameById);
  const formByKey = new Map(forms.map((form) => [actorFormKey(form.id), form]));
  const variants = forms.flatMap((form) =>
    eligibleNps(form).flatMap((np) =>
      typeof np.id === 'number' ? [{ form, np, ref: rawRef(form, np) }] : [],
    ),
  );
  const variantByKey = new Map(
    variants.map((variant) => [noblePhantasmVariantKey(variant.ref), variant]),
  );
  const sets = new VariantSets();
  for (const variant of variants) sets.add(noblePhantasmVariantKey(variant.ref));
  for (const variant of variants)
    for (const linkedId of variant.np.script?.tdTypeChangeIDs ?? []) {
      const linkedRef = {
        actorFormId: variant.ref.actorFormId,
        noblePhantasmId: String(linkedId),
      };
      const linkedKey = noblePhantasmVariantKey(linkedRef);
      if (!variantByKey.has(linkedKey))
        throw new TypeError(
          `unknown_td_type_change_id:${noblePhantasmVariantKey(variant.ref)}:${String(linkedId)}`,
        );
      sets.union(noblePhantasmVariantKey(variant.ref), linkedKey);
    }

  const primaryByForm = new Map(
    forms.flatMap((form) => {
      const np = uniquePrimaryNp(form);
      return np ? [[actorFormKey(form.id), rawRef(form, np)] as const] : [];
    }),
  );
  const rootInitialRefs = forms
    .filter(({ initial }) => initial)
    .flatMap((form) => {
      const ref = primaryByForm.get(actorFormKey(form.id));
      return ref ? [ref] : [];
    });
  for (const ref of rootInitialRefs.slice(1))
    sets.union(noblePhantasmVariantKey(rootInitialRefs[0]!), noblePhantasmVariantKey(ref));

  const operations = new Map<AtlasFunction, EffectExecutionOperation[]>();
  const transitions: NoblePhantasmVariantNormalization['transitions'] = [];
  const addTransform = (transition: {
    from: RawActorForm;
    target: RawActorForm;
    fn: AtlasFunction;
    sourceKind: 'skill' | 'passive' | 'noblePhantasm';
    sourceId: string;
    effectOccurrenceId: string;
    hasVariantSelection: boolean;
  }) => {
    const targetRef = primaryByForm.get(actorFormKey(transition.target.id));
    if (!targetRef)
      throw new TypeError(`missing_form_base_variant:${actorFormKey(transition.target.id)}`);
    const selfRoute = {
      target: 'sourceActor' as const,
      contributionScope: 'personal' as const,
      eligibility: {
        kind: 'requiredRecipient' as const,
        recipient: 'attacker' as const,
        onMissing: 'ignore' as const,
        onMismatch: 'ignore' as const,
      },
    };
    const transformOperations: EffectExecutionOperation[] = [
      { kind: 'transformActorForm', route: selfRoute, targetFormId: transition.target.id },
    ];
    if (!transition.hasVariantSelection)
      transformOperations.push({
        kind: 'selectNoblePhantasmVariant',
        route: selfRoute,
        variant: targetRef,
      });
    operations.set(transition.fn, transformOperations);
    const rawTarget = transition.fn.svals?.[0]?.Target;
    transitions.push({
      from: transition.from.id,
      to: transition.target.id,
      direction:
        transition.from.id.actorId !== String(input.servant.id) || rawTarget === 1
          ? 'reverse'
          : 'forward',
      sourceKind: transition.sourceKind,
      sourceId: transition.sourceId,
      effectOccurrenceId: transition.effectOccurrenceId,
    });
    if (rootInitialRefs[0])
      sets.union(noblePhantasmVariantKey(rootInitialRefs[0]), noblePhantasmVariantKey(targetRef));
  };
  for (const form of forms)
    for (const skill of [...form.skills, ...form.passives]) {
      const transforms = new Map<string, { form: RawActorForm; fn: AtlasFunction }>();
      for (const fn of skill.functions ?? []) {
        const target = transformTarget(fn);
        if (!target) continue;
        const targetForm = formByKey.get(actorFormKey(target));
        if (!targetForm) throw new TypeError(`unknown_actor_form:${actorFormKey(target)}`);
        transforms.set(choiceKey(functionChoice(fn)), { form: targetForm, fn });
      }
      const selectionKeys = new Set<string>();
      for (const fn of skill.functions ?? []) {
        const choice = functionChoice(fn);
        const transform = transforms.get(choiceKey(choice));
        const selectionForm = transform?.form ?? form;
        const selection = selectedVariant(selectionForm, fn);
        if (!selection) continue;
        selectionKeys.add(choiceKey(choice));
        const ref = rawRef(selectionForm, selection.variant);
        const stateTraits = (selection.suffixBuff.vals ?? []).flatMap((trait) => {
          const name = stateTraitName(trait, input.traitNameById);
          return name ? [name] : [];
        });
        operations.set(fn, [
          {
            kind: 'selectNoblePhantasmVariant',
            route: {
              target: 'sourceActor',
              contributionScope: 'personal',
              eligibility: {
                kind: 'requiredRecipient',
                recipient: 'attacker',
                onMissing: 'ignore',
                onMismatch: 'ignore',
              },
            },
            variant: ref,
          },
          ...stateTraits.map((trait): EffectExecutionOperation => ({
            kind: 'contextMutation',
            mutation: 'addTrait',
            scope: 'recipientState',
            route: {
              target: 'sourceActor',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
            },
            trait,
            damageRelevant: true,
          })),
        ]);
      }
      for (const [key, transform] of transforms) {
        const functionIndex = (skill.functions ?? []).indexOf(transform.fn);
        const occurrence = (skill.functions ?? [])
          .slice(0, functionIndex)
          .filter(({ funcId }) => funcId === transform.fn.funcId).length;
        addTransform({
          from: form,
          target: transform.form,
          fn: transform.fn,
          sourceKind: form.passives.includes(skill) ? 'passive' : 'skill',
          sourceId: String(skill.id),
          effectOccurrenceId: `${String(transform.fn.funcId)}:${String(occurrence)}`,
          hasVariantSelection: selectionKeys.has(key),
        });
      }
    }

  for (const form of forms)
    for (const np of eligibleNps(form)) {
      if (typeof np.id !== 'number') continue;
      for (const [functionIndex, fn] of (np.functions ?? []).entries()) {
        const target = transformTarget(fn);
        if (!target) continue;
        const targetForm = formByKey.get(actorFormKey(target));
        if (!targetForm) throw new TypeError(`unknown_actor_form:${actorFormKey(target)}`);
        const occurrence = (np.functions ?? [])
          .slice(0, functionIndex)
          .filter(({ funcId }) => funcId === fn.funcId).length;
        addTransform({
          from: form,
          target: targetForm,
          fn,
          sourceKind: 'noblePhantasm',
          sourceId: String(np.id),
          effectOccurrenceId: `${String(fn.funcId)}:${String(occurrence)}`,
          hasVariantSelection: false,
        });
      }
    }

  const graph = assembleActorFormGraph({
    servant: input.servant,
    forms,
    variants,
    sets,
    rootInitialRefs,
    primaryByForm,
    variantByKey,
  });
  return {
    ...graph,
    transitions,
    canonicalOperationsByFunction: operations,
    variantStateTraits: new Set(
      [...operations.values()].flatMap((items) =>
        items.flatMap((operation) =>
          operation.kind === 'contextMutation' && operation.mutation === 'addTrait'
            ? [operation.trait]
            : [],
        ),
      ),
    ),
  };
}
