import { isDeepStrictEqual } from 'node:util';
import { deriveRawServantMaterials, type RawMaterialStep } from '@fgo-lab/data-pipeline';

type Row = Record<string, unknown>;

function object(value: unknown, path: string): Row {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`materials_probe:expected_object:${path}`);
  return value as Row;
}

function rows(value: unknown, path: string): Row[] {
  if (!Array.isArray(value)) throw new TypeError(`materials_probe:expected_array:${path}`);
  return value.map((row: unknown, index) => object(row, `${path}:${index}`));
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`materials_probe:invalid_integer:${path}`);
  return value;
}

function niceStep(value: unknown, path: string): RawMaterialStep {
  const row = object(value, path);
  const items = rows(row.items, `${path}.items`);
  return {
    itemIds: items.map((entry, index) =>
      integer(object(entry.item, `${path}.items:${index}.item`).id, `${path}.items:${index}.id`),
    ),
    itemNums: items.map((entry, index) => integer(entry.amount, `${path}.items:${index}.amount`)),
    qp: integer(row.qp, `${path}.qp`),
  };
}

function niceSteps(value: unknown, path: string): Record<string, RawMaterialStep> {
  const source = object(value, path);
  const result: Record<string, RawMaterialStep> = {};
  for (const [level, step] of Object.entries(source)) {
    if (!/^(0|[1-9][0-9]*)$/.test(level))
      throw new TypeError(`materials_probe:invalid_level:${path}:${level}`);
    result[level] = niceStep(step, `${path}:${level}`);
  }
  return result;
}

export function probeRawNiceMaterials(input: {
  rawServants: unknown;
  rawItems: unknown;
  rawCombineLimits: unknown;
  rawCombineSkills: unknown;
  rawCombineAppendSkills: unknown;
  niceServants: unknown;
}): { scope: 'published-servant-material-steps-only'; servants: number; steps: number } {
  const niceServants = rows(input.niceServants, 'nice_servant');
  const ids = niceServants.map((row) => integer(row.id, 'nice_servant.id'));
  const raw = deriveRawServantMaterials({
    rawServants: input.rawServants,
    rawItems: input.rawItems,
    rawCombineLimits: input.rawCombineLimits,
    rawCombineSkills: input.rawCombineSkills,
    rawCombineAppendSkills: input.rawCombineAppendSkills,
    publishedIds: ids,
  });
  let steps = 0;
  for (const servant of niceServants) {
    const id = servant.id as number;
    const expected = raw.get(id)!;
    for (const field of ['ascensionMaterials', 'skillMaterials', 'appendSkillMaterials'] as const) {
      const actual = niceSteps(servant[field], `nice_servant:${id}.${field}`);
      if (!isDeepStrictEqual(actual, expected[field]))
        throw new TypeError(`materials_probe:mismatch:${id}:${field}`);
      steps += Object.keys(actual).length;
    }
  }
  return { scope: 'published-servant-material-steps-only', servants: niceServants.length, steps };
}
