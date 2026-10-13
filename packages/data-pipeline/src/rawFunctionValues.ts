/**
 * Parse Atlas mstSkillLv/mstTreasureDeviceLv positional function values.
 * Every token must have an explicit representation; unknown syntax is rejected.
 */
const ADD_BUFF_FUNCTIONS = new Set([
  'addState',
  'addStateShort',
  'addFieldChangeToField',
  'addStateToField',
  'addStateShortToField',
  'addStateUserEquipSkillAvailable',
  'addStateShortUserEquipSkillAvailable',
]);
const DAMAGE_NP_FUNCTIONS = new Set([
  'damageNpIndividual',
  'damageNpStateIndividual',
  'damageNpStateIndividualFix',
  'damageNpIndividualSum',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
  'damageNpBattlePointPhase',
]);
const EVENT_FUNCTIONS = new Set([
  'eventPointUp',
  'eventPointRateUp',
  'eventDropUp',
  'eventDropRateUp',
  'eventFortificationPointUp',
  'enemyEncountCopyRateUp',
  'enemyEncountRateUp',
]);
const FRIEND_SUPPORT_FUNCTIONS = new Set([
  'servantFriendshipUp',
  'userEquipExpUp',
  'expUp',
  'qpDropUp',
  'qpUp',
]);
const THREE_VALUE_FUNCTIONS = new Set([
  'subState',
  'gainNpIndividualSum',
  'gainNpTargetSum',
  'subFieldBuff',
  'shortenSkill',
  'extendSkill',
  'shortenUserEquipSkill',
  'extendUserEquipSkill',
  'gainNpCriticalstarSum',
]);
const INT_LIST_KEYS = new Set([
  'TargetList',
  'TargetRarityList',
  'AndCheckIndividualityList',
  'ParamAddSelfIndividuality',
  'ParamAddOpIndividuality',
  'ParamAddFieldIndividuality',
  'DamageRates',
  'OnPositions',
  'OffPositions',
  'NotTargetSkillIdArray',
  'CopyTargetFunctionType',
  'CopyTargetBuffType',
  'NotSkillCopyTargetFuncIds',
  'NotSkillCopyTargetIndividualities',
  'TargetEnemyRange',
  'FieldIndividuality',
  'SnapShotParamAddSelfIndv',
  'SnapShotParamAddOpIndv',
  'SnapShotParamAddFieldIndv',
  'StartingPosition',
  'ShortenMaxCountEachSkill',
  'BackStepTargets',
  'ReplacePositionTargets',
  'TargetFunctionIndividuality',
  'TargetBuffIndividuality',
  'TriggeredFuncIndexAndCheckList',
  'CondParamAddTargetId',
  'CondParamRangeTargetId',
  'SubstituteEffectList',
  'ResistEffectList',
]);
const INT_LIST_2D_KEYS = new Set([
  'ParamAddSelfIndividualityAndCheck',
  'ParamAddOpIndividualityAndCheck',
  'ParamAddFieldIndividualityAndCheck',
  'SnapShotParamAddSelfIndividualityAndCheck',
  'SnapShotParamAddOpIndividualityAndCheck',
  'SnapShotParamAddFieldIndividualityAndCheck',
  'AndOrCheckIndividualityList',
  'ApplyBuffIndividuality',
  'TypeIndividualityEachFunc',
]);
const STRING_KEYS = new Set([
  'PopValueText',
  'TriggeredFieldCountRange',
  'TriggeredTargetHpRange',
  'TriggeredTargetHpRateRange',
  'DisplayNoEffectCauses',
  'SubstitutePopupText',
  'ResistPopupText',
]);
const STRING_LIST_KEYS = new Set(['ApplyValueUp', 'CheckOverChargeStageRange']);

