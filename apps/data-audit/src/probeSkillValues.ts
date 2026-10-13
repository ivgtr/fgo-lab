import { isDeepStrictEqual } from 'node:util';
import { parseRawFunctionValues } from '@fgo-lab/data-pipeline';

type Row = Record<string, unknown>;

function object(value: unknown, path: string): Row {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`skill_values_probe:expected_object:${path}`);
  return value as Row;
}

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`skill_values_probe:expected_array:${path}`);
  return value.map((row: unknown, index) => object(row, `${path}:${index}`));
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`skill_values_probe:invalid_integer:${path}`);
  return value;
}

function uniqueById(value: unknown, path: string): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const row of rows(value, path)) {
    const id = integer(row.id, `${path}.id`);
    if (result.has(id)) throw new TypeError(`skill_values_probe:duplicate_id:${path}:${id}`);
    result.set(id, row);
  }
  return result;
}

function same(actual: unknown, expected: unknown, path: string): void {
  if (!isDeepStrictEqual(actual, expected))
    throw new TypeError(
      `skill_values_probe:mismatch:${path}:${JSON.stringify(actual)}:${JSON.stringify(expected)}`,
    );
}

function levelsById(value: unknown, table: string, idField: string): Map<number, Map<number, Row>> {
  const result = new Map<number, Map<number, Row>>();
  for (const row of rows(value, table)) {
    const id = integer(row[idField], `${table}.${idField}`);
    const lv = integer(row.lv, `${table}:${id}.lv`);
    const levels = result.get(id) ?? new Map<number, Row>();
    if (levels.has(lv))
      throw new TypeError(`skill_values_probe:duplicate_level:${table}:${id}:${lv}`);
    levels.set(lv, row);
    result.set(id, levels);
  }
  return result;
}

function compareEntityValues(
  entity: Row,
  levelsByEntity: Map<number, Map<number, Row>>,
  functionKindById: (id: number) => string,
  label: 'skill' | 'np',
  fields: readonly string[],
  identicalDuplicateLocations: Set<string>,
): number {
  const entityId = integer(entity.id, `nice_${label}.id`);
  const levels = levelsByEntity.get(entityId);
  if (!levels) throw new TypeError(`skill_values_probe:missing_raw_${label}:${entityId}`);
  const ordered = [...levels].sort(([left], [right]) => left - right);
  const niceFunctions = rows(entity.functions, `nice_${label}:${entityId}.functions`);
  let comparedCells = 0;
  for (let levelIndex = 0; levelIndex < ordered.length; levelIndex++) {
    const [lv, raw] = ordered[levelIndex]!;
    const rawFunctionIds = raw.funcId;
    if (!Array.isArray(rawFunctionIds) || rawFunctionIds.length !== niceFunctions.length)
      throw new TypeError(`skill_values_probe:function_count_mismatch:${label}:${entityId}:${lv}`);
    for (let functionIndex = 0; functionIndex < niceFunctions.length; functionIndex++) {
      const niceFunction = niceFunctions[functionIndex]!;
      const functionId = integer(
        rawFunctionIds[functionIndex],
        `${label}:${entityId}:${lv}.funcId`,
      );
      const path = `${label}:${entityId}:lv:${lv}:func:${functionIndex}`;
      same(niceFunction.funcId, functionId, `${path}.funcId`);
      for (const field of fields) {
        const rawCells = raw[field];
        if (!Array.isArray(rawCells) || rawCells.length !== niceFunctions.length)
          throw new TypeError(`skill_values_probe:invalid_raw_${field}:${path}`);
        const valueSource: unknown = rawCells[functionIndex];
        if (typeof valueSource !== 'string')
          throw new TypeError(`skill_values_probe:invalid_raw_${field}:${path}`);
        const parsed = parseRawFunctionValues(valueSource, functionKindById(functionId), {
          functionKindById,
          onIdenticalDuplicate: (key) => identicalDuplicateLocations.add(`${path}.${field}.${key}`),
        });
        const niceCells = niceFunction[field];
        if (!Array.isArray(niceCells) || niceCells.length !== ordered.length)
          throw new TypeError(`skill_values_probe:level_count_mismatch:${path}.${field}`);
        const niceCell = { ...object(niceCells[levelIndex], `${path}.${field}`) };
        if ('DependFuncId' in parsed) {
          const dependency = object(niceCell.DependFunc, `${path}.${field}.DependFunc`);
          same(dependency.funcId, parsed.DependFuncId, `${path}.${field}.DependFunc.funcId`);
          delete niceCell.DependFunc;
        }
        same(niceCell, parsed, `${path}.${field}`);
        comparedCells++;
      }
    }
  }
  return comparedCells;
}

