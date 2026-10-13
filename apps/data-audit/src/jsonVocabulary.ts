import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ATLAS_EXPORT_KEYS } from '@fgo-lab/master-data';

export type JsonVocabulary = Record<string, Record<string, { types: string[]; values?: string[] }>>;
type FieldState = { types: Set<string>; values?: Set<string> };

const MAX_DEPTH = 32;
const MAX_NODES = 20_000_000;
const MAX_VALUES = 4096;
const TRACKED_TERMINALS = new Set([
  'funcType',
  'funcTargetType',
  'funcTargetTeam',
  'type',
  'className',
  'attribute',
  'card',
  'target',
  'targetType',
  'category',
  'gender',
  'flags[]',
]);

function dynamicKey(document: string, parent: string, key: string): string {
  const costume = parent.endsWith('.costume') || parent.endsWith('.costumeMaterials');
  const asset =
    (parent.includes('.extraAssets.') || parent.includes('.maleImage.')) &&
    ['story', 'equip', 'costume', 'imagePartsGroup'].some((suffix) =>
      parent.endsWith(`.${suffix}`),
    );
  const trait =
    (document === 'nice_trait' && parent === '$') ||
    (document === 'nice_enums' && parent === '$.Trait');
  const identityMap =
    document === 'nice_servant' &&
    /^\$\[\]\.(?:appendSkillMaterials|skillMaterials|ascensionMaterials|bondGifts|cardDetails|hitsDistribution|script\.SkillRankUp)$/.test(
      parent,
    );
  const figureMap =
    document === 'nice_servant' &&
    /^\$\[\]\.extraAssets\.(?:charaFigureForm|charaFigureMulti|charaFigureMultiCombine|charaFigureMultiLimitUp)$/.test(
      parent,
    );
  const ascensionMap = parent.startsWith('$[].ascensionAdd.') && parent.endsWith('.ascension');
  if (!costume && !asset && !trait && !identityMap && !figureMap && !ascensionMap) return key;
  if (asset && parent.endsWith('.imagePartsGroup')) {
    if (!/^\d+(?:_\d+)*$/.test(key))
      throw new TypeError(`json_vocabulary:invalid_dynamic_key:${document}:${parent}:${key}`);
  } else if (!/^\d+$/.test(key)) {
    throw new TypeError(`json_vocabulary:invalid_dynamic_key:${document}:${parent}:${key}`);
  }
  return '*';
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('json_vocabulary:nonfinite_number');
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (['string', 'boolean', 'object'].includes(typeof value)) return typeof value;
  throw new TypeError(`json_vocabulary:unsupported_type:${typeof value}`);
}

export class JsonVocabularyScanner {
  private nodes = 0;
  private readonly fields = new Map<string, Map<string, FieldState>>();

  scan(document: string, value: unknown): void {
    const fields: Map<string, FieldState> =
      this.fields.get(document) ?? new Map<string, FieldState>();
    this.fields.set(document, fields);
    const visit = (entry: unknown, path: string, depth: number): void => {
      this.nodes++;
      if (this.nodes > MAX_NODES) throw new RangeError('json_vocabulary:node_limit');
      if (depth > MAX_DEPTH)
        throw new RangeError(`json_vocabulary:depth_limit:${document}:${path}`);
      const type = typeOf(entry);
      const field: FieldState = fields.get(path) ?? { types: new Set<string>() };
      fields.set(path, field);
      field.types.add(type);
      if (
        TRACKED_TERMINALS.has(path.slice(path.lastIndexOf('.') + 1)) &&
        (type === 'string' || type === 'integer')
      ) {
        const values = field.values ?? new Set<string>();
        values.add(String(entry));
        if (values.size > MAX_VALUES)
          throw new RangeError(`json_vocabulary:value_limit:${document}:${path}`);
        field.values = values;
      }
      if (Array.isArray(entry)) {
        for (const nested of entry) visit(nested, `${path}[]`, depth + 1);
      } else if (entry !== null && typeof entry === 'object') {
        for (const [rawKey, nested] of Object.entries(entry)) {
          if (!rawKey || rawKey.includes('\0'))
            throw new TypeError(`json_vocabulary:invalid_key:${document}:${path}`);
          const key = dynamicKey(document, path, rawKey);
          visit(nested, `${path}.${key}`, depth + 1);
        }
      }
    };
    visit(value, '$', 0);
  }

  result(): JsonVocabulary {
    return Object.fromEntries(
      [...this.fields]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([document, fields]) => [
          document,
          Object.fromEntries(
            [...fields]
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([path, item]) => [
                path,
                {
                  types: [...item.types].sort(),
                  ...(item.values ? { values: [...item.values].sort() } : {}),
                },
              ]),
          ),
        ]),
    );
  }
}

export async function scanCapturedAtlasVocabulary(directory: string): Promise<JsonVocabulary> {
  const scanner = new JsonVocabularyScanner();
  for (const key of ATLAS_EXPORT_KEYS)
    scanner.scan(
      key,
      JSON.parse(await readFile(join(directory, `${key}.json`), 'utf8')) as unknown,
    );
  const skillDirectory = join(directory, 'referenced_skills');
  const names = await readdir(skillDirectory);
  for (const name of names.sort()) {
    if (!/^[1-9][0-9]*\.json$/.test(name))
      throw new TypeError(`json_vocabulary:invalid_skill_file:${name}`);
    scanner.scan(
      'referenced_skills',
      JSON.parse(await readFile(join(skillDirectory, name), 'utf8')) as unknown,
    );
  }
  return scanner.result();
}

export function compareJsonVocabulary(baseline: JsonVocabulary, current: JsonVocabulary): string[] {
  const changes: string[] = [];
  for (const [document, fields] of Object.entries(current)) {
    const expected = baseline[document];
    if (!expected) {
      changes.push(`new_document:${document}`);
      continue;
    }
    for (const [path, field] of Object.entries(fields)) {
      const declaration = expected[path];
      if (!declaration) {
        changes.push(`new_field:${document}:${path}`);
        continue;
      }
      for (const type of field.types)
        if (!declaration.types.includes(type)) changes.push(`new_type:${document}:${path}:${type}`);
      if (declaration.values)
        for (const value of field.values ?? [])
          if (!declaration.values.includes(value))
            changes.push(`new_value:${document}:${path}:${value}`);
    }
    for (const path of Object.keys(expected))
      if (!(path in fields)) changes.push(`removed_field:${document}:${path}`);
  }
  for (const document of Object.keys(baseline))
    if (!(document in current)) changes.push(`removed_document:${document}`);
  return changes.sort();
}
