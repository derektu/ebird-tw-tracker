/**
 * Connects the shared Search Snapshot contract to the Desktop Node service.
 * The browser never owns persistent baselines, so restarts and server port
 * changes use the same application-data file.
 */
export function createDesktopSearchSnapshotStore({ request }) {
  return {
    async advance(token) {
      if (!token.isCurrent()) return false;
      await request("/api/search-snapshot-sessions", {
        method: "POST",
        body: JSON.stringify({ commitToken: token.commitToken }),
        signal: token.signal,
      });
      return token.isCurrent() ? undefined : false;
    },
    async read(scope, token) {
      const result = await request(
        `/api/search-snapshots?speciesCode=${encodeURIComponent(scope.speciesCode)}&days=${scope.days}`,
        { signal: token?.signal },
      );
      return result.snapshot;
    },
    async commit(scope, snapshot, token) {
      if (token && !token.isCurrent()) return false;
      const result = await request("/api/search-snapshots", {
        method: "PUT",
        body: JSON.stringify({ scope, snapshot, commitToken: token?.commitToken }),
        signal: token?.signal,
      });
      return result.committed === false || (token && !token.isCurrent()) ? false : undefined;
    },
  };
}
