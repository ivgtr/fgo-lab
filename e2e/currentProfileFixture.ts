import { webcrypto } from 'node:crypto';
import { profileCollectionSchema, type ProfileCollection } from '../packages/schema/src/index';
import { validateProfileCollection } from '../packages/workspace-domain/src/index';
import type { Page } from './observedTest';

// Positive current-save fixtures use the same validator as the repository. Invalid-byte
// fixtures intentionally write through their own explicit negative-test paths.
export async function editCurrentStoredProfiles(
  page: Page,
  edit: (collection: ProfileCollection) => void | Promise<void>,
): Promise<void> {
  const original = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const opening = indexedDB.open('fgo-lab', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const reading = db.transaction('user', 'readonly').objectStore('user').get('profiles');
          reading.onerror = () => {
            db.close();
            reject(reading.error);
          };
          reading.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(reading.result));
          };
        };
      }),
  );
  const collection = profileCollectionSchema.parse(JSON.parse(original));
  await edit(collection);
  await validateProfileCollection(collection, (bytes) =>
    webcrypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
  );
  await page.evaluate(
    ({ original, collection }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('fgo-lab', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction('user', 'readwrite');
          transaction.onabort = () => {
            db.close();
            reject(transaction.error ?? new Error('current_profile_fixture_changed'));
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          const store = transaction.objectStore('user');
          const reading = store.get('profiles');
          reading.onsuccess = () => {
            if (JSON.stringify(reading.result) !== original) {
              transaction.abort();
              return;
            }
            store.put(collection, 'profiles');
          };
        };
      }),
    { original, collection },
  );
}
