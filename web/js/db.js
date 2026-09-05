// IndexedDB persistence. Three object stores, each holding whole documents:
// a workout carries its entries and sets inline rather than being stitched back
// together from separate tables, because that's exactly how the UI reads it.

// The app is called Overload; this key is not. It was named first, and renaming
// it would orphan every workout already logged on the device.
const DB_NAME = 'ledger';
// v2 added the `metrics` store. `onupgradeneeded` only creates what's missing,
// so an existing install keeps its workouts.
const DB_VERSION = 2;
const STORES = ['exercises', 'workouts', 'routines', 'metrics'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Another tab is holding an old version open.
    request.onblocked = () => reject(new Error('Overload is open in another tab; close it and reload.'));
  });

  return dbPromise;
}

function tx(store, mode, work) {
  return open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = work(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
export const remove = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));

export function putMany(store, values) {
  return tx(store, 'readwrite', (s) => {
    for (const value of values) s.put(value);
    return null;
  });
}

/** Wipes every store. Used by the "reset all data" action in settings. */
export function clearAll() {
  return open().then((db) => Promise.all(STORES.map((name) => new Promise((resolve, reject) => {
    const transaction = db.transaction(name, 'readwrite');
    transaction.objectStore(name).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  }))));
}

/**
 * Whether persistence is durable. Safari evicts IndexedDB for sites the user
 * hasn't installed or visited recently, so this drives a warning in settings.
 */
export async function isStoragePersisted() {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}
