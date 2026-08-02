import type { Observation, Species } from "../../types/domain";

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface Tracker {
  id: string;
  species: Species;
  days: number;
  intervalMinutes: number;
  enabled: boolean;
  quietHours: QuietHours;
  lastCheckedAt: string | null;
  lastFoundAt: string | null;
  createdAt: string;
  lastError?: string;
}

export interface TrackingResponse {
  tracker?: Tracker;
  trackers: Tracker[];
}

export interface TrackerCheckResult {
  tracker: Tracker;
  checkedAt: string;
  total: number;
  newObservations: Observation[];
}

export interface TrackerCheckResponse {
  checkedAt: string;
  results: TrackerCheckResult[];
  trackers: Tracker[];
}

export interface SpeciesSearchResponse {
  results: Species[];
}

export interface SpeciesResolveResponse {
  species: Species | null;
  candidates: Species[];
}

export interface AddTrackerRequest {
  species: Species;
  days?: number;
}
