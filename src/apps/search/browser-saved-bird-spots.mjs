import { createSavedBirdSpotStore, parseSavedBirdSpotDocument, SavedBirdSpotError, storageError } from "../../domain/saved-bird-spots.mjs";

const storeName = "saved-bird-spots";
function openDatabase(indexedDB, databaseName) {
  return new Promise((resolve, reject) => {
    let request, rejected = false;
    try { request = indexedDB.open(databaseName, 1); }
    catch { reject(storageError()); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(storageError());
    request.onblocked = () => { rejected = true; reject(storageError()); };
    request.onsuccess = () => {
      if (rejected) request.result.close();
      else resolve(request.result);
    };
  });
}
export function createIndexedDbSavedBirdSpotStore({ indexedDB = globalThis.indexedDB, databaseName = "ebird-saved-bird-spots", now } = {}) {
  return createSavedBirdSpotStore(async (operation, writable = true) => {
    const database = await openDatabase(indexedDB, databaseName);
    try {
      return await new Promise((resolve, reject) => {
        let transaction, result, failure;
        try {
          transaction = database.transaction(storeName, writable ? "readwrite" : "readonly");
          transaction.oncomplete = () => resolve(result);
          transaction.onabort = () => reject(failure ?? storageError());
          transaction.onerror = () => { failure ??= storageError(); };
          const objectStore = transaction.objectStore(storeName);
          const request = objectStore.get("collection");
          request.onsuccess = () => {
            try {
              const document = request.result === undefined ? { version: 1, spots: [] } : parseSavedBirdSpotDocument(request.result);
              const change = operation(document.spots);
              result = change.result;
              if (writable) objectStore.put({ version: 1, spots: change.spots }, "collection");
            } catch (error) {
              failure = error instanceof SavedBirdSpotError ? error : storageError();
              transaction.abort();
            }
          };
        } catch { reject(storageError()); }
      });
    } finally { database.close(); }
  }, now);
}
