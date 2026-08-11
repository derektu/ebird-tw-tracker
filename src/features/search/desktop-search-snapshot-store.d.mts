import type { SearchSnapshotStore } from "./types";

export function createDesktopSearchSnapshotStore(options: {
  request(url: string, options?: RequestInit): Promise<{ snapshot: unknown }>;
}): SearchSnapshotStore;
