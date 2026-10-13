type Row = Record<string, unknown>;

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`raw_growth:expected_array:${path}`);
  return value.map((row: unknown, index): Row => {
    if (row === null || Array.isArray(row) || typeof row !== 'object')
      throw new TypeError(`raw_growth:expected_object:${path}:${index}`);
    return row as Row;
  });
}

function integer(row: Row, key: string, path: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`raw_growth:invalid_integer:${path}.${key}`);
  return value;
}

function byId(value: unknown, path: string): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const row of rows(value, path)) {
    const id = integer(row, 'id', path);
    if (result.has(id)) throw new TypeError(`raw_growth:duplicate_id:${path}:${id}`);
    result.set(id, row);
  }
  return result;
}

export type RawGrowth = {
  rarity: number;
  lvMax: number;
  atkBase: number;
  atkMax: number;
  hpBase: number;
  hpMax: number;
  atkGrowth: number[];
  hpGrowth: number[];
};

/** Independent positional growth derivation from raw tables for a selected nice roster. */
export function deriveRawGrowth(input: {
  rawServants: unknown;
  rawLimits: unknown;
  rawExperience: unknown;
  niceEnums: unknown;
  publishedIds: readonly number[];
}): Map<number, RawGrowth> {
  const servants = byId(input.rawServants, 'mstSvt');
  const limitsByServant = new Map<number, Map<number, Row>>();
  for (const row of rows(input.rawLimits, 'mstSvtLimit')) {
    const servantId = integer(row, 'svtId', 'mstSvtLimit');
    if (!servants.has(servantId)) throw new TypeError(`raw_growth:orphan_limit:${servantId}`);
    const count = integer(row, 'limitCount', `mstSvtLimit:${servantId}`);
    const limits = limitsByServant.get(servantId) ?? new Map<number, Row>();
    if (limits.has(count)) throw new TypeError(`raw_growth:duplicate_limit:${servantId}:${count}`);
    limits.set(count, row);
    limitsByServant.set(servantId, limits);
  }
  const experienceByType = new Map<number, Map<number, Row>>();
  for (const row of rows(input.rawExperience, 'mstSvtExp')) {
    const type = integer(row, 'type', 'mstSvtExp');
    const level = integer(row, 'lv', `mstSvtExp:${type}`);
    const values = experienceByType.get(type) ?? new Map<number, Row>();
    if (values.has(level)) throw new TypeError(`raw_growth:duplicate_level:${type}:${level}`);
    values.set(level, row);
    experienceByType.set(type, values);
  }
  if (
    input.niceEnums === null ||
    Array.isArray(input.niceEnums) ||
    typeof input.niceEnums !== 'object'
  )
    throw new TypeError('raw_growth:invalid_enums');
  const group = (input.niceEnums as Row).NiceSvtType;
  if (group === null || Array.isArray(group) || typeof group !== 'object')
    throw new TypeError('raw_growth:missing_type_catalog');
  const types = group as Row;
  const result = new Map<number, RawGrowth>();
  for (const id of input.publishedIds) {
    if (!Number.isSafeInteger(id) || id < 0 || result.has(id))
      throw new TypeError(`raw_growth:invalid_published_id:${id}`);
    const servant = servants.get(id);
    if (!servant) throw new TypeError(`raw_growth:missing_servant:${id}`);
    const type = types[String(integer(servant, 'type', `mstSvt:${id}`))];
    if (typeof type !== 'string' || !type) throw new TypeError(`raw_growth:unknown_type:${id}`);
    const limits = limitsByServant.get(id);
    if (!limits?.size) throw new TypeError(`raw_growth:missing_limits:${id}`);
    const highest = Math.max(...limits.keys());
    const last = limits.get(highest)!;
    const lvMax = Math.max(
      ...[...limits.values()].map((row) => integer(row, 'lvMax', `mstSvtLimit:${id}`)),
    );
    const endLevel = type === 'normal' ? 120 : type === 'heroine' ? 90 : lvMax;
    const experienceType = integer(servant, 'expType', `mstSvt:${id}`);
    const experience = experienceByType.get(experienceType);
    if (!experience) throw new TypeError(`raw_growth:missing_experience_type:${id}`);
    const atkBase = integer(last, 'atkBase', `mstSvtLimit:${id}`);
    const atkMax = integer(last, 'atkMax', `mstSvtLimit:${id}`);
    const hpBase = integer(last, 'hpBase', `mstSvtLimit:${id}`);
    const hpMax = integer(last, 'hpMax', `mstSvtLimit:${id}`);
    const atkGrowth: number[] = [];
    const hpGrowth: number[] = [];
    for (let level = 1; level <= endLevel; level++) {
      const row = experience.get(level);
      if (!row) throw new TypeError(`raw_growth:missing_level:${experienceType}:${level}`);
      const curve = integer(row, 'curve', `mstSvtExp:${experienceType}:${level}`);
      const atk = atkBase + Math.floor(((atkMax - atkBase) * curve) / 1000);
      const hp = hpBase + Math.floor(((hpMax - hpBase) * curve) / 1000);
      if (!Number.isSafeInteger(atk) || !Number.isSafeInteger(hp))
        throw new RangeError(`raw_growth:unsafe_growth:${id}:${level}`);
      atkGrowth.push(atk);
      hpGrowth.push(hp);
    }
    result.set(id, {
      rarity: integer(last, 'rarity', `mstSvtLimit:${id}`),
      lvMax,
      atkBase,
      atkMax,
      hpBase,
      hpMax,
      atkGrowth,
      hpGrowth,
    });
  }
  return result;
}
