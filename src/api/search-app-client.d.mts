import type { Observation, Species } from "../types/domain";
import type { ObservationsResponse } from "../features/search/types";

export class SearchApiError extends Error {
  status: number;
  code: string;
}

export interface SearchAppClientOptions {
  apiKey: string;
  request?: typeof fetch;
  timeoutMs?: number;
}

export function searchSpecies(query: string, options: SearchAppClientOptions): Promise<Species[]>;
export function resolveSpecies(query: string, options: SearchAppClientOptions): Promise<Species | null>;
export function fetchObservations(
  request: { speciesCode: string; days: number },
  options: SearchAppClientOptions,
): Promise<ObservationsResponse>;

export type { Observation };
