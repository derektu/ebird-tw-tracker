import { normalizeTracker, observationKey, trackerIsDue } from "../domain/tracking.mjs";
import { readJson, writeJson } from "../storage/json-store.mjs";

export function createTrackingService({
  trackersPath,
  seenPath,
  eventsPath,
  observations,
  now = () => new Date(),
  minTimerMs = 60_000,
  logger = console,
  onEvents = async () => {},
  onStateChange = async () => {},
}) {
  let timer = null;
  let runningCheck = null;
  let stopping = false;

  async function notifyStateChange() {
    try {
      await onStateChange();
    } catch (error) {
      logger.error("Tracking state notification failed:", error);
    }
  }

  async function list() {
    return (await readJson(trackersPath, [])).map((tracker) => normalizeTracker(tracker, now()));
  }

  async function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopping) return;
    const enabled = (await list()).filter((tracker) => tracker.enabled);
    if (!enabled.length) return;
    const currentTime = now().getTime();
    const nextDueIn = Math.min(...enabled.map((tracker) => {
      if (!tracker.lastCheckedAt) return 1000;
      const dueAt = Date.parse(tracker.lastCheckedAt) + tracker.intervalMinutes * 60_000;
      return Math.max(1000, dueAt - currentTime);
    }));
    timer = setTimeout(() => {
      void runDueChecks().catch((error) => logger.error("Scheduled tracker check failed:", error));
    }, Math.max(minTimerMs, nextDueIn));
  }

  async function persist(trackers, reschedule = true) {
    const normalized = trackers.map((tracker) => normalizeTracker(tracker, now()));
    await writeJson(trackersPath, normalized);
    if (reschedule) await schedule();
    await notifyStateChange();
    return normalized;
  }

  async function appendEvents(newEvents) {
    if (!newEvents.length) return [];
    const existing = await readJson(eventsPath, []);
    const nextId = existing.reduce((maximum, event) => Math.max(maximum, event.id ?? 0), 0) + 1;
    const stamped = newEvents.map((event, index) => ({
      id: nextId + index,
      createdAt: now().toISOString(),
      read: false,
      ...event,
    }));
    await writeJson(eventsPath, [...stamped, ...existing].slice(0, 500));
    await onEvents(stamped);
    await notifyStateChange();
    return stamped;
  }

  async function checkTracker(tracker, markExisting = false) {
    const recent = await observations.recent(tracker.species.speciesCode, tracker.days);
    const seen = await readJson(seenPath, {});
    const speciesSeen = new Set(seen[tracker.species.speciesCode] ?? []);
    const newObservations = [];
    for (const observation of recent) {
      const key = observationKey(observation);
      if (speciesSeen.has(key)) continue;
      speciesSeen.add(key);
      if (!markExisting) newObservations.push(observation);
    }
    seen[tracker.species.speciesCode] = [...speciesSeen].slice(-5000);
    await writeJson(seenPath, seen);

    const checkedAt = now().toISOString();
    const nextTracker = normalizeTracker({
      ...tracker,
      lastCheckedAt: checkedAt,
      lastFoundAt: newObservations.length ? checkedAt : tracker.lastFoundAt,
      lastError: undefined,
    }, now());
    const events = await appendEvents(newObservations.map((observation) => ({
      type: "new-observation",
      species: tracker.species,
      observation,
    })));
    return { tracker: nextTracker, checkedAt, total: recent.length, newObservations, events };
  }

  async function upsert(input) {
    const tracker = normalizeTracker(input, now());
    if (!tracker.species.speciesCode || !tracker.species.comName) {
      throw Object.assign(new Error("species is required"), { statusCode: 400 });
    }
    const trackers = await list();
    const next = [tracker, ...trackers.filter((item) => item.id !== tracker.id)];
    await persist(next);
    const seeded = await checkTracker(tracker, true);
    const saved = await persist(next.map((item) => item.id === tracker.id ? seeded.tracker : item));
    return { tracker: seeded.tracker, trackers: saved };
  }

  async function remove(speciesCode) {
    return persist((await list()).filter((tracker) => tracker.id !== speciesCode));
  }

  async function update(speciesCode, changes) {
    const trackers = await list();
    const tracker = trackers.find((item) => item.id === speciesCode);
    if (!tracker) throw Object.assign(new Error("Tracker not found"), { statusCode: 404 });
    const nextTracker = normalizeTracker({ ...tracker, ...changes, species: tracker.species }, now());
    const next = await persist(trackers.map((item) => item.id === speciesCode ? nextTracker : item));
    return { tracker: nextTracker, trackers: next };
  }

  async function check({ speciesCode, markExisting = false } = {}) {
    const trackers = await list();
    const selected = speciesCode
      ? trackers.filter((tracker) => tracker.id === speciesCode)
      : trackers.filter((tracker) => tracker.enabled);
    const results = [];
    const next = [...trackers];
    for (const tracker of selected) {
      const result = await checkTracker(tracker, markExisting);
      results.push(result);
      const index = next.findIndex((item) => item.id === tracker.id);
      if (index >= 0) next[index] = result.tracker;
    }
    const saved = await persist(next);
    return { checkedAt: now().toISOString(), results, trackers: saved };
  }

  async function runDueChecks() {
    if (runningCheck) return runningCheck;
    runningCheck = (async () => {
      const trackers = await list();
      const next = [];
      let changed = false;
      const current = now();
      for (const tracker of trackers) {
        if (!trackerIsDue(tracker, current)) {
          next.push(tracker);
          continue;
        }
        try {
          const result = await checkTracker(tracker);
          next.push(result.tracker);
        } catch (error) {
          logger.error(`Tracker check failed for ${tracker.species.speciesCode}:`, error);
          next.push(normalizeTracker({
            ...tracker,
            lastCheckedAt: now().toISOString(),
            lastError: error.message,
          }, now()));
        }
        changed = true;
      }
      if (changed) await persist(next, false);
      return next;
    })();
    try {
      return await runningCheck;
    } finally {
      runningCheck = null;
      await schedule();
    }
  }

  async function getEvents(since = 0) {
    const events = await readJson(eventsPath, []);
    return {
      events: events.filter((event) => (event.id ?? 0) > since).sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
      unreadCount: events.filter((event) => !event.read).length,
    };
  }

  async function markAllEventsRead() {
    const events = (await readJson(eventsPath, [])).map((event) => ({ ...event, read: true }));
    await writeJson(eventsPath, events);
    await notifyStateChange();
    return { events, unreadCount: 0 };
  }

  async function markEventRead(id) {
    const events = (await readJson(eventsPath, [])).map((event) => event.id === id ? { ...event, read: true } : event);
    await writeJson(eventsPath, events);
    await notifyStateChange();
    return { events, unreadCount: events.filter((event) => !event.read).length };
  }

  async function pauseAll() {
    return persist((await list()).map((tracker) => ({ ...tracker, enabled: false })));
  }

  async function start() {
    stopping = false;
    await schedule();
  }

  async function stop() {
    stopping = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (runningCheck) await runningCheck;
  }

  return {
    list,
    upsert,
    remove,
    update,
    check,
    runDueChecks,
    getEvents,
    markAllEventsRead,
    markEventRead,
    pauseAll,
    start,
    stop,
  };
}
