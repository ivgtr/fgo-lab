import { ZodError } from 'zod';
import type { ProfileCollection } from '@fgo-lab/schema';
import { profileCollectionSchema } from '@fgo-lab/schema';
import { canonicalize, validateProfileCollection } from '@fgo-lab/workspace-domain';
import type {
  ProfileRepository,
  ProfileWriteOptions,
  ProfileWriteResult,
} from '@fgo-lab/profile-domain';
import { labDatabase } from './labDatabase';
const database = labDatabase;
function isInvalidProfileCause(cause: unknown): boolean {
  return (
    cause instanceof ZodError ||
    (cause instanceof TypeError && cause.message === 'calculation_request_fingerprint_mismatch')
  );
}
export class IndexedDbProfileRepository implements ProfileRepository {
  async clear() {
    await (await database()).clear('user');
  }
  async load() {
    const db = await database();
    const value = await db.get('user', 'profiles');
    if (value === undefined) return { state: 'empty' as const };
    try {
      const collection = await validateProfileCollection(value, digestProfileRequest);
      return { state: 'ready' as const, collection };
    } catch (cause) {
      if (!isInvalidProfileCause(cause)) throw cause;
      return { state: 'invalid' as const, reason: 'profile_parse_failed' as const };
    }
  }
  async replaceInvalidWithFresh(collection: ProfileCollection): Promise<ProfileWriteResult> {
    const parsed = await validateProfileCollection(collection, digestProfileRequest);
    const db = await database();
    const original = await db.get('user', 'profiles');
    if (original === undefined) return { status: 'aborted', reason: 'stale' };
    try {
      await validateProfileCollection(original, digestProfileRequest);
      return { status: 'aborted', reason: 'stale' };
    } catch (cause) {
      if (!isInvalidProfileCause(cause)) throw cause;
    }
    const originalIdentity = canonicalize(original);
    const transaction = db.transaction('user', 'readwrite');
    void transaction.done.catch(() => undefined);
    const stale = new Error('profile_recovery_stale');
    try {
      const current = await transaction.objectStore('user').get('profiles');
      if (current === undefined || canonicalize(current) !== originalIdentity) throw stale;
      await transaction.objectStore('user').put(parsed, 'profiles');
      await transaction.done;
      return { status: 'committed' };
    } catch (cause) {
      try {
        transaction.abort();
      } catch {
        /* Commit or abort has already completed. */
      }
      await transaction.done.catch(() => undefined);
      if (cause === stale) return { status: 'aborted', reason: 'stale' };
      throw cause;
    }
  }
  async replace(
    collection: ProfileCollection,
    options: ProfileWriteOptions = {},
  ): Promise<ProfileWriteResult> {
    const isCurrent = () =>
      !options.guard || (!options.guard.signal.aborted && options.guard.isCurrent());
    if (!isCurrent()) return { status: 'aborted', reason: 'stale' };
    const parsed = await validateProfileCollection(collection, digestProfileRequest);
    const db = await database();
    if (!isCurrent()) return { status: 'aborted', reason: 'stale' };
    const stageKey = 'profiles/' + crypto.randomUUID();
    const transaction = db.transaction(
      options.backup ? ['user', 'staging', 'meta'] : ['user'],
      'readwrite',
    );
    void transaction.done.catch(() => undefined);
    const stale = new Error('profile_write_stale');
    const abort = () => {
      try {
        transaction.abort();
      } catch {
        /* Commit or abort has already completed. */
      }
    };
    const requireCurrent = () => {
      if (!isCurrent()) throw stale;
    };
    options.guard?.signal.addEventListener('abort', abort, { once: true });
    try {
      requireCurrent();
      if (options.requireEmpty) {
        const original = await transaction.objectStore('user').get('profiles');
        requireCurrent();
        if (original !== undefined) throw stale;
      }
      let staged = parsed;
      if (options.backup) {
        await transaction.objectStore('staging').put(parsed, stageKey);
        requireCurrent();
        staged = profileCollectionSchema.parse(
          await transaction.objectStore('staging').get(stageKey),
        );
        requireCurrent();
        if (canonicalize(staged) !== canonicalize(parsed))
          throw new TypeError('profile_staging_identity_mismatch');
        const original = await transaction.objectStore('user').get('profiles');
        requireCurrent();
        if (original !== undefined) {
          await transaction.objectStore('meta').put(original, 'profiles-before-v42-switch');
          requireCurrent();
        }
      }
      await transaction.objectStore('user').put(staged, 'profiles');
      requireCurrent();
      if (options.backup) {
        await transaction.objectStore('staging').delete(stageKey);
        requireCurrent();
      }
      await transaction.done;
      return { status: 'committed' };
    } catch (cause) {
      abort();
      await transaction.done.catch(() => undefined);
      if (
        cause === stale ||
        (options.guard?.signal.aborted &&
          cause instanceof DOMException &&
          cause.name === 'AbortError')
      )
        return { status: 'aborted', reason: 'stale' };
      throw cause;
    } finally {
      options.guard?.signal.removeEventListener('abort', abort);
    }
  }
  async replaceAtomicallyWithBackup(
    collection: ProfileCollection,
    options: Omit<ProfileWriteOptions, 'backup'> = {},
  ) {
    return this.replace(collection, { ...options, backup: true });
  }
}
function digestProfileRequest(data: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new Uint8Array(data));
}
