import type { EffectExecutionOperation, NoblePhantasmVariantRef } from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasNp, AtlasServant, AtlasTraitRef } from './atlasContract';

const tdTypeChangeIndex = new Map([
  ['tdTypeChangeArts', 1],
  ['tdTypeChangeBuster', 2],
  ['tdTypeChangeQuick', 3],
]);

type RawVariant = { form: AtlasServant; np: AtlasNp; ref: NoblePhantasmVariantRef };
type RawVariantGroup = {
  id: string;
  baseVariant: NoblePhantasmVariantRef;
  variants: RawVariant[];
};

export interface NoblePhantasmVariantNormalization {
  actorForms: { id: string; name: string }[];
  baseNoblePhantasmGroupId: string | null;
  groups: RawVariantGroup[];
  canonicalOperationsByFunction: ReadonlyMap<AtlasFunction, readonly EffectExecutionOperation[]>;
  variantStateTraits: ReadonlySet<string>;
}

function functionChoice(
  fn: AtlasFunction,
): { family: 'actSet' | 'actSelectIndex'; candidate: number } | null {
  const parameters = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap(
    (values) => values ?? [],
  );
  const values = (key: 'ActSet' | 'ActSelectIndex') => [
    ...new Set(
      parameters.flatMap((parameter) =>
        typeof parameter[key] === 'number' ? [parameter[key]] : [],
      ),
    ),
  ];
  const actSet = values('ActSet');
  const actSelect = values('ActSelectIndex');
  if (actSet.length === 1 && actSelect.length === 0)
    return { family: 'actSet', candidate: actSet[0]! };
  if (actSelect.length === 1 && actSet.length === 0)
    return { family: 'actSelectIndex', candidate: actSelect[0]! };
  if (actSet.length > 0 || actSelect.length > 0)
    throw new TypeError(`ambiguous_activation_choice:${String(fn.funcId ?? 'missing')}`);
  return null;
}

function choiceKey(choice: ReturnType<typeof functionChoice>): string {
  return choice ? `${choice.family}:${String(choice.candidate)}` : 'automatic';
}

