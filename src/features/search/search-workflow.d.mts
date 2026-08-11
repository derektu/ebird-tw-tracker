import type { SearchIntent, SearchRuntime, SearchWorkflowEvent } from "./types";

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
  createRequestId?: (sequence: number) => string;
}): SearchWorkflow;

export function normalizeDays(days: number): number;
