import type { BirdSpot, SavedBirdSpot } from "../types/domain";

export interface BirdSpotDirectoryItem extends BirdSpot {
  countryCode: string | null;
  subnational1Code: string | null;
  subnational2Code: string | null;
}
export type BirdSpotDirectorySearchItem = BirdSpot &
  Partial<Omit<BirdSpotDirectoryItem, keyof BirdSpot>> &
  Partial<Pick<SavedBirdSpot, "alias" | "note" | "pinned" | "savedAt" | "updatedAt">> & { saved: boolean };
export function normalizeBirdSpotText(value: unknown): string;
export function normalizeBirdSpotDirectory(items: unknown): BirdSpotDirectoryItem[];
export function searchBirdSpots(directory: BirdSpotDirectoryItem[], saved: SavedBirdSpot[], query?: string): BirdSpotDirectorySearchItem[];
