/** Raw/nice vocabulary comparison. This does not verify parameter values or full joins. */
export type RawNiceVocabularyProbeInput = {
  rawServants: unknown;
  rawItems: unknown;
  rawFunctions: unknown;
  rawBuffs: unknown;
  niceServants: unknown;
  niceCraftEssences: unknown;
  niceMysticCodes: unknown;
  niceItems: unknown;
  niceEnums: unknown;
};

type Row = Record<string, unknown>;

function object(value: unknown, path: string): Row {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`vocabulary_probe:expected_object:${path}`);
  return value as Row;
}

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`vocabulary_probe:expected_array:${path}`);
  return value.map((row: unknown, index) => object(row, `${path}:${index}`));
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`vocabulary_probe:invalid_integer:${path}`);
  return value;
}

function numberArray(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) throw new TypeError(`vocabulary_probe:expected_array:${path}`);
  return value.map((item: unknown, index) => integer(item, `${path}:${index}`));
}

function byId(value: unknown, path: string): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const row of rows(value, path)) {
    const id = integer(row.id, `${path}.id`);
    if (result.has(id)) throw new TypeError(`vocabulary_probe:duplicate_id:${path}:${id}`);
    result.set(id, row);
  }
  return result;
}

function enumName(catalog: Row, group: string, id: unknown, path: string): string {
  const entries = object(catalog[group], `nice_enums.${group}`);
  const name = entries[String(integer(id, `${path}.id`))];
  if (typeof name !== 'string' || !name)
    throw new TypeError(`vocabulary_probe:missing_enum:${group}:${String(id)}:${path}`);
  return name;
}

function equal(actual: unknown, expected: unknown, path: string): void {
  if (actual !== expected)
    throw new TypeError(
      `vocabulary_probe:mismatch:${path}:${JSON.stringify(actual)}:${JSON.stringify(expected)}`,
    );
}

function signedTraitIds(value: unknown, path: string): number[] {
  return rows(value, path).map((trait, index) => {
    const traitId = integer(trait.id, `${path}:${index}.id`);
    if (trait.negative !== undefined && typeof trait.negative !== 'boolean')
      throw new TypeError(`vocabulary_probe:invalid_negative:${path}:${index}`);
    return trait.negative ? -traitId : traitId;
  });
}

function compareTraits(actual: unknown, expected: unknown, path: string, sorted = false): void {
  const nice = signedTraitIds(actual, path);
  const raw = numberArray(expected, `${path}.raw`);
  if (sorted) {
    nice.sort((left, right) => left - right);
    raw.sort((left, right) => left - right);
  }
  equal(JSON.stringify(nice), JSON.stringify(raw), path);
}

/** The raw vals of these function kinds do not denote buff IDs. */
const NON_BUFF_VAL_KINDS = new Set([
  'subState',
  'eventDropUp',
  'gainNpBuffIndividualSum',
  'gainNpIndividualSum',
  'gainNpTargetSum',
  'subFieldBuff',
  'addBattleValue',
  'setBattleValue',
  'addBattleMissionValue',
  'setBattleMissionValue',
  'setBattleMissionValueAsMax',
]);

