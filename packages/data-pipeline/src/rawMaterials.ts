type Row = Record<string, unknown>;
export type RawMaterialStep = { itemIds: number[]; itemNums: number[]; qp: number };
export type RawServantMaterials = {
  ascensionMaterials: Record<string, RawMaterialStep>;
  skillMaterials: Record<string, RawMaterialStep>;
  appendSkillMaterials: Record<string, RawMaterialStep>;
};

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`raw_materials:expected_array:${path}`);
  return value.map((row: unknown, index): Row => {
    if (row === null || Array.isArray(row) || typeof row !== 'object')
      throw new TypeError(`raw_materials:expected_object:${path}:${index}`);
    return row as Row;
  });
}

function integer(row: Row, key: string, path: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`raw_materials:invalid_integer:${path}.${key}`);
  return value;
}

function byId(value: unknown, path: string): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const row of rows(value, path)) {
    const id = integer(row, 'id', path);
    if (result.has(id)) throw new TypeError(`raw_materials:duplicate_id:${path}:${id}`);
    result.set(id, row);
  }
  return result;
}

function step(row: Row, path: string, items: ReadonlyMap<number, Row>): RawMaterialStep {
  if (!Array.isArray(row.itemIds) || !Array.isArray(row.itemNums))
    throw new TypeError(`raw_materials:invalid_items:${path}`);
  if (row.itemIds.length !== row.itemNums.length)
    throw new TypeError(`raw_materials:unequal_item_lengths:${path}`);
  const itemIds = row.itemIds.map((value: unknown, index): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || !items.has(value))
      throw new TypeError(`raw_materials:unknown_item:${path}:${index}`);
    return value;
  });
  const itemNums = row.itemNums.map((value: unknown, index): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
      throw new TypeError(`raw_materials:invalid_amount:${path}:${index}`);
    return value;
  });
  const qp = integer(row, 'qp', path);
  if (qp < 0) throw new TypeError(`raw_materials:invalid_qp:${path}`);
  return { itemIds, itemNums, qp };
}

function group(
  value: unknown,
  path: string,
  ownerKey: string,
  levelKey: string,
  items: ReadonlyMap<number, Row>,
  excludedLevel?: number,
): Map<number, Record<string, RawMaterialStep>> {
  const result = new Map<number, Record<string, RawMaterialStep>>();
  for (const row of rows(value, path)) {
    const owner = integer(row, ownerKey, path);
    const level = integer(row, levelKey, `${path}:${owner}`);
    if (level < 0) throw new TypeError(`raw_materials:invalid_level:${path}:${owner}:${level}`);
    if (level === excludedLevel) {
      const excluded = step(row, `${path}:${owner}:${level}`, items);
      if (
        excluded.itemIds.length !== 1 ||
        excluded.itemIds[0] !== 7999 ||
        excluded.itemNums[0] !== 1
      )
        throw new TypeError(`raw_materials:unknown_excluded_ascension_step:${owner}`);
      continue;
    }
    const stages = result.get(owner) ?? {};
    const key = String(level);
    if (key in stages)
      throw new TypeError(`raw_materials:duplicate_level:${path}:${owner}:${level}`);
    stages[key] = step(row, `${path}:${owner}:${level}`, items);
    result.set(owner, stages);
  }
  return result;
}

/** Independent raw material joins for published servants. */
export function deriveRawServantMaterials(input: {
  rawServants: unknown;
  rawItems: unknown;
  rawCombineLimits: unknown;
  rawCombineSkills: unknown;
  rawCombineAppendSkills: unknown;
  publishedIds: readonly number[];
}): Map<number, RawServantMaterials> {
  const servants = byId(input.rawServants, 'mstSvt');
  const items = byId(input.rawItems, 'mstItem');
  // Level 4 is a known invalid ascension row in the current raw schema.
  const ascension = group(input.rawCombineLimits, 'mstCombineLimit', 'id', 'svtLimit', items, 4);
  const skills = group(input.rawCombineSkills, 'mstCombineSkill', 'id', 'skillLv', items);
  const append = group(
    input.rawCombineAppendSkills,
    'mstCombineAppendPassiveSkill',
    'svtId',
    'skillLv',
    items,
  );
  for (const row of rows(input.rawCombineAppendSkills, 'mstCombineAppendPassiveSkill'))
    if (integer(row, 'num', 'mstCombineAppendPassiveSkill') !== 0)
      throw new TypeError('raw_materials:unsupported_append_skill_number');
  const result = new Map<number, RawServantMaterials>();
  for (const id of input.publishedIds) {
    if (!Number.isSafeInteger(id) || id < 0 || result.has(id))
      throw new TypeError(`raw_materials:invalid_published_id:${id}`);
    const servant = servants.get(id);
    if (!servant) throw new TypeError(`raw_materials:missing_servant:${id}`);
    result.set(id, {
      ascensionMaterials: ascension.get(integer(servant, 'combineLimitId', `mstSvt:${id}`)) ?? {},
      skillMaterials: skills.get(integer(servant, 'combineSkillId', `mstSvt:${id}`)) ?? {},
      appendSkillMaterials: append.get(id) ?? {},
    });
  }
  return result;
}
