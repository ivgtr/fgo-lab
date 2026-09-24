import { randomBytes, createHash } from 'node:crypto';
import { lstat, link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { TestOptions } from 'vitest';

export const PRODUCTION_AUDIT_ARTIFACT_META_KEY = 'fgoProductionAuditArtifacts';
export const PRODUCTION_AUDIT_ARTIFACT_CONTRACT_VERSION = 1;

export interface ProductionAuditArtifactDescriptor {
  path: string;
  format: 'json';
  allowEmpty: false;
}

export interface ProductionAuditArtifactReceipt {
  path: string;
  expectedBytes: number;
  expectedSha256: string;
}

export interface ProductionAuditArtifactContract {
  version: 1;
  requiredArtifacts: ProductionAuditArtifactDescriptor[];
  receipts: ProductionAuditArtifactReceipt[];
}

export interface ProductionAuditTestOptions {
  meta: NonNullable<TestOptions['meta']>;
}

const OMIT = Symbol('omit-undefined-property');
type ArtifactPath = (string | number)[];
interface ArtifactContainer {
  path: ArtifactPath;
  kind: 'set' | 'map' | 'nullObject';
}

function defineValue(target: object, key: string | number, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function encodeLossless(
  value: unknown,
  path: (string | number)[],
  undefinedPaths: (string | number)[][],
  ancestors: Set<object>,
  containers: ArtifactContainer[],
): unknown {
  if (value === undefined) {
    undefinedPaths.push([...path]);
    return OMIT;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError(`unsupported_artifact_number:${String(value)}`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`unsupported_artifact_value:${typeof value}`);
  if (ancestors.has(value)) throw new TypeError('artifact_cycle');
  ancestors.add(value);
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Set.prototype || prototype === Map.prototype) {
      if (Reflect.ownKeys(value).length > 0)
        throw new TypeError('artifact_collection_extra_property');
      const kind = prototype === Set.prototype ? 'set' : 'map';
      containers.push({ path: [...path], kind });
      const members =
        kind === 'set' ? [...(value as Set<unknown>)] : [...(value as Map<unknown, unknown>)];
      return encodeLossless(members, path, undefinedPaths, ancestors, containers);
    }
    if (Array.isArray(value)) {
      const values: unknown[] = value;
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === 'symbol'))
        throw new TypeError('artifact_array_symbol_property');
      const ownIndices = new Set(
        keys.filter((key): key is string => typeof key === 'string' && key !== 'length'),
      );
      if (ownIndices.size !== value.length) throw new TypeError('artifact_sparse_array');
      for (const key of ownIndices) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
          throw new TypeError('artifact_array_extra_property');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !('value' in descriptor))
          throw new TypeError('artifact_array_accessor_or_hidden_property');
      }
      return Array.from({ length: value.length }, (_, index) => {
        const encoded = encodeLossless(
          values[index],
          [...path, index],
          undefinedPaths,
          ancestors,
          containers,
        );
        return encoded === OMIT ? null : encoded;
      });
    }
    if (prototype === null) containers.push({ path: [...path], kind: 'nullObject' });
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('artifact_non_plain_object');
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol'))
      throw new TypeError('artifact_symbol_property');
    const output: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor))
        throw new TypeError('artifact_accessor_or_hidden_property');
      const encoded = encodeLossless(
        descriptor.value,
        [...path, key],
        undefinedPaths,
        ancestors,
        containers,
      );
      if (encoded !== OMIT) defineValue(output, key, encoded);
    }
    return output;
  } catch (cause) {
    if (cause instanceof Error && !cause.message.includes(' at artifact '))
      cause.message += ` at artifact ${JSON.stringify(path)}`;
    throw cause;
  } finally {
    ancestors.delete(value);
  }
}

