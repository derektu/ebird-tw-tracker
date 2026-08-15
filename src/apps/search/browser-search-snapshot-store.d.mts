import type { SearchSnapshotStore } from "../../features/search/types";

export function createIndexedDbSearchSnapshotStore(options?: {
  databaseName?: string;
  indexedDB?: IDBFactory;
}): SearchSnapshotStore;
