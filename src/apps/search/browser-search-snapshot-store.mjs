const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "search-snapshots";

function snapshotStorageError() {
  return new Error("瀏覽器無法保存搜尋比較基準");
}

function snapshotForStorage(scope, snapshot) {
  return {
    scope: {
      speciesCode: scope.speciesCode,
      days: scope.days,
      key: scope.key,
    },
    recordedAt: snapshot.recordedAt,
    identityIds: [...new Set(snapshot.identityIds)],
  };
}

function openDatabase(indexedDB, databaseName) {
  return new Promise((resolve, reject) => {
    if (!indexedDB?.open) {
      reject(snapshotStorageError());
      return;
    }

    let request;
    try {
      request = indexedDB.open(databaseName, DATABASE_VERSION);
    } catch {
      reject(snapshotStorageError());
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? snapshotStorageError());
    request.onblocked = () => reject(snapshotStorageError());
  });
}

function runTransaction(database, mode, operation, token, activeTransactions) {
  return new Promise((resolve, reject) => {
    if (token && !token.isCurrent()) {
      resolve(false);
      return;
    }

    let transaction;
    let abortForStaleRequest;
    try {
      transaction = database.transaction(SNAPSHOT_STORE, mode);
      activeTransactions.add(transaction);
      abortForStaleRequest = () => {
        try {
          transaction.abort();
        } catch {
          // The transaction has already settled; its completion handler will
          // still check the request generation before reporting success.
        }
      };
      token?.signal?.addEventListener("abort", abortForStaleRequest, { once: true });
      transaction.oncomplete = () => {
        activeTransactions.delete(transaction);
        token?.signal?.removeEventListener("abort", abortForStaleRequest);
        resolve(token && !token.isCurrent() ? false : undefined);
      };
      transaction.onabort = () => {
        activeTransactions.delete(transaction);
        token?.signal?.removeEventListener("abort", abortForStaleRequest);
        if (token && !token.isCurrent()) {
          resolve(false);
          return;
        }
        reject(transaction.error ?? snapshotStorageError());
      };
      transaction.onerror = () => {
        activeTransactions.delete(transaction);
        token?.signal?.removeEventListener("abort", abortForStaleRequest);
        reject(transaction.error ?? snapshotStorageError());
      };
      operation(transaction.objectStore(SNAPSHOT_STORE));
    } catch {
      activeTransactions.delete(transaction);
      token?.signal?.removeEventListener("abort", abortForStaleRequest);
      reject(snapshotStorageError());
    }
  });
}

/**
 * Stores the current origin's Search Snapshots in IndexedDB. This adapter
 * deliberately has no localStorage fallback: API-key and MRU storage remain
 * separate browser concerns, while comparison baselines stay origin-local.
 */
export function createIndexedDbSearchSnapshotStore({
  databaseName = "ebird-search-snapshots",
  indexedDB = globalThis.indexedDB,
} = {}) {
  const activeTransactions = new Set();

  return {
    async advance(token) {
      if (!token.isCurrent()) return false;
      for (const transaction of activeTransactions) {
        try {
          transaction.abort();
        } catch {
          // A settled transaction has no mutable state left to abort.
        }
      }
      return undefined;
    },
    async read(scope, token) {
      const database = await openDatabase(indexedDB, databaseName);
      let value = null;
      try {
        const completed = await runTransaction(database, "readonly", (store) => {
          const request = store.get(scope.key);
          request.onsuccess = () => { value = request.result ?? null; };
        }, token, activeTransactions);
        return completed === false ? null : value;
      } finally {
        database.close?.();
      }
    },
    async commit(scope, snapshot, token) {
      const database = await openDatabase(indexedDB, databaseName);
      try {
        return await runTransaction(database, "readwrite", (store) => {
          store.put(snapshotForStorage(scope, snapshot), scope.key);
        }, token, activeTransactions);
      } finally {
        database.close?.();
      }
    },
  };
}
