import { isDeepStrictEqual } from 'node:util';
import { deriveRawGrowth } from '@fgo-lab/data-pipeline';

type Row = Record<string, unknown>;

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`growth_probe:expected_array:${path}`);
  return value.map((row: unknown, index): Row => {
    if (row === null || Array.isArray(row) || typeof row !== 'object')
      throw new TypeError(`growth_probe:expected_object:${path}:${index}`);
    return row as Row;
  });
}

export function probeRawNiceGrowth(input: {
  rawServants: unknown;
  rawLimits: unknown;
  rawExperience: unknown;
  niceEnums: unknown;
  niceServants: unknown;
  niceCraftEssences: unknown;
}): { scope: 'published-servant-and-equip-growth-only'; entities: number; growthCells: number } {
  const sources = [
    ...rows(input.niceServants, 'nice_servant'),
    ...rows(input.niceCraftEssences, 'nice_equip'),
  ];
  const ids = sources.map((row) => {
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 0)
      throw new TypeError('growth_probe:invalid_published_id');
    return row.id;
  });
  const raw = deriveRawGrowth({
    rawServants: input.rawServants,
    rawLimits: input.rawLimits,
    rawExperience: input.rawExperience,
    niceEnums: input.niceEnums,
    publishedIds: ids,
  });
  let growthCells = 0;
  for (const source of sources) {
    const id = source.id as number;
    const expected = raw.get(id)!;
    for (const field of [
      'rarity',
      'lvMax',
      'atkBase',
      'atkMax',
      'hpBase',
      'hpMax',
      'atkGrowth',
      'hpGrowth',
    ] as const)
      if (!isDeepStrictEqual(source[field], expected[field]))
        throw new TypeError(`growth_probe:mismatch:${id}:${field}`);
    growthCells += expected.atkGrowth.length + expected.hpGrowth.length;
  }
  return {
    scope: 'published-servant-and-equip-growth-only',
    entities: sources.length,
    growthCells,
  };
}
