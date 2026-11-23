import type { RecentSpeciesStorage } from "./recent-species-store.mjs";
export type QueryMode = "species" | "spots";
export function readRecentQueries(mode: QueryMode, storage?: RecentSpeciesStorage | null): string[];
export function recordRecentQuery(mode: QueryMode, query: string, storage?: RecentSpeciesStorage | null, previous?: string[]): string[];
