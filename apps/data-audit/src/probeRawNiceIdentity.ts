import { expectedRawNiceRoster } from '@fgo-lab/data-pipeline';

/**
 * A bounded feasibility probe for raw/nice joins. Passing this probe is never
 * sufficient to publish a data certificate: effects, values, release filters,
 * images, and the complete reference closure require separate parity checks.
 */
export type RawNiceIdentityProbeInput = {
  rawServants: unknown;
  rawMysticCodes: unknown;
  rawMysticCodeSkills: unknown;
  rawItems: unknown;
  rawServantSkills: unknown;
  rawServantNoblePhantasms: unknown;
  rawFunctions: unknown;
  niceServants: unknown;
  niceCraftEssences: unknown;
  niceMysticCodes: unknown;
  niceItems: unknown;
  niceEnums: unknown;
};

export type RawNiceIdentityProbe = {
  scope: 'identity-and-reference-existence-only';
  servants: number;
  craftEssences: number;
  mysticCodes: number;
  items: number;
  servantSkillReferences: number;
  servantNoblePhantasmReferences: number;
  craftEssenceSkillReferences: number;
  mysticCodeSkillReferences: number;
  distinctFunctionReferences: number;
  rawSkillRowsForNiceServantsAbsentFromNice: number;
  publishedServantsRequiredByRaw: number;
  publishedCraftEssencesRequiredByRaw: number;
  unnumberedServantsPublishedByAtlas: number;
};

type Row = Record<string, unknown>;

function rows(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`source_probe:expected_array:${label}`);
  return value.map((row: unknown, index) => {
    if (!row || Array.isArray(row) || typeof row !== 'object')
      throw new TypeError(`source_probe:expected_object:${label}:${index}`);
    return row as Row;
  });
}

function id(row: Row, label: string): number {
  const value = row.id;
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`source_probe:invalid_id:${label}`);
  return value as number;
}

function number(row: Row, key: string, label: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value)) throw new TypeError(`source_probe:invalid_${key}:${label}`);
  return value as number;
}

function name(row: Row, label: string): string {
  if (typeof row.name !== 'string' || !row.name)
    throw new TypeError(`source_probe:invalid_name:${label}`);
  return row.name;
}

function uniqueById(value: unknown, label: string): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const row of rows(value, label)) {
    const key = id(row, label);
    if (result.has(key)) throw new TypeError(`source_probe:duplicate_id:${label}:${key}`);
    result.set(key, row);
  }
  return result;
}

function matchingNames(nice: Map<number, Row>, raw: Map<number, Row>, label: string): number {
  for (const [key, candidate] of nice) {
    const source = raw.get(key);
    if (!source) throw new TypeError(`source_probe:missing_raw_${label}:${key}`);
    if (name(candidate, `${label}:${key}`) !== name(source, `${label}:${key}`))
      throw new TypeError(`source_probe:name_mismatch:${label}:${key}`);
    if (label === 'servant' || label === 'craft_essence')
      if (
        number(candidate, 'collectionNo', `${label}:${key}`) !==
        number(source, 'collectionNo', `${label}:${key}.raw`)
      )
        throw new TypeError(`source_probe:collection_number_mismatch:${label}:${key}`);
  }
  return nice.size;
}

function tuple(...values: number[]): string {
  return values.join(':');
}

function arrayField(row: Row, key: string, label: string): Row[] {
  return rows(row[key], `${label}.${key}`);
}

function collectFunctionIds(value: unknown, result: Set<number>, depth = 0): void {
  if (depth > 40) throw new RangeError('source_probe:reference_depth_limit');
  if (Array.isArray(value)) {
    for (const child of value) collectFunctionIds(child, result, depth + 1);
  } else if (value !== null && typeof value === 'object') {
    const row = value as Row;
    if ('funcId' in row) result.add(number(row, 'funcId', 'nice_function'));
    for (const child of Object.values(row))
      if (child !== null && typeof child === 'object') collectFunctionIds(child, result, depth + 1);
  }
}