function transformTarget(fn: AtlasFunction): number | null {
  if (fn.funcType !== 'transformServant') return null;
  const values = [
    ...new Set(
      [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
        .flatMap((parameters) => parameters ?? [])
        .flatMap((parameter) => (typeof parameter.Value === 'number' ? [parameter.Value] : [])),
    ),
  ];
  if (values.length !== 1)
    throw new TypeError(`ambiguous_actor_form_transition:${String(fn.funcId ?? 'missing')}`);
  return values[0]!;
}

function servantFunctions(servant: AtlasServant): AtlasFunction[] {
  return [...(servant.skills ?? []), ...(servant.classPassive ?? [])].flatMap(
    (skill) => skill.functions ?? [],
  );
}

function reachableForms(
  servant: AtlasServant,
  formById: ReadonlyMap<number, AtlasServant>,
): AtlasServant[] {
  const result: AtlasServant[] = [];
  const pending = [servant];
  const seen = new Set<number>();
  while (pending.length > 0) {
    const form = pending.shift()!;
    if (typeof form.id !== 'number' || seen.has(form.id)) continue;
    seen.add(form.id);
    result.push(form);
    for (const fn of servantFunctions(form)) {
      const targetId = transformTarget(fn);
      if (targetId === null) continue;
      const target = formById.get(targetId);
      if (!target) throw new TypeError(`unknown_actor_form:${String(targetId)}`);
      pending.push(target);
    }
  }
  return result;
}

function uniquePrimaryNp(form: AtlasServant): AtlasNp | null {
  const candidates = (form.noblePhantasms ?? []).filter((np) => typeof np.id === 'number');
  if (candidates.length === 0) return null;
  const attackCandidates = candidates.filter((np) =>
    (np.functions ?? []).some((fn) => fn.funcType?.startsWith('damageNp')),
  );
  const eligible = attackCandidates.length > 0 ? attackCandidates : candidates;
  const priority = Math.max(...eligible.map((np) => np.priority ?? 0));
  const selected = eligible.filter((np) => (np.priority ?? 0) === priority);
  if (selected.length !== 1)
    throw new TypeError(`ambiguous_base_noble_phantasm:${String(form.id ?? 'missing')}`);
  return selected[0]!;
}

function rawRef(form: AtlasServant, np: AtlasNp): NoblePhantasmVariantRef {
  if (typeof form.id !== 'number' || typeof np.id !== 'number')
    throw new TypeError('incomplete_noble_phantasm_variant_identity');
  return { actorFormId: String(form.id), noblePhantasmId: String(np.id) };
}

function rawKey(ref: NoblePhantasmVariantRef): string {
  return `${ref.actorFormId}:${ref.noblePhantasmId}`;
}

function isAttackNp(np: AtlasNp): boolean {
  return (np.functions ?? []).some((fn) => fn.funcType?.startsWith('damageNp'));
}

function stateTraitName(
  trait: AtlasTraitRef,
  traitNameById: ReadonlyMap<number, string>,
): string | null {
  if (trait.id === 3004) return null;
  if (trait.name && trait.name !== 'unknown') return trait.name;
  if (typeof trait.id === 'number')
    return traitNameById.get(trait.id) ?? `traitId:${String(trait.id)}`;
  return null;
}

class VariantSets {
  readonly #parent = new Map<string, string>();

  add(key: string): void {
    if (!this.#parent.has(key)) this.#parent.set(key, key);
  }

  find(key: string): string {
    const parent = this.#parent.get(key);
    if (!parent) throw new TypeError(`unknown_variant_identity:${key}`);
    if (parent === key) return key;
    const root = this.find(parent);
    this.#parent.set(key, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.#parent.set(rightRoot, leftRoot);
  }
}

function selectedVariant(
  form: AtlasServant,
  fn: AtlasFunction,
): { variant: AtlasNp; suffixBuff: NonNullable<AtlasFunction['buffs']>[number] } | null {
  const indexed = (fn.buffs ?? []).flatMap((buff) => {
    const index = buff.type ? tdTypeChangeIndex.get(buff.type) : undefined;
    return index === undefined ? [] : [{ index, buff }];
  });
  if (indexed.length === 0) return null;
  if (indexed.length !== 1)
    throw new TypeError(`ambiguous_td_type_change_index:${String(fn.funcId ?? 'missing')}`);
  const index = indexed[0]!.index;
  const bases = (form.noblePhantasms ?? []).filter(
    (np) => (np.script?.tdTypeChangeIDs?.length ?? 0) >= index,
  );
  if (bases.length === 0)
    throw new TypeError(
      `missing_td_type_change_ids:${String(form.id ?? 'missing')}:${String(index)}`,
    );
  const maximumPriority = Math.max(...bases.map((np) => np.priority ?? 0));
  const currentBases = bases.filter((np) => (np.priority ?? 0) === maximumPriority);
  if (currentBases.length !== 1)
    throw new TypeError(
      `ambiguous_td_type_change_base:${String(form.id ?? 'missing')}:${String(index)}`,
    );
  const selectedId = currentBases[0]!.script!.tdTypeChangeIDs![index - 1];
  const matches = (form.noblePhantasms ?? []).filter((np) => np.id === selectedId);
  if (matches.length !== 1)
    throw new TypeError(
      `unresolved_td_type_change_variant:${String(form.id ?? 'missing')}:${String(selectedId ?? 'missing')}`,
    );
  return { variant: matches[0]!, suffixBuff: indexed[0]!.buff };
}

export function normalizeNoblePhantasmVariants(input: {
  servant: AtlasServant;
  allServants: readonly AtlasServant[];
  traitNameById: ReadonlyMap<number, string>;
}): NoblePhantasmVariantNormalization {
  if (typeof input.servant.id !== 'number') throw new TypeError('missing_actor_form_identity');
  const formById = new Map(
    input.allServants.flatMap((form) =>
      typeof form.id === 'number' ? ([[form.id, form]] as const) : [],
    ),
  );
  const forms = reachableForms(input.servant, formById);
  const variants = forms.flatMap((form) =>
    (form.noblePhantasms ?? []).flatMap((np) =>
      typeof np.id === 'number' ? [{ form, np, ref: rawRef(form, np) }] : [],
    ),
  );
  const variantByKey = new Map(variants.map((variant) => [rawKey(variant.ref), variant]));
  const sets = new VariantSets();
  for (const variant of variants) sets.add(rawKey(variant.ref));
  for (const variant of variants)
    for (const linkedId of variant.np.script?.tdTypeChangeIDs ?? []) {
      const linkedKey = rawKey({
        actorFormId: variant.ref.actorFormId,
        noblePhantasmId: String(linkedId),
      });
      if (!variantByKey.has(linkedKey))
        throw new TypeError(`unknown_td_type_change_id:${rawKey(variant.ref)}:${String(linkedId)}`);
      sets.union(rawKey(variant.ref), linkedKey);
    }

  const operations = new Map<AtlasFunction, EffectExecutionOperation[]>();
  const baseNp = uniquePrimaryNp(input.servant);
  const baseRef = baseNp ? rawRef(input.servant, baseNp) : null;
  for (const skill of [...(input.servant.skills ?? []), ...(input.servant.classPassive ?? [])]) {
    const transforms = new Map<string, { form: AtlasServant; fn: AtlasFunction }>();
    for (const fn of skill.functions ?? []) {
      const targetId = transformTarget(fn);
      if (targetId === null) continue;
      const targetForm = formById.get(targetId);
      if (!targetForm) throw new TypeError(`unknown_actor_form:${String(targetId)}`);
      transforms.set(choiceKey(functionChoice(fn)), { form: targetForm, fn });
    }
    for (const fn of skill.functions ?? []) {
      const choice = functionChoice(fn);
      const transform = transforms.get(choiceKey(choice));
      const selectionForm = transform?.form ?? input.servant;
      const selection = selectedVariant(selectionForm, fn);
      if (!selection) continue;
      const ref = rawRef(selectionForm, selection.variant);
      if (transform)
        operations.set(transform.fn, [
          { kind: 'transformActorForm', targetFormId: ref.actorFormId },
        ]);
      if (baseRef) sets.union(rawKey(baseRef), rawKey(ref));
      const stateTraits = (selection.suffixBuff.vals ?? []).flatMap((trait) => {
        const name = stateTraitName(trait, input.traitNameById);
        return name ? [name] : [];
      });
      operations.set(fn, [
        { kind: 'selectNoblePhantasmVariant', variant: ref },
        ...stateTraits.map((trait): EffectExecutionOperation => ({
          kind: 'contextMutation',
          mutation: 'addTrait',
          scope: 'recipientState',
          targetPolicy: 'sourceSelf',
          contributionScope: 'personal',
          trait,
          damageRelevant: true,
        })),
      ]);
    }
  }

  const byRoot = new Map<string, RawVariant[]>();
  for (const variant of variants) {
    const root = sets.find(rawKey(variant.ref));
    byRoot.set(root, [...(byRoot.get(root) ?? []), variant]);
  }
  const groups = [...byRoot.values()]
    .map((members) => {
      const sorted = [...members].sort((left, right) =>
        rawKey(left.ref).localeCompare(rawKey(right.ref)),
      );
      const attackMembers = sorted.filter(({ np }) => isAttackNp(np));
      const baseCandidates = attackMembers.length > 0 ? attackMembers : sorted;
      const primary = baseCandidates.reduce((selected, candidate) =>
        (candidate.np.priority ?? 0) > (selected.np.priority ?? 0) ? candidate : selected,
      );
      const memberBase = rawRef(primary.form, primary.np);
      return {
        id: rawKey(memberBase),
        baseVariant: memberBase,
        variants: sorted,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const baseGroup = baseRef
    ? groups.find((group) =>
        group.variants.some((variant) => rawKey(variant.ref) === rawKey(baseRef)),
      )
    : undefined;
  if (baseRef && !baseGroup) throw new TypeError(`missing_base_variant_group:${rawKey(baseRef)}`);
  return {
    actorForms: forms.map((form) => ({ id: String(form.id), name: form.name ?? '不明な形態' })),
    baseNoblePhantasmGroupId: baseGroup?.id ?? null,
    groups,
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
