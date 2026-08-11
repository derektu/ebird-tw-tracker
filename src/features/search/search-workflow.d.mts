import type { SearchIntent, SearchRuntime, SearchSnapshotStore, SearchWorkflowEvent } from "./types";

export type { SearchWorkflowEvent } from "./types";

export type SearchWorkflowOutcome =
  | { status: "completed"; result: import("./types").SearchResult }
  | { status: "failed"; error: import("./types").SearchFailedEvent["error"] }
  | { status: "stale"; requestId: string; source: import("./types").SearchSource };

export interface SearchWorkflow {
  run(intent: SearchIntent): Promise<SearchWorkflowOutcome>;
  invalidate(): void;
}

export function createSearchWorkflow(options: {
  runtime: SearchRuntime;
  publish: (event: SearchWorkflowEvent) => void;
  onStale?: (request: {
    requestId: string;
    source: import("./types").SearchSource;
  }) => void;
  onCancelled?: (request: {
    requestId: string;
    source: import("./types").SearchSource;
  }) => void;
  snapshots?: SearchSnapshotStore;
  now?: () => string;
  createRequestId?: (sequence: number) => string;
  createCommitSessionId?: () => string;
}): SearchWorkflow;

export function normalizeDays(days: number): number;
