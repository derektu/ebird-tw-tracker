import type { Species } from "../../types/domain";

export interface RecentSpeciesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecentSpecies(storage?: RecentSpeciesStorage | null): Species[];
export function recordRecentSpecies(species: Species, storage?: RecentSpeciesStorage | null): Species[];
export const MAX_RECENT_SPECIES: number;