export function probeRawNiceFunctionValues(input: {
  rawSkillLevels: unknown;
  rawNoblePhantasmLevels: unknown;
  rawFunctions: unknown;
  niceEnums: unknown;
  niceServants: unknown;
  niceCraftEssences: unknown;
  niceMysticCodes: unknown;
  niceReferencedSkills?: unknown;
}): {
  scope: 'skill-and-np-positional-values-only';
  distinctSkills: number;
  distinctNoblePhantasms: number;
  comparedSkillCells: number;
  comparedNoblePhantasmCells: number;
  identicalDuplicateLocations: number;
} {
  const rawFunctions = uniqueById(input.rawFunctions, 'mstFunc');
  const funcTypeNames = object(object(input.niceEnums, 'nice_enums').NiceFuncType, 'NiceFuncType');
  const functionKindById = (id: number): string => {
    const raw = rawFunctions.get(id);
    if (!raw) throw new TypeError(`skill_values_probe:missing_raw_function:${id}`);
    const type = integer(raw.funcType, `mstFunc:${id}.funcType`);
    const name = funcTypeNames[String(type)];
    if (typeof name !== 'string' || !name)
      throw new TypeError(`skill_values_probe:missing_function_type:${type}`);
    return name;
  };
  const levelsBySkill = levelsById(input.rawSkillLevels, 'mstSkillLv', 'skillId');
  // The source table spells the field "treaureDeviceId"; accept that exact current schema.
  const levelsByNp = levelsById(
    input.rawNoblePhantasmLevels,
    'mstTreasureDeviceLv',
    'treaureDeviceId',
  );
  const seenSkills = new Set<number>();
  const seenNps = new Set<number>();
  const identicalDuplicateLocations = new Set<string>();
  let comparedSkillCells = 0;
  let comparedNoblePhantasmCells = 0;
  const visitSkill = (skill: Row): void => {
    const skillId = integer(skill.id, 'nice_skill.id');
    comparedSkillCells += compareEntityValues(
      skill,
      levelsBySkill,
      functionKindById,
      'skill',
      ['svals'],
      identicalDuplicateLocations,
    );
    seenSkills.add(skillId);
  };
  for (const [label, source, skillFieldNames] of [
    ['nice_servant', input.niceServants, ['skills', 'classPassive']],
    ['nice_equip', input.niceCraftEssences, ['skills']],
    ['nice_mystic_code', input.niceMysticCodes, ['skills']],
  ] as const)
    for (const row of rows(source, label))
      for (const field of skillFieldNames)
        for (const skill of rows(row[field], `${label}.${field}`)) visitSkill(skill);
  if (input.niceReferencedSkills !== undefined)
    for (const skill of rows(input.niceReferencedSkills, 'nice_referenced_skills'))
      visitSkill(skill);
  for (const servant of rows(input.niceServants, 'nice_servant'))
    for (const np of rows(servant.noblePhantasms, 'nice_servant.noblePhantasms')) {
      const npId = integer(np.id, 'nice_np.id');
      comparedNoblePhantasmCells += compareEntityValues(
        np,
        levelsByNp,
        functionKindById,
        'np',
        ['svals', 'svals2', 'svals3', 'svals4', 'svals5'],
        identicalDuplicateLocations,
      );
      seenNps.add(npId);
    }
  return {
    scope: 'skill-and-np-positional-values-only',
    distinctSkills: seenSkills.size,
    distinctNoblePhantasms: seenNps.size,
    comparedSkillCells,
    comparedNoblePhantasmCells,
    identicalDuplicateLocations: identicalDuplicateLocations.size,
  };
}
