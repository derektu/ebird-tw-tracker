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
  createRequestId = (sequence) => `search-${sequence}`,
}) {
  let sequence = 0;
  let generation = 0;
  let activeRequest;
  const cancelledRequestIds = new Set();

  function isCurrent(requestGeneration) {
    return requestGeneration === generation;
  }

  function invalidate() {
    const cancelled = activeRequest;
    generation += 1;
    activeRequest = undefined;
    if (cancelled) {
      cancelledRequestIds.add(cancelled.requestId);
      onStale?.({ requestId: cancelled.requestId, source: cancelled.source });
      onCancelled?.({ requestId: cancelled.requestId, source: cancelled.source });
      publish({ type: "busy", busy: false, ...cancelled });
    }
  }

  function publishStale(requestId, source) {
    if (cancelledRequestIds.delete(requestId)) return;
    onStale?.({ requestId, source });
  }

  async function run(intent) {
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
    activeRequest = request;

    publish({ type: "busy", busy: true, ...request });

    try {
      const species = await runtime.resolveSpecies(normalizedIntent, { isCurrent: () => isCurrent(requestGeneration) });
      if (!isCurrent(requestGeneration)) {
        publishStale(requestId, source);
        return { status: "stale", requestId, source };
      }

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

      const result = { requestId, source, species, days, payload };
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
