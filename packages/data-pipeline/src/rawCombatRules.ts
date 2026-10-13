/** Raw Atlas IDs are interpreted here; calc-core only receives ratios. */
export const COMBAT_CLASS_IDS = {
  saber: 1,
  archer: 2,
  lancer: 3,
  rider: 4,
  caster: 5,
  assassin: 6,
  berserker: 7,
  shielder: 8,
  ruler: 9,
  alterEgo: 10,
  avenger: 11,
  moonCancer: 23,
  foreigner: 25,
  pretender: 28,
  beast: 33,
  beastEresh: 38,
  unBeastOlgaMarie: 40,
} as const;

export const COMBAT_ATTRIBUTE_IDS = {
  man: 1,
  sky: 2,
  earth: 3,
  star: 4,
  beast: 5,
} as const;

export const COMBAT_CARD_IDS = { arts: 1, buster: 2, quick: 3 } as const;

export type RawCombatRules = {
  classAttackRate: Record<keyof typeof COMBAT_CLASS_IDS, number>;
  classAffinity: Record<
    keyof typeof COMBAT_CLASS_IDS,
    Record<keyof typeof COMBAT_CLASS_IDS, number>
  >;
  attributeAffinity: Record<
    keyof typeof COMBAT_ATTRIBUTE_IDS,
    Record<keyof typeof COMBAT_ATTRIBUTE_IDS, number>
  >;
  cardAttackRate: Record<keyof typeof COMBAT_CARD_IDS, number>;
  damageConstant: number;
};

type RawTableName =
  'mstClass' | 'mstClassRelation' | 'mstAttriRelation' | 'mstCard' | 'mstConstant';

const ROW_FIELDS: Record<RawTableName, readonly string[]> = {
  mstClass: [
    'relationSvtIndividuality',
    'id',
    'attri',
    'name',
    'individuality',
    'attackRate',
    'imageId',
    'iconImageId',
    'frameId',
    'priority',
    'groupType',
    'relationId',
    'supportGroup',
    'autoSelSupportType',
  ],
  mstClassRelation: ['atkClass', 'defClass', 'attackRate', 'advIconId', 'disadvIconId'],
  mstAttriRelation: ['atkAttri', 'defAttri', 'attackRate'],
  mstCard: [
    'individuality',
    'id',
    'num',
    'adjustAtk',
    'adjustTdGauge',
    'adjustCritical',
    'addAtk',
    'addTdGauge',
    'addCritical',
  ],
  mstConstant: ['name', 'value', 'createdAt'],
};
const TEXT_FIELDS = new Set(['name']);

function rows(input: unknown, table: RawTableName): Record<string, unknown>[] {
  if (!Array.isArray(input)) throw new TypeError(`${table}:expected_array`);
  return input.map((entry: unknown, index: number) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== 'object')
      throw new TypeError(`${table}[${index}]:expected_row`);
    const row = entry as Record<string, unknown>;
    const allowed = ROW_FIELDS[table];
    for (const field of Object.keys(row))
      if (!allowed.includes(field))
        throw new TypeError(`${table}[${index}]:unknown_field:${field}`);
    for (const field of allowed)
      if (!(field in row)) throw new TypeError(`${table}[${index}]:missing_field:${field}`);
    for (const field of allowed) {
      const value = row[field];
      if (
        field === 'relationSvtIndividuality' ||
        (table === 'mstCard' && field === 'individuality')
      ) {
        if (!Array.isArray(value) || !value.every(Number.isSafeInteger))
          throw new TypeError(`${table}[${index}]:invalid_integer_array:${field}`);
      } else if (TEXT_FIELDS.has(field)) {
        if (typeof value !== 'string' || !value)
          throw new TypeError(`${table}[${index}]:invalid_string:${field}`);
      } else if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new TypeError(`${table}[${index}]:invalid_integer:${field}`);
      }
    }
    return row;
  });
}

function integer(row: Record<string, unknown>, field: string, path: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`${path}:invalid_integer:${field}`);
  return value;
}

function uniqueMap(
  source: readonly Record<string, unknown>[],
  path: RawTableName,
  key: (row: Record<string, unknown>, path: string) => string,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  source.forEach((row, index) => {
    const rowPath = `${path}[${index}]`;
    const id = key(row, rowPath);
    if (result.has(id)) throw new TypeError(`${path}:duplicate_key:${id}`);
    result.set(id, row);
  });
  return result;
}

function positivePermille(row: Record<string, unknown>, field: string, path: string): number {
  const value = integer(row, field, path);
  if (value <= 0) throw new RangeError(`${path}:nonpositive_rate:${field}`);
  return value / 1000;
}

