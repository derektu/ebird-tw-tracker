import type { SavedBirdSpotStore } from "../../types/domain";
export function createDesktopSavedBirdSpotStore(options: {
  request(url: string, options?: RequestInit): Promise<unknown>;
}): SavedBirdSpotStore;