function integer(value: string, path: string): number {
  if (!/^-?\d+$/.test(value)) throw new TypeError(`raw_function_values:invalid_integer:${path}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError(`raw_function_values:unsafe_integer:${path}`);
  return parsed;
}

function splitTopLevel(source: string, separator: string): string[] {
  let depth = 0;
  const output: string[] = [];
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth < 0) throw new TypeError('raw_function_values:unbalanced_brackets');
    } else if (char === separator && depth === 0) {
      output.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0) throw new TypeError('raw_function_values:unbalanced_brackets');
  output.push(source.slice(start).trim());
  return output;
}

function integerList(value: string, path: string): number[] {
  const separator = value.includes('/') ? '/' : '&';
  return value.split(separator).map((entry, index) => integer(entry.trim(), `${path}:${index}`));
}

function positionalKey(kind: string, index: number): string | null {
  if (DAMAGE_NP_FUNCTIONS.has(kind))
    return ['Rate', 'Value', 'Target', 'Correction'][index] ?? null;
  if (ADD_BUFF_FUNCTIONS.has(kind))
    return ['Rate', 'Turn', 'Count', 'Value', 'UseRate', 'Value2'][index] ?? null;
  if (THREE_VALUE_FUNCTIONS.has(kind)) return ['Rate', 'Value', 'Value2'][index] ?? null;
  if (kind === 'transformServant')
    return ['Rate', 'Value', 'Target', 'SetLimitCount'][index] ?? null;
  if (EVENT_FUNCTIONS.has(kind))
    return index === 0 ? 'Individuality' : index === 3 ? 'EventId' : `aa${index}`;
  if (kind === 'classDropUp') return index === 2 ? 'EventId' : `aa${index}`;
  if (kind === 'enemyProbDown') return ['Individuality', 'RateCount', 'EventId'][index] ?? null;
  if (FRIEND_SUPPORT_FUNCTIONS.has(kind)) return index === 2 ? 'Individuality' : `aa${index}`;
  if (kind === 'friendPointUp' || kind === 'friendPointUpDuplicate')
    return index === 0 ? 'AddCount' : null;
  if (kind === 'addBattlePoint' || kind === 'subBattlePoint')
    return ['Rate', 'BattlePointId', 'BattlePointValue'][index] ?? null;
  return ['Rate', 'Value', 'Target'][index] ?? null;
}

export type RawFunctionValueContext = {
  /** Resolve a nested DependFuncId against the same immutable raw source. */
  functionKindById?: (id: number) => string;
  /** Duplicate names with identical values are idempotent but remain observable. */
  onIdenticalDuplicate?: (key: string) => void;
};

export function parseRawFunctionValues(
  raw: string,
  kind: string,
  context: RawFunctionValueContext = {},
): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.startsWith('[') || !raw.endsWith(']'))
    throw new TypeError('raw_function_values:invalid_bracketed_source');
  const inner = raw.slice(1, -1);
  if (!inner) return {};
  const tokens = splitTopLevel(inner, ',');
  const output: Record<string, unknown> = {};
  const additionalIndividualities: number[] = [];
  const grouped: Record<string, unknown[]> = {
    DamageRateBattlePointPhase: [],
    CheckBattlePointPhaseRange: [],
    TriggeredTargetBattlePointRateRange: [],
  };
  const temporary: Record<string, number> = {};
  const setOnce = (key: string, value: unknown): void => {
    if (Object.hasOwn(output, key)) {
      if (JSON.stringify(output[key]) !== JSON.stringify(value))
        throw new TypeError(`raw_function_values:contradictory_duplicate:${key}`);
      context.onIdenticalDuplicate?.(key);
      return;
    }
    output[key] = value;
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (!token) throw new TypeError(`raw_function_values:empty_token:${index}`);
    if (/^-?\d+$/.test(token)) {
      const key = positionalKey(kind, index);
      if (!key) throw new TypeError(`raw_function_values:unknown_position:${kind}:${index}`);
      const value = integer(token, `${kind}:${index}`);
      if (key.startsWith('aa')) temporary[key] = value;
      else setOnce(key, value);
      continue;
    }
    const colon = token.indexOf(':');
    if (colon < 1) throw new TypeError(`raw_function_values:invalid_named_token:${token}`);
    const key = token.slice(0, colon).trim();
    const value = token.slice(colon + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || !value)
      throw new TypeError(`raw_function_values:invalid_named_token:${token}`);
    if (key === 'DependFuncId1') {
      if (!value.startsWith('[') || !value.endsWith(']'))
        throw new TypeError('raw_function_values:invalid_depend_func_id');
      setOnce('DependFuncId', integer(value.slice(1, -1), key));
    } else if (key === 'DependFuncVals1') {
      const dependentId = output.DependFuncId;
      if (typeof dependentId !== 'number' || !context.functionKindById)
        throw new TypeError('raw_function_values:missing_depend_func_kind');
      const dependentKind = context.functionKindById(dependentId);
      setOnce('DependFuncVals', parseRawFunctionValues(value, dependentKind, context));
    } else if (INT_LIST_KEYS.has(key)) {
      setOnce(key, integerList(value, key));
    } else if (INT_LIST_2D_KEYS.has(key)) {
      setOnce(
        key,
        value.split('|').map((part, groupIndex) => integerList(part, `${key}:${groupIndex}`)),
      );
    } else if (STRING_LIST_KEYS.has(key)) {
      setOnce(key, value.split('/'));
    } else if (STRING_KEYS.has(key)) {
      setOnce(key, value);
    } else if (key.startsWith('DamageRateBattlePointPhase_')) {
      const phase = integer(key.slice('DamageRateBattlePointPhase_'.length), key);
      grouped.DamageRateBattlePointPhase!.push({
        battlePointPhase: phase,
        value: integer(value, key),
      });
    } else if (key.startsWith('CheckBattlePointPhaseRange_')) {
      const id = integer(key.slice('CheckBattlePointPhaseRange_'.length), key);
      grouped.CheckBattlePointPhaseRange!.push({ battlePointId: id, range: value.split('/') });
    } else if (key.startsWith('TriggeredTargetBattlePointRateRange_')) {
      const id = integer(key.slice('TriggeredTargetBattlePointRateRange_'.length), key);
      grouped.TriggeredTargetBattlePointRateRange!.push({
        battlePointId: id,
        range: value.split('/'),
      });
    } else {
      const parsed = integer(value, key);
      if (key === 'AddIndividualty') {
        output[key] = parsed;
        additionalIndividualities.push(parsed);
      } else setOnce(key, parsed);
    }
  }
  for (const [key, values] of Object.entries(grouped)) if (values.length) setOnce(key, values);
  if (additionalIndividualities.length) setOnce('AddIndividualtyList', additionalIndividualities);
  const mode = EVENT_FUNCTIONS.has(kind) ? temporary.aa1 : temporary.aa0;
  const amount = EVENT_FUNCTIONS.has(kind) ? temporary.aa2 : temporary.aa1;
  if (mode !== undefined) {
    if (amount === undefined)
      throw new TypeError(`raw_function_values:missing_mode_amount:${kind}`);
    const field =
      mode === 1 ? 'AddCount' : mode === 2 ? 'RateCount' : mode === 3 ? 'DropRateCount' : null;
    if (!field) throw new TypeError(`raw_function_values:unknown_count_mode:${kind}:${mode}`);
    setOnce(field, amount);
  }
  return output;
}