export function probeRawNiceVocabulary(input: RawNiceVocabularyProbeInput): {
  scope: 'enum-trait-buff-and-item-vocabulary-only';
  servants: number;
  craftEssences: number;
  items: number;
  distinctFunctions: number;
  distinctBuffs: number;
  nonBuffValueFunctions: number;
} {
  const rawServants = byId(input.rawServants, 'mstSvt');
  const rawItems = byId(input.rawItems, 'mstItem');
  const rawFunctions = byId(input.rawFunctions, 'mstFunc');
  const rawBuffs = byId(input.rawBuffs, 'mstBuff');
  const niceEnums = object(input.niceEnums, 'nice_enums');
  let servants = 0;
  for (const servant of rows(input.niceServants, 'nice_servant')) {
    const servantId = integer(servant.id, 'nice_servant.id');
    const raw = rawServants.get(servantId);
    if (!raw) throw new TypeError(`vocabulary_probe:missing_raw_servant:${servantId}`);
    const path = `nice_servant:${servantId}`;
    equal(servant.type, enumName(niceEnums, 'NiceSvtType', raw.type, path), `${path}.type`);
    equal(
      servant.className,
      enumName(niceEnums, 'SvtClass', raw.classId, path),
      `${path}.className`,
    );
    equal(
      servant.attribute,
      enumName(niceEnums, 'Attribute', raw.attri, path),
      `${path}.attribute`,
    );
    compareTraits(servant.traits, raw.individuality, `${path}.traits`, true);
    servants++;
  }
  let craftEssences = 0;
  for (const equip of rows(input.niceCraftEssences, 'nice_equip')) {
    const equipId = integer(equip.id, 'nice_equip.id');
    const raw = rawServants.get(equipId);
    if (!raw) throw new TypeError(`vocabulary_probe:missing_raw_equip:${equipId}`);
    equal(
      equip.type,
      enumName(niceEnums, 'NiceSvtType', raw.type, `nice_equip:${equipId}`),
      `nice_equip:${equipId}.type`,
    );
    craftEssences++;
  }
  let items = 0;
  for (const item of rows(input.niceItems, 'nice_item')) {
    const itemId = integer(item.id, 'nice_item.id');
    const raw = rawItems.get(itemId);
    if (!raw) throw new TypeError(`vocabulary_probe:missing_raw_item:${itemId}`);
    equal(
      item.type,
      enumName(niceEnums, 'NiceItemType', raw.type, `nice_item:${itemId}`),
      `nice_item:${itemId}.type`,
    );
    equal(item.priority, raw.priority, `nice_item:${itemId}.priority`);
    items++;
  }

  const seenFunctions = new Set<number>();
  const seenBuffs = new Set<number>();
  const nonBuffValueFunctions = new Set<number>();
  const verifyBuff = (buff: Row, rawFuncVals: number[], path: string): number => {
    const buffId = integer(buff.id, `${path}.id`);
    if (!rawFuncVals.includes(buffId))
      throw new TypeError(`vocabulary_probe:unexpected_buff:${path}:${buffId}`);
    const raw = rawBuffs.get(buffId);
    if (!raw) throw new TypeError(`vocabulary_probe:missing_raw_buff:${buffId}`);
    equal(buff.type, enumName(niceEnums, 'NiceBuffType', raw.type, path), `${path}.type`);
    for (const field of ['name', 'buffGroup', 'maxRate'])
      equal(buff[field], raw[field], `${path}.${field}`);
    for (const field of ['vals', 'tvals', 'ckSelfIndv', 'ckOpIndv'])
      compareTraits(buff[field], raw[field], `${path}.${field}`);
    seenBuffs.add(buffId);
    return buffId;
  };
  const verifyFunction = (nice: Row): void => {
    const functionId = integer(nice.funcId, 'nice_function.funcId');
    const raw = rawFunctions.get(functionId);
    if (!raw) throw new TypeError(`vocabulary_probe:missing_raw_function:${functionId}`);
    const path = `nice_function:${functionId}`;
    const kind = enumName(niceEnums, 'NiceFuncType', raw.funcType, path);
    equal(nice.funcType, kind, `${path}.funcType`);
    equal(
      nice.funcTargetType,
      enumName(niceEnums, 'NiceFuncTargetType', raw.targetType, path),
      `${path}.funcTargetType`,
    );
    equal(
      nice.funcTargetTeam,
      enumName(niceEnums, 'FuncApplyTarget', raw.applyTarget, path),
      `${path}.funcTargetTeam`,
    );
    equal(nice.funcPopupText, raw.popupText, `${path}.funcPopupText`);
    compareTraits(nice.functvals, raw.tvals, `${path}.functvals`);
    compareTraits(nice.funcquestTvals, raw.questTvals, `${path}.funcquestTvals`);
    const rawVals = numberArray(raw.vals, `${path}.rawVals`);
    const buffs = rows(nice.buffs, `${path}.buffs`);
    if (NON_BUFF_VAL_KINDS.has(kind)) {
      if (buffs.length) throw new TypeError(`vocabulary_probe:non_buff_kind_has_buffs:${path}`);
      compareTraits(nice.traitVals, rawVals, `${path}.traitVals`);
      nonBuffValueFunctions.add(functionId);
    } else {
      const niceBuffIds = buffs.map((buff) => verifyBuff(buff, rawVals, path));
      equal(
        JSON.stringify(niceBuffIds),
        JSON.stringify(rawVals.filter((value) => value !== 0)),
        `${path}.buffIds`,
      );
    }
    seenFunctions.add(functionId);
  };
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 40) throw new RangeError('vocabulary_probe:reference_depth_limit');
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      const row = value as Row;
      if ('funcId' in row) verifyFunction(row);
      for (const child of Object.values(row))
        if (child !== null && typeof child === 'object') visit(child, depth + 1);
    }
  };
  for (const source of [input.niceServants, input.niceCraftEssences, input.niceMysticCodes])
    visit(source);
  return {
    scope: 'enum-trait-buff-and-item-vocabulary-only',
    servants,
    craftEssences,
    items,
    distinctFunctions: seenFunctions.size,
    distinctBuffs: seenBuffs.size,
    nonBuffValueFunctions: nonBuffValueFunctions.size,
  };
}
