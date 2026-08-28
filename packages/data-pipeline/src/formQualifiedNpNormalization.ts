import { actorFormKey } from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasNp } from './atlasContract';
import { eligibleNps, type RawActorForm } from './rawActorFormExtraction';

const tdTypeChangeIndex = new Map([
  ['tdTypeChangeArts', 1],
  ['tdTypeChangeBuster', 2],
  ['tdTypeChangeQuick', 3],
]);

export class VariantSets {
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

export function selectedVariant(
  form: RawActorForm,
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
  const bases = eligibleNps(form).filter(
    (np) => (np.script?.tdTypeChangeIDs?.length ?? 0) >= index,
  );
  if (bases.length === 0)
    throw new TypeError(`missing_td_type_change_ids:${actorFormKey(form.id)}:${String(index)}`);
  const maximumPriority = Math.max(...bases.map((np) => np.priority ?? 0));
  const currentBases = bases.filter((np) => (np.priority ?? 0) === maximumPriority);
  if (currentBases.length !== 1)
    throw new TypeError(`ambiguous_td_type_change_base:${actorFormKey(form.id)}:${String(index)}`);
  const selectedId = currentBases[0]!.script!.tdTypeChangeIDs![index - 1];
  const matches = eligibleNps(form).filter((np) => np.id === selectedId);
  if (matches.length !== 1)
    throw new TypeError(
      `unresolved_td_type_change_variant:${actorFormKey(form.id)}:${String(selectedId ?? 'missing')}`,
    );
  return { variant: matches[0]!, suffixBuff: indexed[0]!.buff };
}
