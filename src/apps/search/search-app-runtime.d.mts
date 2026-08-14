import type { SearchIntent, SearchObservationRequest, SearchRuntime } from "../../features/search/types";
import type { ObservationsResponse } from "../../features/search/types";
import type { Species } from "../../types/domain";

export function createSearchAppRuntime(options: {
  resolveSpecies(query: string): Promise<Species | null>;
  fetchObservations(request: SearchObservationRequest): Promise<ObservationsResponse>;
}): SearchRuntime;

export type { SearchIntent };
