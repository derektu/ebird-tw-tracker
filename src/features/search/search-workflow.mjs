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
  createRequestId = (sequence) => `search-${sequence}`,
}) {
  let sequence = 0;
  let generation = 0;

  function isCurrent(requestGeneration) {
    return requestGeneration === generation;
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

    publish({ type: "busy", busy: true, ...request });

    try {
      const species = await runtime.resolveSpecies(normalizedIntent);
      if (!isCurrent(requestGeneration)) {
        return { status: "stale", requestId, source };
      }

      const payload = await runtime.fetchObservations({
        requestId,
        source,
        species,
        days,
      });
      if (!isCurrent(requestGeneration)) {
        return { status: "stale", requestId, source };
      }

      const result = { requestId, source, species, days, payload };
      publish({ type: "completed", result });
      publish({ type: "busy", busy: false, ...request, species });
      return { status: "completed", result };
    } catch (error) {
      if (!isCurrent(requestGeneration)) {
        return { status: "stale", requestId, source };
      }

      const failure = {
        requestId,
        source,
        message: errorMessage(error),
      };
      publish({ type: "failed", error: failure });
      publish({ type: "busy", busy: false, ...request });
      return { status: "failed", error: failure };
    }
  }

  return { run };
}

export { normalizeDays };
