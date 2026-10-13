/** Inventory raw input before any consumer filters out rows or fields. */
export type RawFieldInventory = {
  path: string;
  occurrences: number;
  types: string[];
  examples: string[];
  values?: string[];
};

export type RawTableInventory = {
  table: string;
  rows: number;
  fields: RawFieldInventory[];
};

export type RawInventory = { tables: RawTableInventory[] };

export type RawInventoryDifference = {
  kind:
    | 'newTable'
    | 'removedTable'
    | 'rowCountChanged'
    | 'newField'
    | 'removedField'
    | 'newType'
    | 'removedType'
    | 'newValue'
    | 'removedValue';
  table: string;
  path?: string;
  value?: string;
};

const TABLE_PATH = /^master\/([A-Za-z][A-Za-z0-9_]*)\.json$/;
const MAX_DEPTH = 24;
const MAX_NODES = 10_000_000;
const MAX_TRACKED_VALUES = 1024;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('raw_inventory:nonfinite_number');
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'object')
    return typeof value;
  throw new TypeError(`raw_inventory:invalid_value:${typeof value}`);
}

function rowExample(row: unknown, index: number): string {
  if (row !== null && !Array.isArray(row) && typeof row === 'object') {
    const record = row as Record<string, unknown>;
    for (const field of ['id', 'svtId', 'skillId', 'treasureDeviceId', 'equipId']) {
      const value = record[field];
      if (typeof value === 'number' && Number.isSafeInteger(value)) return `${field}:${value}`;
    }
  }
  return `row:${index}`;
}

/** Exact value tracking is opt-in for fields whose numeric/string meaning is known. */
export function scanRawTables(
  tables: ReadonlyMap<string, unknown>,
  trackedValuePaths: ReadonlySet<string> = new Set(),
): RawInventory {
  let nodes = 0;
  const output: RawTableInventory[] = [];
  for (const [tablePath, rows] of [...tables].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    const match = TABLE_PATH.exec(tablePath);
    if (!match) {
      if (tablePath.startsWith('catalog/'))
        throw new TypeError(`raw_inventory:catalog_requires_separate_scan:${tablePath}`);
      throw new TypeError(`raw_inventory:unexpected_entry:${tablePath}`);
    }
    if (!Array.isArray(rows)) throw new TypeError(`raw_inventory:expected_array:${tablePath}`);
    const table = match[1]!;
    const fields = new Map<
      string,
      {
        occurrences: number;
        types: Set<string>;
        examples: Set<string>;
        values?: Set<string>;
      }
    >();
    const visit = (value: unknown, path: string, example: string, depth: number): void => {
      nodes += 1;
      if (nodes > MAX_NODES) throw new RangeError('raw_inventory:node_limit');
      if (depth > MAX_DEPTH) throw new RangeError(`raw_inventory:depth_limit:${table}:${path}`);
      const type = describe(value);
      let field = fields.get(path);
      if (!field) {
        field = { occurrences: 0, types: new Set(), examples: new Set() };
        fields.set(path, field);
      }
      field.occurrences += 1;
      field.types.add(type);
      if (field.examples.size < 3) field.examples.add(example);
      if (trackedValuePaths.has(`${table}:${path}`)) {
        if (type !== 'integer' && type !== 'string')
          throw new TypeError(`raw_inventory:invalid_tracked_value:${table}:${path}`);
        const values = field.values ?? new Set<string>();
        values.add(String(value));
        if (values.size > MAX_TRACKED_VALUES)
          throw new RangeError(`raw_inventory:tracked_value_limit:${table}:${path}`);
        field.values = values;
      }
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry, `${path}[]`, example, depth + 1);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          if (!key || key.includes('\0'))
            throw new TypeError(`raw_inventory:invalid_field:${table}`);
          visit(nested, `${path}.${key}`, example, depth + 1);
        }
      }
    };
    rows.forEach((row: unknown, index: number) => visit(row, '$[]', rowExample(row, index), 0));
    output.push({
      table,
      rows: rows.length,
      fields: [...fields]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([path, item]) => ({
          path,
          occurrences: item.occurrences,
          types: [...item.types].sort(),
          examples: [...item.examples],
          ...(item.values ? { values: [...item.values].sort() } : {}),
        })),
    });
  }
  return { tables: output };
}

export function diffRawInventory(
  baseline: RawInventory,
  current: RawInventory,
): RawInventoryDifference[] {
  const differences: RawInventoryDifference[] = [];
  const before = new Map(baseline.tables.map((table) => [table.table, table]));
  const after = new Map(current.tables.map((table) => [table.table, table]));
  for (const table of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldTable = before.get(table);
    const newTable = after.get(table);
    if (!oldTable || !newTable) {
      differences.push({ kind: oldTable ? 'removedTable' : 'newTable', table });
      continue;
    }
    if (oldTable.rows !== newTable.rows)
      differences.push({
        kind: 'rowCountChanged',
        table,
        value: `${oldTable.rows}->${newTable.rows}`,
      });
    const oldFields = new Map(oldTable.fields.map((field) => [field.path, field]));
    const newFields = new Map(newTable.fields.map((field) => [field.path, field]));
    for (const path of [...new Set([...oldFields.keys(), ...newFields.keys()])].sort()) {
      const oldField = oldFields.get(path);
      const newField = newFields.get(path);
      if (!oldField || !newField) {
        differences.push({ kind: oldField ? 'removedField' : 'newField', table, path });
        continue;
      }
      for (const type of newField.types)
        if (!oldField.types.includes(type))
          differences.push({ kind: 'newType', table, path, value: type });
      for (const type of oldField.types)
        if (!newField.types.includes(type))
          differences.push({ kind: 'removedType', table, path, value: type });
      for (const value of newField.values ?? [])
        if (!oldField.values?.includes(value))
          differences.push({ kind: 'newValue', table, path, value });
      for (const value of oldField.values ?? [])
        if (!newField.values?.includes(value))
          differences.push({ kind: 'removedValue', table, path, value });
    }
  }
  return differences;
}
