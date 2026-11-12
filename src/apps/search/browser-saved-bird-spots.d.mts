import type { BirdSpot, SavedBirdSpot, SavedBirdSpotStore } from "../../types/domain";
export function createIndexedDbSavedBirdSpotStore(options?: {
  indexedDB?: IDBFactory | null;
  databaseName?: string;
  now?: () => string;
}): SavedBirdSpotStore & { saveNote(spot: BirdSpot, note: string): Promise<SavedBirdSpot> };
