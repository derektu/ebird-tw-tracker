import type { SavedBirdSpotStore } from "../../types/domain";
export function createIndexedDbSavedBirdSpotStore(options?: {
  indexedDB?: IDBFactory | null;
  databaseName?: string;
  now?: () => string;
}): SavedBirdSpotStore;
