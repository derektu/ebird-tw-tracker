import { compareSearchSnapshot, createSearchScope, createSearchSnapshot } from "../../domain/search-discovery.mjs";

const DEFAULT_ERROR_MESSAGE = "鳥種查詢失敗";

function normalizeDays(days) {
  const numericDays = Number(days);
  if (!Number.isFinite(numericDays)) return 1;
  return Math.max(1, Math.min(Math.trunc(numericDays), 30));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
}

/**
 * Coordinate one search request at a runtime-neutral boundary.
 *
 * The workflow does not know how species or observations are loaded, nor how
 * lifecycle events are rendered. Runtime adapters provide those operations and
 * the caller observes the complete lifecycle through `publish`.
 */
export function createSearchWorkflow({
  runtime,
  publish,
  onStale,
  onCancelled,
  snapshots,
  now = () => new Date().toISOString(),
  createRequestId = (sequence) => `search-${sequence}`,
  createCommitSessionId = () => `search-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}) {
  let sequence = 0;
  let generation = 0;
  let activeRequest;
  const commitSessionId = createCommitSessionId();
  const cancelledRequestIds = new Set();

  function isCurrent(requestGeneration) {
    return requestGeneration === generation;
  }

  function invalidate() {
    const cancelled = activeRequest;
    generation += 1;
    activeRequest = undefined;
    if (cancelled) {
      cancelled.controller?.abort();
      const { controller: _controller, commitToken: _commitToken, ...cancelledRequest } = cancelled;
      cancelledRequestIds.add(cancelledRequest.requestId);
      onStale?.({ requestId: cancelledRequest.requestId, source: cancelledRequest.source });
      onCancelled?.({ requestId: cancelledRequest.requestId, source: cancelledRequest.source });
      publish({ type: "busy", busy: false, ...cancelledRequest });
    }
  }

  function publishStale(requestId, source) {
    if (cancelledRequestIds.delete(requestId)) return;
    onStale?.({ requestId, source });
  }

  async function compareEligibleSearch({ requestGeneration, source, species, days, payload, request, snapshotsUnavailable }) {
    const ordinaryObservations = payload.observations;
    if (!snapshots || source === "notification-focus") return { observations: ordinaryObservations };
    if (snapshotsUnavailable) {
      return {
        observations: ordinaryObservations,
        comparison: {
          status: "unavailable",
          baselineAt: null,
          discoveryIds: [],
          observations: ordinaryObservations,
          reason: "baseline-read-failed",
        },
      };
    }

    const scope = createSearchScope(species.speciesCode, days);
    let baseline;
    try {
      baseline = await snapshots.read(scope, {
        isCurrent: () => isCurrent(requestGeneration),
        signal: request.controller?.signal,
        commitToken: request.commitToken,
      });
    } catch {
      return {
        observations: ordinaryObservations,
        comparison: {
          status: "unavailable",
          baselineAt: null,
          discoveryIds: [],
          observations: ordinaryObservations,
          reason: "baseline-read-failed",
        },
      };
    }
    if (!isCurrent(requestGeneration)) return null;

    const comparison = compareSearchSnapshot(scope, ordinaryObservations, baseline);
    const snapshot = createSearchSnapshot(scope, ordinaryObservations, now());
    try {
      const committed = await snapshots.commit(scope, snapshot, {
        isCurrent: () => isCurrent(requestGeneration),
        signal: request.controller?.signal,
        commitToken: request.commitToken,
      });
      if (!isCurrent(requestGeneration) || committed === false) return null;
      if (!baseline) {
        return {
          observations: ordinaryObservations,
          comparison: { ...comparison, snapshot },
        };
      }
      return {
        observations: comparison.observations,
        comparison: { ...comparison, snapshot, snapshotCommit: "saved" },
      };
    } catch {
      if (!isCurrent(requestGeneration)) return null;
      if (!baseline) {
        return {
          observations: ordinaryObservations,
          comparison: {
            status: "unavailable",
            baselineAt: null,
            discoveryIds: [],
            observations: ordinaryObservations,
            reason: "initial-save-failed",
          },
        };
      }
      return {
        observations: comparison.observations,
        comparison: { ...comparison, snapshot, snapshotCommit: "save-failed" },
      };
    }
  }

  async function run(intent) {
    activeRequest?.controller?.abort();
    const requestGeneration = ++generation;
    const requestId = intent.requestId ?? createRequestId(++sequence);
    const days = normalizeDays(intent.days);
    const source = intent.source ?? "explicit";
    const normalizedIntent = { ...intent, source, days };
    const request = {
      requestId,
      source,
      ...(intent.species ? { species: intent.species } : {}),
      ...(intent.query ? { query: intent.query } : {}),
      days,
    };
    const requestState = {
      ...request,
      controller: typeof AbortController === "undefined" ? undefined : new AbortController(),
      commitToken: { sessionId: commitSessionId, generation: requestGeneration },
    };
    activeRequest = requestState;

    publish({ type: "busy", busy: true, ...request });

    let phase = "species-resolution";
    try {
      let snapshotsUnavailable = false;
      if (snapshots?.advance) {
        try {
          const advanced = await snapshots.advance({
            isCurrent: () => isCurrent(requestGeneration),
            signal: requestState.controller?.signal,
            commitToken: requestState.commitToken,
          });
          if (!isCurrent(requestGeneration) || advanced === false) {
            publishStale(requestId, source);
            return { status: "stale", requestId, source };
          }
        } catch {
          if (!isCurrent(requestGeneration)) {
            publishStale(requestId, source);
            return { status: "stale", requestId, source };
          }
          snapshotsUnavailable = true;
        }
      }
      const species = await runtime.resolveSpecies(normalizedIntent, { isCurrent: () => isCurrent(requestGeneration) });
      if (!isCurrent(requestGeneration)) {
        publishStale(requestId, source);
        return { status: "stale", requestId, source };
      }

      phase = "observations";
      const payload = await runtime.fetchObservations({
        requestId,
        source,
        species,
        days,
      });
      if (!isCurrent(requestGeneration)) {
        publishStale(requestId, source);
        return { status: "stale", requestId, source };
      }

      const compared = await compareEligibleSearch({
        requestGeneration,
        source,
        species,
        days,
        payload,
        request: requestState,
        snapshotsUnavailable,
      });
      if (!compared || !isCurrent(requestGeneration)) {
        publishStale(requestId, source);
        return { status: "stale", requestId, source };
      }
      const result = { requestId, source, species, days, payload, ...compared };
      publish({ type: "completed", result });
      publish({ type: "busy", busy: false, ...request, species });
      if (activeRequest?.requestId === requestId) activeRequest = undefined;
      return { status: "completed", result };
    } catch (error) {
      if (!isCurrent(requestGeneration)) {
        publishStale(requestId, source);
        return { status: "stale", requestId, source };
      }

      const failure = {
        requestId,
        source,
        phase,
        message: errorMessage(error),
      };
      publish({ type: "failed", error: failure });
      publish({ type: "busy", busy: false, ...request });
      if (activeRequest?.requestId === requestId) activeRequest = undefined;
      return { status: "failed", error: failure };
    }
  }

  return { run, invalidate };
}

export { normalizeDays };
