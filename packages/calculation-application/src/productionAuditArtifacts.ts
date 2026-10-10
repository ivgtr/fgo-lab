import { randomBytes, createHash } from 'node:crypto';
import { lstat, link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { TestOptions } from 'vitest';
import { types } from 'node:util';

export const PRODUCTION_AUDIT_ARTIFACT_META_KEY = 'fgoProductionAuditArtifacts';
export const PRODUCTION_AUDIT_ARTIFACT_CONTRACT_VERSION = 2;

export interface ProductionAuditArtifactDescriptor {
  path: string;
  format: 'json-gzip';
  allowEmpty: false;
}

export interface ProductionAuditArtifactReceipt {
  path: string;
  expectedBytes: number;
  expectedSha256: string;
  expectedDecodedBytes: number;
  expectedDecodedSha256: string;
}

export interface ProductionAuditArtifactContract {
  version: 2;
  requiredArtifacts: ProductionAuditArtifactDescriptor[];
  receipts: ProductionAuditArtifactReceipt[];
}

export interface ProductionAuditTestOptions {
  meta: NonNullable<TestOptions['meta']>;
}

const OMIT = Symbol('omit-undefined-property');
const completedDiagnostics = new WeakSet();
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
  plainValues: WeakMap<object, unknown>,
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
  if (completedDiagnostics.has(value)) return value;
  if (types.isProxy(value)) throw new TypeError('artifact_proxy');
  if (ancestors.has(value)) throw new TypeError('artifact_cycle');
  if (plainValues.has(value)) return plainValues.get(value);
  const undefinedStart = undefinedPaths.length;
  const containerStart = containers.length;
  // Only completed subtrees without path-dependent restoration metadata can be reused.
  // Encoding is synchronous, rejects accessors, and owns this cache for one call only.
  const complete = (encoded: unknown): unknown => {
    if (undefinedPaths.length === undefinedStart && containers.length === containerStart)
      plainValues.set(value, encoded);
    return encoded;
  };
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
      return encodeLossless(members, path, undefinedPaths, ancestors, containers, plainValues);
    }
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) throw new TypeError('artifact_non_plain_array');
      const values: unknown[] = value;
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === 'symbol'))
        throw new TypeError('artifact_array_symbol_property');
      if (keys.length !== value.length + 1) throw new TypeError('artifact_sparse_array');
      for (const key of keys) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
          throw new TypeError('artifact_array_extra_property');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !('value' in descriptor))
          throw new TypeError('artifact_array_accessor_or_hidden_property');
      }
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index++) {
        path.push(index);
        try {
          const encoded = encodeLossless(
            values[index],
            path,
            undefinedPaths,
            ancestors,
            containers,
            plainValues,
          );
          output.push(encoded === OMIT ? null : encoded);
        } finally {
          path.pop();
        }
      }
      return complete(output);
    }

    if (prototype === null) containers.push({ path: [...path], kind: 'nullObject' });
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('artifact_non_plain_object');
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol'))
      throw new TypeError('artifact_symbol_property');
    // Raw caller values are projected into owned data; only factory-completed graphs bypass this.
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor))
        throw new TypeError('artifact_accessor_or_hidden_property');
      path.push(key);
      try {
        const encoded = encodeLossless(
          descriptor.value,
          path,
          undefinedPaths,
          ancestors,
          containers,
          plainValues,
        );
        if (encoded !== OMIT) output[key] = encoded;
      } finally {
        path.pop();
      }
    }
    return complete(output);
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
  const encoded = encodeLossless(value, [], undefinedPaths, new Set(), containers, new WeakMap());
  if (Object.hasOwn(Object.prototype, 'toJSON') || Object.hasOwn(Array.prototype, 'toJSON'))
    throw new TypeError('artifact_inherited_toJSON');
  return Buffer.from(
    `${JSON.stringify({
      artifactVersion: 2,
      payload: encoded === OMIT ? null : encoded,
      undefinedPaths,
      containers,
    })}\n`,
    'utf8',
  );
}

