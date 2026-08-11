import type { Species } from "../../types/domain";
import type { ObservationsResponse, SearchRuntime } from "./types";

export function createDesktopSearchRuntime(options: {
  loadSavedSpecies: () => Promise<Species[]>;
  resolveSpecies: (query: string) => Promise<Species | null>;
  fetchObservations: SearchRuntime["fetchObservations"];
  rememberStartupSpecies?: (species: Species) => void;
}): SearchRuntime;