function requireRow(map: Map<string, Record<string, unknown>>, key: string, table: string) {
  const row = map.get(key);
  if (!row) throw new TypeError(`${table}:missing_key:${key}`);
  return row;
}

/** Rejects missing, duplicate and unknown fields before any coefficient enters a master. */
export function normalizeRawCombatRules(input: unknown): RawCombatRules {
  if (input === null || Array.isArray(input) || typeof input !== 'object')
    throw new TypeError('raw_combat_rules:expected_tables');
  const tables = input as Record<RawTableName, unknown>;
  const names = Object.keys(ROW_FIELDS) as RawTableName[];
  for (const key of Object.keys(tables))
    if (!names.includes(key as RawTableName))
      throw new TypeError(`raw_combat_rules:unknown_table:${key}`);
  for (const name of names)
    if (!(name in tables)) throw new TypeError(`raw_combat_rules:missing_table:${name}`);
  const classes = uniqueMap(rows(tables.mstClass, 'mstClass'), 'mstClass', (row, path) =>
    String(integer(row, 'id', path)),
  );
  const classRelations = uniqueMap(
    rows(tables.mstClassRelation, 'mstClassRelation'),
    'mstClassRelation',
    (row, path) => `${integer(row, 'atkClass', path)}:${integer(row, 'defClass', path)}`,
  );
  const attributes = uniqueMap(
    rows(tables.mstAttriRelation, 'mstAttriRelation'),
    'mstAttriRelation',
    (row, path) => `${integer(row, 'atkAttri', path)}:${integer(row, 'defAttri', path)}`,
  );
  const cards = uniqueMap(
    rows(tables.mstCard, 'mstCard'),
    'mstCard',
    (row, path) => `${integer(row, 'id', path)}:${integer(row, 'num', path)}`,
  );
  const constants = uniqueMap(
    rows(tables.mstConstant, 'mstConstant'),
    'mstConstant',
    (row, path) => {
      if (typeof row.name !== 'string' || !row.name) throw new TypeError(`${path}:invalid_name`);
      return row.name;
    },
  );

  const classEntries = Object.entries(COMBAT_CLASS_IDS) as [
    keyof typeof COMBAT_CLASS_IDS,
    number,
  ][];
  const attributeEntries = Object.entries(COMBAT_ATTRIBUTE_IDS) as [
    keyof typeof COMBAT_ATTRIBUTE_IDS,
    number,
  ][];
  const cardEntries = Object.entries(COMBAT_CARD_IDS) as [keyof typeof COMBAT_CARD_IDS, number][];
  const classAttackRate = {} as RawCombatRules['classAttackRate'];
  const classAffinity = {} as RawCombatRules['classAffinity'];
  const attributeAffinity = {} as RawCombatRules['attributeAffinity'];
  const cardAttackRate = {} as RawCombatRules['cardAttackRate'];
  for (const [name, id] of classEntries) {
    const row = requireRow(classes, String(id), 'mstClass');
    // Alternate class rows may reuse an affinity table, but these canonical IDs must be direct.
    if (integer(row, 'relationId', `mstClass:${id}`) !== id)
      throw new TypeError(`mstClass:unexpected_relation_id:${id}`);
    classAttackRate[name] = positivePermille(row, 'attackRate', `mstClass:${id}`);
    const relation = {} as RawCombatRules['classAffinity'][typeof name];
    for (const [target, targetId] of classEntries) {
      const key = `${id}:${targetId}`;
      const raw = requireRow(classRelations, key, 'mstClassRelation');
      const rate = positivePermille(raw, 'attackRate', `mstClassRelation:${key}`);
      relation[target] = rate;
    }
    classAffinity[name] = relation;
  }
  for (const [name, id] of attributeEntries) {
    const relation = {} as RawCombatRules['attributeAffinity'][typeof name];
    for (const [target, targetId] of attributeEntries) {
      const key = `${id}:${targetId}`;
      const raw = requireRow(attributes, key, 'mstAttriRelation');
      const rate = positivePermille(raw, 'attackRate', `mstAttriRelation:${key}`);
      relation[target] = rate;
    }
    attributeAffinity[name] = relation;
  }
  for (const [name, id] of cardEntries) {
    const key = `${id}:1`;
    cardAttackRate[name] = positivePermille(
      requireRow(cards, key, 'mstCard'),
      'adjustAtk',
      `mstCard:${key}`,
    );
  }
  const constant = integer(
    requireRow(constants, 'ATTACK_RATE', 'mstConstant'),
    'value',
    'mstConstant:ATTACK_RATE',
  );
  if (constant <= 0 || constant > 1000)
    throw new RangeError(`mstConstant:invalid_attack_rate:${constant}`);
  return {
    classAttackRate,
    classAffinity,
    attributeAffinity,
    cardAttackRate,
    damageConstant: constant / 1000,
  };
}