export function decodeProductionAuditArtifact(bytes: Uint8Array): unknown {
  const envelope: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Object.keys(envelope).some(
      (key) => !['artifactVersion', 'payload', 'undefinedPaths', 'containers'].includes(key),
    ) ||
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
        Object.keys(raw).some((key) => !['path', 'kind'].includes(key)) ||
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
        if (
          value.some(
            (entry: unknown) =>
              !Array.isArray(entry) || entry.length !== 2 || Reflect.ownKeys(entry).length !== 3,
          )
        )
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

/** Stored diagnostics use one explicit transport; plain JSON is only the in-memory codec. */
export function decodeStoredProductionAuditArtifact(bytes: Uint8Array): unknown {
  return decodeProductionAuditArtifact(gunzipSync(bytes));
}

/** The owner maps logical JSON names to stored transport paths for every disk consumer. */
export async function readStoredProductionAuditArtifact(logicalPath: string): Promise<Buffer> {
  const artifactRoot = process.env['FGO_TEST_ARTIFACT_DIR'];
  if (!artifactRoot) throw new TypeError('production_audit_artifact_directory_missing');
  return readFile(resolve(artifactRoot, storedArtifactPath(logicalPath)));
}

export function productionAuditTestOptions(paths: readonly string[]): ProductionAuditTestOptions {
  const normalized = paths.map((path) => storedArtifactPath(path));
  if (new Set(normalized).size !== normalized.length)
    throw new TypeError('duplicate_production_audit_artifact_path');
  return {
    meta: {
      fgoProductionAuditArtifacts: {
        version: PRODUCTION_AUDIT_ARTIFACT_CONTRACT_VERSION,
        requiredArtifacts: normalized.map((path) => ({
          path,
          format: 'json-gzip',
          allowEmpty: false,
        })),
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

function storedArtifactPath(path: string): string {
  const normalized = validateArtifactPath(path);
  if (!normalized.endsWith('.json'))
    throw new TypeError('production_audit_artifact_logical_path_must_be_json');
  return `${normalized}.gz`;
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
    Object.keys(contractRecord).some(
      (key) => !['version', 'requiredArtifacts', 'receipts'].includes(key),
    ) ||
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
      Object.keys(record).some((key) => !['path', 'format', 'allowEmpty'].includes(key)) ||
      typeof record['path'] !== 'string' ||
      record['format'] !== 'json-gzip' ||
      record['allowEmpty'] !== false
    )
      throw new TypeError('production_audit_artifact_declaration_invalid');
    const declaredPath = validateArtifactPath(record['path']);
    if (declaredPath !== record['path'] || !declaredPath.endsWith('.json.gz'))
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
      Object.keys(record).some(
        (key) =>
          ![
            'path',
            'expectedBytes',
            'expectedSha256',
            'expectedDecodedBytes',
            'expectedDecodedSha256',
          ].includes(key),
      ) ||
      typeof record['path'] !== 'string' ||
      !Number.isSafeInteger(record['expectedBytes']) ||
      (record['expectedBytes'] as number) < 0 ||
      typeof record['expectedSha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record['expectedSha256']) ||
      !Number.isSafeInteger(record['expectedDecodedBytes']) ||
      (record['expectedDecodedBytes'] as number) <= 0 ||
      typeof record['expectedDecodedSha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record['expectedDecodedSha256'])
    )
      throw new TypeError('production_audit_artifact_receipt_invalid');
    if (validateArtifactPath(record['path']) !== record['path'])
      throw new TypeError('production_audit_artifact_receipt_invalid');
  }
  const typedContract = rawContract as unknown as ProductionAuditArtifactContract;
  const normalizedPath = storedArtifactPath(path);
  const required = declaredPaths.filter((requiredPath) => requiredPath === normalizedPath);
  if (required.length !== 1)
    throw new TypeError('production_audit_artifact_not_declared_exactly_once');
  if (typedContract.receipts.some(({ path: receiptPath }) => receiptPath === normalizedPath))
    throw new TypeError('duplicate_production_audit_artifact_receipt');
  const artifactRoot = process.env['FGO_TEST_ARTIFACT_DIR'];
  if (!artifactRoot) throw new TypeError('production_audit_artifact_directory_missing');
  const decodedBytes = serializeProductionAuditArtifact(value);
  const bytes = gzipSync(decodedBytes, { level: 1 });
  const receipt = {
    path: normalizedPath,
    expectedBytes: bytes.byteLength,
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    expectedDecodedBytes: decodedBytes.byteLength,
    expectedDecodedSha256: createHash('sha256').update(decodedBytes).digest('hex'),
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

// Version 4: nonnegative integers address nodes; negative integers address strings (-index - 1).
// Numeric literals stay tagged, so values and references cannot be confused.
type DiagnosticValue = number | boolean | null | { kind: 'literal'; value: number };
type DiagnosticNode =
  | { kind: 'undefined' }
  | { kind: 'object' | 'nullObject'; entries: [string, DiagnosticValue][] }
  | { kind: 'array'; items: DiagnosticValue[] }
  | { kind: 'set'; items: DiagnosticValue[] }
  | { kind: 'map'; entries: [DiagnosticValue, DiagnosticValue][] };
/** Complete test diagnostic values, interned without changing gate/assertion/runner contracts. */
export function encodeProductionAuditDiagnostic(payload: unknown) {
  if (Object.hasOwn(Object.prototype, 'toJSON') || Object.hasOwn(Array.prototype, 'toJSON'))
    throw new TypeError('unsupported_diagnostic_inherited_toJSON');
  const identityMembers = new WeakSet();
  const validated = new WeakSet();
  const validating = new WeakSet();
  const validate = (value: unknown): void => {
    if (
      value === undefined ||
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new TypeError('invalid_diagnostic_number');
      return;
    }
    if (typeof value !== 'object') throw new TypeError('unsupported_diagnostic_value');
    if (types.isProxy(value)) throw new TypeError('unsupported_diagnostic_proxy');
    if (validating.has(value)) throw new TypeError('diagnostic_cycle');
    if (validated.has(value)) return;
    validating.add(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Set.prototype || prototype === Map.prototype) {
      if (Reflect.ownKeys(value).length !== 0)
        throw new TypeError('unsupported_diagnostic_property');
      if (prototype === Set.prototype) {
        for (const item of value as Set<unknown>) {
          if (item !== null && typeof item === 'object') identityMembers.add(item);
          validate(item);
        }
      } else {
        for (const [key, item] of value as Map<unknown, unknown>) {
          if (key !== null && typeof key === 'object') identityMembers.add(key);
          validate(key);
          validate(item);
        }
      }
    } else if (Array.isArray(value)) {
      if (prototype !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
        throw new TypeError('invalid_diagnostic_array');
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor))
          throw new TypeError('invalid_diagnostic_array');
        validate(descriptor.value);
      }
    } else {
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('unsupported_diagnostic_prototype');
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') throw new TypeError('unsupported_diagnostic_key');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('unsupported_diagnostic_property');
        validate(descriptor.value);
      }
    }
    validating.delete(value);
    validated.add(value);
  };
  validate(payload);
  const nodes: DiagnosticNode[] = [];
  const strings: { prefix: number; suffix: string }[] = [];
  const stringParts = new Map<string, number>();
  const stringIndices = new Map<string, number>();
  const identities = new WeakMap<object, number>();
  const contents = new Map<string, number>();
  const ancestors = new Set<object>();
  let undefinedIndex: number | undefined;
  const literals = new Map<number, DiagnosticValue>();
  const literal = (value: number): DiagnosticValue => {
    let encoded = literals.get(value);
    if (encoded === undefined) {
      encoded = Object.freeze({ kind: 'literal' as const, value });
      literals.set(value, encoded);
    }
    return encoded;
  };
  const visit = (value: unknown): DiagnosticValue => {
    if (value === null || typeof value === 'boolean') return value;
    if (value === undefined) {
      if (undefinedIndex === undefined) {
        undefinedIndex = nodes.length;
        nodes.push({ kind: 'undefined' });
      }
      return undefinedIndex;
    }
    if (typeof value === 'string') {
      let index = stringIndices.get(value);
      if (index === undefined) {
        let prefix = -1;
        // Fixed UTF-16 slices preserve even lone surrogates; this is byte/value compression,
        // independent of the meanings or spelling of diagnostic paths.
        for (let offset = 0; offset < value.length || offset === 0; offset += 128) {
          const suffix = value.slice(offset, offset + 128);
          const key = JSON.stringify([prefix, suffix]);
          let part = stringParts.get(key);
          if (part === undefined) {
            part = strings.length;
            strings.push({ prefix, suffix });
            stringParts.set(key, part);
          }
          prefix = part;
        }
        index = prefix;
        stringIndices.set(value, index);
      }
      return -index - 1;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new TypeError('invalid_diagnostic_number');
      return literal(value);
    }
    if (typeof value !== 'object') throw new TypeError('unsupported_diagnostic_value');
    if (ancestors.has(value)) throw new TypeError('diagnostic_cycle');
    const prior = identities.get(value);
    if (prior !== undefined) return prior;
    ancestors.add(value);
    let node: DiagnosticNode;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Set.prototype)
      node = { kind: 'set', items: [...(value as Set<unknown>)].map(visit) };
    else if (prototype === Map.prototype)
      node = {
        kind: 'map',
        entries: [...(value as Map<unknown, unknown>)].map(([key, item]) => [
          visit(key),
          visit(item),
        ]),
      };
    else if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1)
        throw new TypeError('invalid_diagnostic_array');
      node = { kind: 'array', items: value.map(visit) };
    } else {
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('unsupported_diagnostic_prototype');
      const entries: [string, DiagnosticValue][] = Reflect.ownKeys(value).map((key) => {
        if (typeof key !== 'string') throw new TypeError('unsupported_diagnostic_key');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('unsupported_diagnostic_property');
        return [key, visit(descriptor.value)];
      });
      node = { kind: prototype === null ? 'nullObject' : 'object', entries };
    }
    ancestors.delete(value);
    const key = identityMembers.has(value) ? undefined : JSON.stringify(node);
    let index = key === undefined ? undefined : contents.get(key);
    if (index === undefined) {
      index = nodes.length;
      nodes.push(node);
      if (key !== undefined) contents.set(key, index);
    }
    identities.set(value, index);
    return index;
  };
  const root = visit(payload);
  for (const node of nodes) {
    if ('entries' in node) {
      for (const entry of node.entries) Object.freeze(entry);
      Object.freeze(node.entries);
    } else if ('items' in node) Object.freeze(node.items);
    Object.freeze(node);
  }
  for (const part of strings) Object.freeze(part);
  const completed = Object.freeze({
    version: 4 as const,
    root,
    nodes: Object.freeze(nodes),
    strings: Object.freeze(strings),
  });
  completedDiagnostics.add(completed);
  return completed;
}
function diagnosticRecord(
  value: unknown,
  ownedPlainData: boolean,
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (!ownedPlainData && types.isProxy(value))
  )
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (ownedPlainData) return true;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return descriptor.enumerable && 'value' in descriptor;
  });
}
function diagnosticArray(value: unknown, ownedPlainData: boolean): value is unknown[] {
  if (ownedPlainData) return Array.isArray(value);
  if (
    !Array.isArray(value) ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return false;
  }
  return true;
}
function decodeDiagnosticValue(encoded: unknown, ownedPlainData: boolean): unknown {
  const record = (value: unknown): value is Record<string, unknown> =>
    diagnosticRecord(value, ownedPlainData);
  const array = (value: unknown): value is unknown[] => diagnosticArray(value, ownedPlainData);
  if (
    !record(encoded) ||
    Object.keys(encoded).length !== 4 ||
    !Object.hasOwn(encoded, 'root') ||
    !Object.hasOwn(encoded, 'version') ||
    !Object.hasOwn(encoded, 'nodes') ||
    !Object.hasOwn(encoded, 'strings') ||
    encoded['version'] !== 4 ||
    !array(encoded['nodes']) ||
    !array(encoded['strings'])
  )
    throw new TypeError('invalid_diagnostic_version_or_envelope');
  const strings: string[] = [];
  for (const part of encoded['strings']) {
    if (
      !record(part) ||
      Object.keys(part).length !== 2 ||
      !Object.hasOwn(part, 'prefix') ||
      !Object.hasOwn(part, 'suffix') ||
      typeof part['prefix'] !== 'number' ||
      !Number.isSafeInteger(part['prefix']) ||
      Object.is(part['prefix'], -0) ||
      part['prefix'] < -1 ||
      part['prefix'] >= strings.length ||
      typeof part['suffix'] !== 'string' ||
      part['suffix'].length > 128 ||
      (part['prefix'] >= 0 && part['suffix'].length === 0)
    )
      throw new TypeError('invalid_diagnostic_string_part');
    strings.push((part['prefix'] < 0 ? '' : strings[part['prefix']]!) + part['suffix']);
  }
  const values: unknown[] = [];
  const read = (value: unknown): unknown => {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value !== 'number') {
      if (
        !record(value) ||
        Object.keys(value).length !== 2 ||
        value['kind'] !== 'literal' ||
        !Object.hasOwn(value, 'kind') ||
        !Object.hasOwn(value, 'value') ||
        typeof value['value'] !== 'number' ||
        !Number.isFinite(value['value']) ||
        Object.is(value['value'], -0)
      )
        throw new TypeError('invalid_diagnostic_literal');
      return value['value'];
    }
    if (!Number.isSafeInteger(value) || Object.is(value, -0))
      throw new TypeError('invalid_diagnostic_reference');
    if (value < 0) {
      const index = -value - 1;
      if (index >= strings.length) throw new TypeError('invalid_diagnostic_string_reference');
      return strings[index];
    }
    if (value >= values.length) throw new TypeError('invalid_diagnostic_reference');
    return values[value];
  };
  for (const node of encoded['nodes']) {
    if (!record(node) || !Object.hasOwn(node, 'kind'))
      throw new TypeError('invalid_diagnostic_node');
    const kind = node['kind'];
    if (kind === 'undefined') {
      if (Object.keys(node).length !== 1) throw new TypeError('invalid_diagnostic_node');
      values.push(undefined);
      continue;
    }
    const field =
      kind === 'array' || kind === 'set'
        ? 'items'
        : kind === 'map' || kind === 'object' || kind === 'nullObject'
          ? 'entries'
          : null;
    if (
      !field ||
      Object.keys(node).length !== 2 ||
      !Object.hasOwn(node, field) ||
      !array(node[field])
    )
      throw new TypeError('invalid_diagnostic_node');
    const cells = node[field];
    if (kind === 'array') values.push(cells.map(read));
    else if (kind === 'set') {
      const value = new Set(cells.map(read));
      if (value.size !== cells.length) throw new TypeError('invalid_diagnostic_set');
      values.push(value);
    } else if (kind === 'map') {
      const entries = cells.map((entry) => {
        if (!array(entry) || entry.length !== 2) throw new TypeError('invalid_diagnostic_entry');
        return [read(entry[0]), read(entry[1])] as const;
      });
      const value = new Map(entries);
      if (value.size !== entries.length) throw new TypeError('invalid_diagnostic_map');
      values.push(value);
    } else {
      const value: Record<string, unknown> =
        kind === 'nullObject' ? (Object.create(null) as Record<string, unknown>) : {};
      for (const entry of cells) {
        if (
          !array(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== 'string' ||
          Object.hasOwn(value, entry[0])
        )
          throw new TypeError('invalid_diagnostic_entry');
        Object.defineProperty(value, entry[0], {
          value: read(entry[1]),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      values.push(value);
    }
  }
  return read(encoded['root']);
}

/** JS input is inspected unless it is the factory's actually frozen, privately completed graph. */
export function decodeProductionAuditDiagnostic(encoded: unknown): unknown {
  return decodeDiagnosticValue(
    encoded,
    encoded !== null && typeof encoded === 'object' && completedDiagnostics.has(encoded),
  );
}
/** The parsed values remain private until schema validation ends; JSON cannot create accessors/proxies. */
export function decodeStoredProductionAuditDiagnostic(bytes: Uint8Array): unknown {
  return decodeDiagnosticValue(decodeStoredProductionAuditArtifact(bytes), true);
}
