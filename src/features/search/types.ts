import type { Observation, Species } from "../../types/domain";

export interface ObservationsResponse {
  speciesCode: string;
  days: number;
  generatedAt: string;
  observations: Observation[];
}

export interface SpeciesSearchResponse {
  results: Species[];
}

export interface SpeciesResolveResponse {
  species: Species | null;
  candidates: Species[];
}

export interface SearchRequest {
  requestId: string;
  species: Species;
  days: number;
}

export interface SearchResult {
  requestId: string;
  species: Species;
  days: number;
  payload: ObservationsResponse;
}