export function serializeProductionAuditArtifact(value: unknown): Buffer {
  const undefinedPaths: (string | number)[][] = [];
  const containers: ArtifactContainer[] = [];
  const encoded = encodeLossless(value, [], undefinedPaths, new Set(), containers);
  return Buffer.from(
    `${JSON.stringify(
      {
        artifactVersion: 2,
        payload: encoded === OMIT ? null : encoded,
        undefinedPaths,
        containers,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export function decodeProductionAuditArtifact(bytes: Uint8Array): unknown {
  const envelope: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !('artifactVersion' in envelope) ||
    envelope.artifactVersion !== 2 ||
    !('payload' in envelope) ||
    !('undefinedPaths' in envelope) ||
    !Array.isArray(envelope.undefinedPaths) ||
    !('containers' in envelope) ||
    !Array.isArray(envelope.containers)
  )
    throw new TypeError('invalid_production_audit_artifact_envelope');
  let payload: unknown = envelope.payload;
  const seen = new Set<string>();
  const pathOf = (raw: unknown): ArtifactPath => {
    if (
      !Array.isArray(raw) ||
      raw.some(
        (segment: unknown) =>
          typeof segment !== 'string' &&
          !(typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0),
      )
    )
      throw new TypeError('invalid_production_audit_artifact_path');
    const path = raw as ArtifactPath;
    const key = JSON.stringify(path);
    if (seen.has(key)) throw new TypeError('duplicate_production_audit_artifact_value_path');
    seen.add(key);
    return path;
  };
  const parentOf = (
    path: ArtifactPath,
  ): { parent: Record<string | number, unknown>; leaf: string | number } => {
    let parent = payload;
    for (const segment of path.slice(0, -1)) {
      if (
        !parent ||
        typeof parent !== 'object' ||
        !Object.hasOwn(parent, segment) ||
        (Array.isArray(parent) ? typeof segment !== 'number' : typeof segment !== 'string')
      )
        throw new TypeError('invalid_production_audit_artifact_value_path');
      parent = (parent as Record<string | number, unknown>)[segment];
    }
    const leaf = path.at(-1)!;
    if (
      !parent ||
      typeof parent !== 'object' ||
      (Array.isArray(parent)
        ? typeof leaf !== 'number' || leaf >= parent.length
        : typeof leaf !== 'string')
    )
      throw new TypeError('invalid_production_audit_artifact_value_path');
    return { parent: parent as Record<string | number, unknown>, leaf };
  };
  for (const rawPath of envelope.undefinedPaths as unknown[]) {
    const path = pathOf(rawPath);
    if (path.length === 0) {
      if (payload !== null) throw new TypeError('invalid_production_audit_artifact_undefined_path');
      payload = undefined;
    } else {
      const { parent, leaf } = parentOf(path);
      if (Array.isArray(parent) ? parent[leaf as number] !== null : Object.hasOwn(parent, leaf))
        throw new TypeError('invalid_production_audit_artifact_undefined_path');
      defineValue(parent, leaf, undefined);
    }
  }
  const containers = (envelope.containers as unknown[])
    .map((raw) => {
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('path' in raw) ||
        !('kind' in raw) ||
        !['set', 'map', 'nullObject'].includes(String(raw.kind))
      )
        throw new TypeError('invalid_production_audit_artifact_container');
      return { path: pathOf(raw.path), kind: raw.kind };
    })
    .sort((a, b) => b.path.length - a.path.length);
  for (const { path, kind } of containers) {
    const location = path.length ? parentOf(path) : null;
    if (location && !Object.hasOwn(location.parent, location.leaf))
      throw new TypeError('invalid_production_audit_artifact_container_path');
    const value = location ? location.parent[location.leaf] : payload;
    let restored: unknown;
    if (kind === 'nullObject') {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype
      )
        throw new TypeError('invalid_production_audit_artifact_container');
      restored = Object.assign(Object.create(null) as object, value);
    } else {
      if (!Array.isArray(value)) throw new TypeError('invalid_production_audit_artifact_container');
      if (kind === 'set') {
        const members: unknown[] = value;
        const set = new Set(members);
        if (set.size !== members.length)
          throw new TypeError('duplicate_production_audit_artifact_set_member');
        restored = set;
      } else {
        if (value.some((entry: unknown) => !Array.isArray(entry) || entry.length !== 2))
          throw new TypeError('invalid_production_audit_artifact_map_entry');
        const entries = value as [unknown, unknown][];
        const map = new Map(entries);
        if (map.size !== entries.length)
          throw new TypeError('duplicate_production_audit_artifact_map_key');
        restored = map;
      }
    }
    if (location) defineValue(location.parent, location.leaf, restored);
    else payload = restored;
  }
  return payload;
}

export function productionAuditTestOptions(paths: readonly string[]): ProductionAuditTestOptions {
  const normalized = paths.map((path) => validateArtifactPath(path));
  if (new Set(normalized).size !== normalized.length)
    throw new TypeError('duplicate_production_audit_artifact_path');
  return {
    meta: {
      fgoProductionAuditArtifacts: {
        version: PRODUCTION_AUDIT_ARTIFACT_CONTRACT_VERSION,
        requiredArtifacts: normalized.map((path) => ({ path, format: 'json', allowEmpty: false })),
        receipts: [],
      },
    } as unknown as NonNullable<TestOptions['meta']>,
  };
}

function validateArtifactPath(path: string): string {
  if (isAbsolute(path) || path.length === 0 || path.includes('\\'))
    throw new TypeError('invalid_production_audit_artifact_path');
  const normalized = path.split('/').filter((segment) => segment !== '');
  if (normalized.length === 0 || normalized.some((segment) => segment === '.' || segment === '..'))
    throw new TypeError('invalid_production_audit_artifact_path');
  return normalized.join('/');
}

async function ensureNoSymlinkPath(root: string, target: string): Promise<void> {
  const relativePath = relative(root, target);
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`))
    throw new TypeError('production_audit_artifact_outside_run_directory');
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new TypeError('production_audit_artifact_unsafe_root');
  let current = root;
  const segments = relativePath.split(sep);
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new TypeError('production_audit_artifact_unsafe_parent');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      await mkdir(current).catch((mkdirCause: unknown) => {
        if (
          !mkdirCause ||
          typeof mkdirCause !== 'object' ||
          !('code' in mkdirCause) ||
          mkdirCause.code !== 'EEXIST'
        )
          throw mkdirCause;
      });
      const created = await lstat(current);
      if (created.isSymbolicLink() || !created.isDirectory())
        throw new TypeError('production_audit_artifact_unsafe_parent');
    }
  }
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new TypeError('production_audit_artifact_target_symlink');
    throw new TypeError('production_audit_artifact_already_exists');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
}