export function probeRawNiceIdentity(input: RawNiceIdentityProbeInput): RawNiceIdentityProbe {
  const rawServants = uniqueById(input.rawServants, 'mstSvt');
  const rawMysticCodes = uniqueById(input.rawMysticCodes, 'mstEquip');
  const rawItems = uniqueById(input.rawItems, 'mstItem');
  const rawFunctions = uniqueById(input.rawFunctions, 'mstFunc');
  const niceServants = uniqueById(input.niceServants, 'nice_servant');
  const niceCraftEssences = uniqueById(input.niceCraftEssences, 'nice_equip');
  const niceMysticCodes = uniqueById(input.niceMysticCodes, 'nice_mystic_code');
  const niceItems = uniqueById(input.niceItems, 'nice_item');
  const expected = expectedRawNiceRoster({
    rawServants: input.rawServants,
    niceEnums: input.niceEnums,
  });

  for (const id of expected.servants)
    if (!niceServants.has(id)) throw new TypeError(`source_probe:missing_published_servant:${id}`);
  for (const id of expected.craftEssences)
    if (!niceCraftEssences.has(id))
      throw new TypeError(`source_probe:missing_published_craft_essence:${id}`);
  for (const [id, row] of niceCraftEssences)
    if (!expected.craftEssences.has(id) || number(row, 'collectionNo', `nice_equip:${id}`) === 0)
      throw new TypeError(`source_probe:unexpected_craft_essence:${id}`);
  for (const id of rawMysticCodes.keys())
    if (!niceMysticCodes.has(id)) throw new TypeError(`source_probe:missing_published_mc:${id}`);
  for (const id of rawItems.keys())
    if (!niceItems.has(id)) throw new TypeError(`source_probe:missing_published_item:${id}`);

  const servants = matchingNames(niceServants, rawServants, 'servant');
  const craftEssences = matchingNames(niceCraftEssences, rawServants, 'craft_essence');
  const mysticCodes = matchingNames(niceMysticCodes, rawMysticCodes, 'mystic_code');
  const items = matchingNames(niceItems, rawItems, 'item');

  const rawSkillRows = rows(input.rawServantSkills, 'mstSvtSkill');
  const rawSkillKeys = new Set<string>();
  for (const row of rawSkillRows) {
    const key = tuple(
      number(row, 'svtId', 'mstSvtSkill'),
      number(row, 'skillId', 'mstSvtSkill'),
      number(row, 'num', 'mstSvtSkill'),
      number(row, 'priority', 'mstSvtSkill'),
    );
    if (rawSkillKeys.has(key)) throw new TypeError(`source_probe:duplicate_raw_skill:${key}`);
    rawSkillKeys.add(key);
  }
  let servantSkillReferences = 0;
  const niceSkillKeys = new Set<string>();
  for (const [servantId, servant] of niceServants) {
    for (const skill of arrayField(servant, 'skills', `servant:${servantId}`)) {
      const key = tuple(
        servantId,
        id(skill, `servant:${servantId}.skill`),
        number(skill, 'num', `servant:${servantId}.skill`),
        number(skill, 'priority', `servant:${servantId}.skill`),
      );
      if (!rawSkillKeys.has(key)) throw new TypeError(`source_probe:missing_raw_skill:${key}`);
      if (niceSkillKeys.has(key)) throw new TypeError(`source_probe:duplicate_nice_skill:${key}`);
      niceSkillKeys.add(key);
      servantSkillReferences++;
    }
  }

  const niceCraftEssenceSkillKeys = new Set<string>();
  for (const [equipId, equip] of niceCraftEssences)
    for (const skill of arrayField(equip, 'skills', `craft_essence:${equipId}`)) {
      const key = tuple(
        equipId,
        id(skill, `craft_essence:${equipId}.skill`),
        number(skill, 'num', `craft_essence:${equipId}.skill`),
        number(skill, 'priority', `craft_essence:${equipId}.skill`),
      );
      if (!rawSkillKeys.has(key))
        throw new TypeError(`source_probe:missing_raw_equip_skill:${key}`);
      if (niceCraftEssenceSkillKeys.has(key))
        throw new TypeError(`source_probe:duplicate_nice_equip_skill:${key}`);
      niceCraftEssenceSkillKeys.add(key);
    }
  for (const row of rawSkillRows) {
    const equipId = number(row, 'svtId', 'mstSvtSkill');
    if (!niceCraftEssences.has(equipId)) continue;
    const key = tuple(
      equipId,
      number(row, 'skillId', 'mstSvtSkill'),
      number(row, 'num', 'mstSvtSkill'),
      number(row, 'priority', 'mstSvtSkill'),
    );
    if (!niceCraftEssenceSkillKeys.has(key))
      throw new TypeError(`source_probe:missing_published_equip_skill:${key}`);
  }

  const rawMcSkills = rows(input.rawMysticCodeSkills, 'mstEquipSkill');
  const rawMcSkillsByEquip = new Map<number, Row[]>();
  for (const row of rawMcSkills) {
    const equipId = number(row, 'equipId', 'mstEquipSkill');
    if (!rawMysticCodes.has(equipId))
      throw new TypeError(`source_probe:missing_raw_mc_for_skill:${equipId}`);
    const existing = rawMcSkillsByEquip.get(equipId) ?? [];
    existing.push(row);
    rawMcSkillsByEquip.set(equipId, existing);
  }
  let mysticCodeSkillReferences = 0;
  for (const [equipId, equip] of niceMysticCodes) {
    const niceSkills = arrayField(equip, 'skills', `mystic_code:${equipId}`);
    const rawSkills = (rawMcSkillsByEquip.get(equipId) ?? []).sort(
      (left, right) => number(left, 'num', 'mstEquipSkill') - number(right, 'num', 'mstEquipSkill'),
    );
    if (rawSkills.length !== niceSkills.length)
      throw new TypeError(`source_probe:mc_skill_count_mismatch:${equipId}`);
    for (let index = 0; index < rawSkills.length; index++) {
      const raw = rawSkills[index]!;
      const nice = niceSkills[index]!;
      if (number(raw, 'num', 'mstEquipSkill') !== index + 1)
        throw new TypeError(`source_probe:mc_skill_slot_mismatch:${equipId}`);
      if (number(raw, 'condLv', 'mstEquipSkill') !== 0)
        throw new TypeError(`source_probe:unsupported_mc_skill_condition:${equipId}`);
      if (number(raw, 'skillId', 'mstEquipSkill') !== id(nice, `mystic_code:${equipId}.skill`))
        throw new TypeError(`source_probe:mc_skill_id_mismatch:${equipId}:${index}`);
      mysticCodeSkillReferences++;
    }
  }

  const rawNoblePhantasmKeys = new Set<string>();
  for (const row of rows(input.rawServantNoblePhantasms, 'mstSvtTreasureDevice')) {
    const key = tuple(
      number(row, 'svtId', 'mstSvtTreasureDevice'),
      number(row, 'treasureDeviceId', 'mstSvtTreasureDevice'),
      number(row, 'num', 'mstSvtTreasureDevice'),
      number(row, 'priority', 'mstSvtTreasureDevice'),
    );
    if (rawNoblePhantasmKeys.has(key)) throw new TypeError(`source_probe:duplicate_raw_np:${key}`);
    rawNoblePhantasmKeys.add(key);
  }
  let servantNoblePhantasmReferences = 0;
  const niceNoblePhantasmKeys = new Set<string>();
  for (const [servantId, servant] of niceServants) {
    for (const np of arrayField(servant, 'noblePhantasms', `servant:${servantId}`)) {
      const key = tuple(
        servantId,
        id(np, `servant:${servantId}.np`),
        number(np, 'num', `servant:${servantId}.np`),
        number(np, 'priority', `servant:${servantId}.np`),
      );
      if (!rawNoblePhantasmKeys.has(key)) throw new TypeError(`source_probe:missing_raw_np:${key}`);
      if (niceNoblePhantasmKeys.has(key))
        throw new TypeError(`source_probe:duplicate_nice_np:${key}`);
      niceNoblePhantasmKeys.add(key);
      servantNoblePhantasmReferences++;
    }
  }

  const functionIds = new Set<number>();
  for (const source of [input.niceServants, input.niceCraftEssences, input.niceMysticCodes])
    collectFunctionIds(source, functionIds);
  for (const functionId of functionIds)
    if (!rawFunctions.has(functionId))
      throw new TypeError(`source_probe:missing_raw_function:${functionId}`);

  return {
    scope: 'identity-and-reference-existence-only',
    servants,
    craftEssences,
    mysticCodes,
    items,
    servantSkillReferences,
    servantNoblePhantasmReferences,
    craftEssenceSkillReferences: niceCraftEssenceSkillKeys.size,
    mysticCodeSkillReferences,
    distinctFunctionReferences: functionIds.size,
    rawSkillRowsForNiceServantsAbsentFromNice: rawSkillRows.filter((row) => {
      const servantId = number(row, 'svtId', 'mstSvtSkill');
      if (!niceServants.has(servantId)) return false;
      const key = tuple(
        servantId,
        number(row, 'skillId', 'mstSvtSkill'),
        number(row, 'num', 'mstSvtSkill'),
        number(row, 'priority', 'mstSvtSkill'),
      );
      return !niceSkillKeys.has(key);
    }).length,
    publishedServantsRequiredByRaw: expected.servants.size,
    publishedCraftEssencesRequiredByRaw: expected.craftEssences.size,
    unnumberedServantsPublishedByAtlas: niceServants.size - expected.servants.size,
  };
}
