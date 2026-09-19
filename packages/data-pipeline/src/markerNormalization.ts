import type { EffectExecutionOperation } from '@fgo-lab/master-data';
import type { AtlasFunction } from './atlasContract';
import { normalizeTargetPolicy } from './executionSemantics';
import { stateMutationTraitName } from './targetStateNormalization';

/** Chaldea getTraits / getBuffTraits: Value and the instance's traits are distinct. */
export function normalizeMarkerInstance(
  fn: AtlasFunction,
  names: ReadonlyMap<number, string>,
  constant: boolean,
): EffectExecutionOperation[] | null {
  if (fn.funcType === 'subState') {
    const cells = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap(
      (row) => row ?? [],
    );
    const traits = (fn.traitVals ?? []).map((trait) => stateMutationTraitName(trait, names)!);
    if (
      !traits.length ||
      (fn.traitVals ?? []).some((trait) => trait.negative) ||
      cells.some(
        (cell) =>
          (cell.Value !== undefined && cell.Value !== 0) ||
          Object.keys(cell).some(
            (key) => !['Rate', 'Value', 'ForceSubState', 'HideMiss', 'HideNoEffect'].includes(key),
          ),
      )
    )
      return null;
    return [
      {
        kind: 'buffInstanceMutation',
        mutation: 'remove',
        recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
        traits,
        lifetime: 'active',
      },
    ];
  }
  if (
    !['addState', 'addStateShort'].includes(fn.funcType ?? '') ||
    fn.buffs?.length !== 1 ||
    fn.buffs[0]?.type !== 'addIndividuality'
  )
    return null;
  const buff = fn.buffs[0];
  if (!Number.isSafeInteger(buff.id)) return null;
  const cells = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap((row) => row ?? []);
  const first = cells[0];
  if (!first || !Number.isSafeInteger(first.Value)) return null;
  // These cells describe a stable instance during the bounded NP program. Finite-use,
  // family-linked and battle-point activation cells retain their unresolved contract.
  const keys = new Set([
    'Rate',
    'Turn',
    'Count',
    'Value',
    'HideMiss',
    'HideNoEffect',
    'ShowState',
    'ShowQuestNoEffect',
    'ForceAddState',
    'OnField',
    'UnSubState',
    'AddIndividualty',
    'AddIndividualtyList',
    'AddLinkageTargetIndividualty',
    'SameBuffLimitTargetIndividuality',
    'SameBuffLimitNum',
  ]);
  if (
    cells.some((cell) => cell.Count !== -1 || Object.keys(cell).some((key) => !keys.has(key))) ||
    Object.keys(buff.script ?? {}).some(
      (key) => !['ProgressSelfTurn', 'INDIVIDUALITIE', 'INDIVIDUALITIE_AND'].includes(key),
    )
  )
    return null;
  const identity = (id: number) => stateMutationTraitName({ id }, names)!;
  const signature = (cell: typeof first) =>
    JSON.stringify([
      cell.Value,
      cell.AddIndividualtyList ??
        (cell.AddIndividualty === undefined ? [] : [cell.AddIndividualty]),
      cell.OnField ?? 0,
      cell.UnSubState ?? 0,
      cell.SameBuffLimitTargetIndividuality,
      cell.SameBuffLimitNum,
    ]);
  if (cells.some((cell) => signature(cell) !== signature(first))) return null;
  const extra =
    first.AddIndividualtyList ??
    (first.AddIndividualty === undefined ? [] : [first.AddIndividualty]);
  if (!Array.isArray(extra) || extra.some((id) => !Number.isSafeInteger(id))) return null;
  const traits = [
    ...new Set([
      `buffId:${buff.id}`,
      ...(buff.vals ?? []).map((trait) => stateMutationTraitName(trait, names)!),
      ...extra.map((id) => identity(id)),
    ]),
  ];
  const limit = first.SameBuffLimitNum;
  const limitTrait = first.SameBuffLimitTargetIndividuality;
  if (
    (limit !== undefined || limitTrait !== undefined) &&
    (!Number.isSafeInteger(limit) || Number(limit) <= 0 || !Number.isSafeInteger(limitTrait))
  )
    return null;
  return [
    {
      kind: 'buffInstanceMutation',
      mutation: 'grant',
      recipient: normalizeTargetPolicy(fn.funcTargetType ?? ''),
      traits,
      lifetime: constant ? 'constant' : 'active',
      marker: {
        actorTrait: identity(Number(first.Value)),
        buffIdentity: `buffId:${buff.id}`,
        removable: first.UnSubState !== 1,
        onField: first.OnField === 1,
        recipientSide:
          fn.funcTargetTeam === 'player'
            ? 'ally'
            : fn.funcTargetTeam === 'enemy'
              ? 'opponent'
              : 'both',
      },
      ...(limit === undefined
        ? {}
        : { grantLimit: { trait: identity(Number(limitTrait)), maximum: Number(limit) } }),
    },
  ];
}