export async function writeProductionAuditArtifact(
  taskMetadata: unknown,
  path: string,
  value: unknown,
): Promise<ProductionAuditArtifactReceipt> {
  if (!taskMetadata || typeof taskMetadata !== 'object' || Array.isArray(taskMetadata))
    throw new TypeError('production_audit_artifact_contract_missing');
  const rawContract = (taskMetadata as Record<string, unknown>)['fgoProductionAuditArtifacts'];
  if (!rawContract || typeof rawContract !== 'object' || Array.isArray(rawContract))
    throw new TypeError('production_audit_artifact_contract_missing');
  const contractRecord = rawContract as Record<string, unknown>;
  if (
    contractRecord['version'] !== PRODUCTION_AUDIT_ARTIFACT_CONTRACT_VERSION ||
    !Array.isArray(contractRecord['requiredArtifacts']) ||
    !Array.isArray(contractRecord['receipts'])
  )
    throw new TypeError('production_audit_artifact_contract_missing');
  const requiredArtifacts = contractRecord['requiredArtifacts'] as unknown[];
  const receipts = contractRecord['receipts'] as unknown[];
  const declaredPaths = requiredArtifacts.map((descriptor) => {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor))
      throw new TypeError('production_audit_artifact_declaration_invalid');
    const record = descriptor as Record<string, unknown>;
    if (
      typeof record['path'] !== 'string' ||
      record['format'] !== 'json' ||
      record['allowEmpty'] !== false
    )
      throw new TypeError('production_audit_artifact_declaration_invalid');
    const declaredPath = validateArtifactPath(record['path']);
    if (declaredPath !== record['path'])
      throw new TypeError('production_audit_artifact_declaration_invalid');
    return declaredPath;
  });
  if (new Set(declaredPaths).size !== declaredPaths.length)
    throw new TypeError('duplicate_production_audit_artifact_path');
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt))
      throw new TypeError('production_audit_artifact_receipt_invalid');
    const record = receipt as Record<string, unknown>;
    if (
      typeof record['path'] !== 'string' ||
      !Number.isSafeInteger(record['expectedBytes']) ||
      (record['expectedBytes'] as number) < 0 ||
      typeof record['expectedSha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record['expectedSha256'])
    )
      throw new TypeError('production_audit_artifact_receipt_invalid');
    if (validateArtifactPath(record['path']) !== record['path'])
      throw new TypeError('production_audit_artifact_receipt_invalid');
  }
  const typedContract = rawContract as unknown as ProductionAuditArtifactContract;
  const normalizedPath = validateArtifactPath(path);
  const required = declaredPaths.filter((requiredPath) => requiredPath === normalizedPath);
  if (required.length !== 1)
    throw new TypeError('production_audit_artifact_not_declared_exactly_once');
  if (typedContract.receipts.some(({ path: receiptPath }) => receiptPath === normalizedPath))
    throw new TypeError('duplicate_production_audit_artifact_receipt');
  const artifactRoot = process.env['FGO_TEST_ARTIFACT_DIR'];
  if (!artifactRoot) throw new TypeError('production_audit_artifact_directory_missing');
  const bytes = serializeProductionAuditArtifact(value);
  const receipt = {
    path: normalizedPath,
    expectedBytes: bytes.byteLength,
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
  };
  typedContract.receipts.push(receipt);
  const root = resolve(artifactRoot);
  const target = resolve(root, ...normalizedPath.split('/'));
  await ensureNoSymlinkPath(root, target);
  const temporary = resolve(dirname(target), `.artifact-${randomBytes(16).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch((cause: unknown) => {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'ENOENT')
        throw cause;
    });
  }
  return receipt;
}
