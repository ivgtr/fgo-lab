import type { AtlasFunction, AtlasFunctionValue, AtlasReferencedSkill } from './atlasContract';

export type AtlasSkillReference = { id: number; level: number };
export type AtlasPotentialCallbackReference = AtlasSkillReference & { buffType: string };

const VALUE_SETS = ['svals', 'svals2', 'svals3', 'svals4', 'svals5'] as const;
const CALLBACK_BUFF_TYPES = new Set(['attackBeforeFunction', 'fieldIndividualityChangedFunction']);

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`atlas_reference:invalid_positive_integer:${path}`);
  return value;
}

function parameterSets(fn: AtlasFunction): readonly (readonly AtlasFunctionValue[])[] {
  return VALUE_SETS.map((key) => {
    const value = fn[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new TypeError(`atlas_reference:invalid_parameter_set:${key}`);
    return value.map((cell: unknown, index): AtlasFunctionValue => {
      if (cell === null || Array.isArray(cell) || typeof cell !== 'object')
        throw new TypeError(`atlas_reference:invalid_cell:${key}:${index}`);
      return cell as AtlasFunctionValue;
    });
  });
}

/** Shared by reference discovery and effect normalization. */
export function atlasFunctionReferenceCandidates(fn: AtlasFunction): AtlasSkillReference[] {
  const callback = (fn.buffs ?? []).some((buff) => CALLBACK_BUFF_TYPES.has(buff.type ?? ''));
  const result: AtlasSkillReference[] = [];
  for (const set of parameterSets(fn))
    for (const cell of set) {
      if (cell.SkillID !== undefined)
        result.push({
          id: positiveInteger(cell.SkillID, 'SkillID'),
          level: cell.SkillLV === undefined ? 1 : positiveInteger(cell.SkillLV, 'SkillLV'),
        });
      else if (callback && cell.Value !== undefined)
        result.push({
          id: positiveInteger(cell.Value, 'Value'),
          level: cell.Value2 === undefined ? 1 : positiveInteger(cell.Value2, 'Value2'),
        });
    }
  return result;
}

/** Broad inventory of callback-like Value references; it does not assign execution semantics. */
export function atlasFunctionPotentialCallbackReferences(
  fn: AtlasFunction,
): AtlasPotentialCallbackReference[] {
  const types = [
    ...new Set(
      (fn.buffs ?? []).flatMap((buff) =>
        typeof buff.type === 'string' && /function/i.test(buff.type) ? [buff.type] : [],
      ),
    ),
  ];
  const result: AtlasPotentialCallbackReference[] = [];
  for (const set of parameterSets(fn))
    for (const cell of set)
      if (cell.Value !== undefined)
        for (const buffType of types)
          result.push({
            id: positiveInteger(cell.Value, `Value:${buffType}`),
            level:
              cell.Value2 === undefined ? 1 : positiveInteger(cell.Value2, `Value2:${buffType}`),
            buffType,
          });
  return result;
}

function functionRows(document: unknown): AtlasFunction[] {
  const result: AtlasFunction[] = [];
  let nodes = 0;
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 10_000_000) throw new RangeError('atlas_reference:node_limit');
    if (depth > 64) throw new RangeError('atlas_reference:depth_limit');
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      if ('funcId' in row) {
        if (typeof row.funcId !== 'number' || !Number.isSafeInteger(row.funcId) || row.funcId < 0)
          throw new TypeError('atlas_reference:invalid_function_id');
        result.push(row);
      }
      for (const child of Object.values(row))
        if (child !== null && typeof child === 'object') visit(child, depth + 1);
    }
  };
  visit(document, 0);
  return result;
}

export function atlasDocumentReferenceIds(document: unknown): number[] {
  const ids = new Set<number>();
  for (const fn of functionRows(document))
    for (const reference of atlasFunctionReferenceCandidates(fn)) ids.add(reference.id);
  return [...ids].sort((left, right) => left - right);
}

export function atlasDocumentPotentialCallbackInventory(document: unknown): {
  buffTypes: string[];
  skillIds: number[];
} {
  const buffTypes = new Set<string>();
  const skillIds = new Set<number>();
  for (const fn of functionRows(document))
    for (const reference of atlasFunctionPotentialCallbackReferences(fn)) {
      buffTypes.add(reference.buffType);
      skillIds.add(reference.id);
    }
  return {
    buffTypes: [...buffTypes].sort(),
    skillIds: [...skillIds].sort((left, right) => left - right),
  };
}

export async function resolveAtlasSkillReferenceClosure(input: {
  documents: readonly unknown[];
  fetchSkill: (id: number) => Promise<unknown>;
}): Promise<Map<number, AtlasReferencedSkill>> {
  const rootIds = new Set<number>(
    input.documents.flatMap((document) => atlasDocumentReferenceIds(document)),
  );
  const pending = [...rootIds].sort((left, right) => left - right);
  const skills = new Map<number, AtlasReferencedSkill>();
  const edges = new Map<number, number[]>();
  while (pending.length) {
    const id = pending.shift()!;
    if (skills.has(id)) continue;
    if (skills.size >= 1024) throw new RangeError('atlas_reference:closure_size_limit');
    const value = await input.fetchSkill(id);
    if (value === null || Array.isArray(value) || typeof value !== 'object')
      throw new TypeError(`atlas_reference:invalid_skill:${id}`);
    const skill = value as AtlasReferencedSkill;
    if (skill.id !== id || !Array.isArray(skill.functions))
      throw new TypeError(`atlas_reference:skill_identity_mismatch:${id}`);
    const childIds = atlasDocumentReferenceIds(skill);
    edges.set(id, childIds);
    skills.set(id, skill);
    for (const child of childIds)
      if (!skills.has(child) && !pending.includes(child)) pending.push(child);
    pending.sort((left, right) => left - right);
  }
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (id: number): void => {
    if (visiting.has(id)) throw new TypeError(`atlas_reference:cycle:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of edges.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of skills.keys()) visit(id);
  return skills;
}
