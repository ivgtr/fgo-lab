/** The published nice roster is selected from raw servant rows by type and collection number. */
export function expectedRawNiceRoster(input: { rawServants: unknown; niceEnums: unknown }): {
  servants: Set<number>;
  craftEssences: Set<number>;
} {
  if (!Array.isArray(input.rawServants))
    throw new TypeError('raw_export_selection:expected_servants_array');
  if (
    input.niceEnums === null ||
    Array.isArray(input.niceEnums) ||
    typeof input.niceEnums !== 'object'
  )
    throw new TypeError('raw_export_selection:expected_enums_object');
  const catalog = (input.niceEnums as Record<string, unknown>).NiceSvtType;
  if (catalog === null || Array.isArray(catalog) || typeof catalog !== 'object')
    throw new TypeError('raw_export_selection:missing_servant_type_catalog');
  const types = catalog as Record<string, unknown>;
  for (const [rawId, expectedName] of [
    ['1', 'normal'],
    ['2', 'heroine'],
    ['6', 'servantEquip'],
    ['9', 'enemyCollectionDetail'],
  ] as const)
    if (types[rawId] !== expectedName)
      throw new TypeError(`raw_export_selection:changed_servant_type:${rawId}`);
  const servants = new Set<number>();
  const craftEssences = new Set<number>();
  const seen = new Set<number>();
  for (const [index, value] of input.rawServants.entries()) {
    if (value === null || Array.isArray(value) || typeof value !== 'object')
      throw new TypeError(`raw_export_selection:invalid_servant:${index}`);
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 0)
      throw new TypeError(`raw_export_selection:invalid_id:${index}`);
    if (seen.has(row.id)) throw new TypeError(`raw_export_selection:duplicate_id:${row.id}`);
    seen.add(row.id);
    if (
      typeof row.collectionNo !== 'number' ||
      !Number.isSafeInteger(row.collectionNo) ||
      row.collectionNo < 0
    )
      throw new TypeError(`raw_export_selection:invalid_collection_number:${row.id}`);
    if (typeof row.type !== 'number' || !Number.isSafeInteger(row.type))
      throw new TypeError(`raw_export_selection:invalid_type:${row.id}`);
    const type = types[String(row.type)];
    if (typeof type !== 'string' || !type)
      throw new TypeError(`raw_export_selection:unknown_type:${row.id}:${row.type}`);
    if (row.collectionNo === 0) continue;
    if (type === 'normal' || type === 'heroine' || type === 'enemyCollectionDetail')
      servants.add(row.id);
    if (type === 'servantEquip') craftEssences.add(row.id);
  }
  return { servants, craftEssences };
}
