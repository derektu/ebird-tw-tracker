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
  source: SearchSource;
  species: Species;
  days: number;
}

export type SearchSource = "startup" | "explicit" | "notification-focus";

export interface SearchIntent {
  source?: SearchSource;
  species?: Species;
  query?: string;
  days: number;
  requestId?: string;
}

export interface SearchResult {
  requestId: string;
  source: SearchSource;
  species: Species;
  days: number;
  payload: ObservationsResponse;
}

export interface SearchObservationRequest {
  requestId: string;
  source: SearchSource;
  species: Species;
  days: number;
}

export interface SearchRuntime {
  resolveSpecies(
    intent: SearchIntent & { source: SearchSource; days: number },
    lifecycle: { isCurrent(): boolean },
  ): Promise<Species>;
  fetchObservations(request: SearchObservationRequest): Promise<ObservationsResponse>;
}

export interface SearchBusyEvent {
  type: "busy";
  busy: boolean;
  requestId: string;
  source: SearchSource;
  species?: Species;
  query?: string;
  days: number;
}

export interface SearchCompletedEvent {
  type: "completed";
  result: SearchResult;
}

export interface SearchFailedEvent {
  type: "failed";
  error: {
    requestId: string;
    source: SearchSource;
    message: string;
  };
}

export type SearchWorkflowEvent = SearchBusyEvent | SearchCompletedEvent | SearchFailedEvent;
