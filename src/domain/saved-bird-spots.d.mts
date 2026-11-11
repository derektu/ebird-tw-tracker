import type { SavedBirdSpot, SavedBirdSpotStore, SavedBirdSpotSort } from "../types/domain";
export class SavedBirdSpotError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, message: string, statusCode?: number);
}
export function parseSavedBirdSpot(value: unknown): SavedBirdSpot;
export function parseSavedBirdSpotDocument(value: unknown): { version: 1; spots: SavedBirdSpot[] };
export function sortSavedBirdSpots(spots: SavedBirdSpot[], sort?: SavedBirdSpotSort): SavedBirdSpot[];
export function storageError(code?: "storage_unavailable" | "storage_corrupt"): SavedBirdSpotError;
