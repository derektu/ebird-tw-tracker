import type { Observation } from "../types/domain";

export interface SearchScope {
  speciesCode: string;
  days: number;
  key: string;
}

export interface SearchSnapshot {
  scope: SearchScope;
  recordedAt: string;
  identityIds: string[];
}

export type SearchComparison =
  | {
      status: "baseline-created";
      baselineAt: null;
      discoveryIds: string[];
      observations: Observation[];
      snapshot: SearchSnapshot;
    }
  | {
      status: "compared";
      baselineAt: string;
      discoveryIds: string[];
      observations: Observation[];
      snapshot: SearchSnapshot;
      snapshotCommit?: "saved" | "save-failed";
    }
  | {
      status: "unavailable";
      baselineAt: null;
      discoveryIds: string[];
      observations: Observation[];
      reason: "baseline-read-failed" | "initial-save-failed";
    };

export function createSearchScope(speciesCode: string, days: number): SearchScope;
export function createChecklistIdentity(speciesCode: string, subId: string): string;
export function createSearchSnapshot(scope: SearchScope, observations: Observation[], recordedAt: string): SearchSnapshot;
export function compareSearchSnapshot(
  scope: SearchScope,
  observations: Observation[],
  baseline: SearchSnapshot | null,
): SearchComparison;
