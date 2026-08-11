/**
 * Connects the shared Search Snapshot contract to the Desktop Node service.
 * The browser never owns persistent baselines, so restarts and server port
 * changes use the same application-data file.
 */
export function createDesktopSearchSnapshotStore({ request }) {
  return {
    async read(scope, token) {
      const result = await request(
        `/api/search-snapshots?speciesCode=${encodeURIComponent(scope.speciesCode)}&days=${scope.days}`,
        { signal: token?.signal },
      );
      return result.snapshot;
    },
    async commit(scope, snapshot, token) {
      if (token && !token.isCurrent()) return false;
      await request("/api/search-snapshots", {
        method: "PUT",
        body: JSON.stringify({ scope, snapshot }),
        signal: token?.signal,
      });
      return token && !token.isCurrent() ? false : undefined;
    },
  };
}
