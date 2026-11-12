import type { BirdSpotRecentResponse, Observation, Species } from "../types/domain";
import type { ObservationsResponse } from "../features/search/types";

export class SearchApiError extends Error {
  status: number;
  code: string;
}

export interface SearchAppClientOptions {
  apiKey: string;
  request?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function searchSpecies(query: string, options: SearchAppClientOptions): Promise<Species[]>;
export function resolveSpecies(query: string, options: SearchAppClientOptions): Promise<Species | null>;
export function fetchObservations(
  request: { speciesCode: string; days: number },
  options: SearchAppClientOptions,
): Promise<ObservationsResponse>;

export type { Observation };

export function fetchBirdSpotRecent(request: { locId: string; days: number }, options: SearchAppClientOptions): Promise<BirdSpotRecentResponse>;
