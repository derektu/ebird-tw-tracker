import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTrackingService } from "../server/services/tracking-service.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const firstObservation = {
  speciesCode: "grpsni1",
  comName: "彩鷸",
  sciName: "Rostratula benghalensis",
  obsDt: "2026-08-02 08:00",
  locName: "測試地點 A",
  howMany: 1,
  subId: "S1",
  lat: 23.5,
  lng: 120.5,
  locationPrivate: false,
  obsValid: true,
  obsReviewed: false,
};

test("new tracker seeds existing observations and only later additions create events", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-tracking-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  let current = [firstObservation];
  let clock = new Date("2026-08-02T01:00:00.000Z");
  let stateChangeCount = 0;
  const service = createTrackingService({
    trackersPath: path.join(directory, "trackers.json"),
    seenPath: path.join(directory, "seen.json"),
    eventsPath: path.join(directory, "events.json"),
    observations: { recent: async () => current },
    now: () => clock,
    minTimerMs: 60_000,
    logger: { error() {} },
    onStateChange: async () => { stateChangeCount += 1; },
  });
  context.after(() => service.stop());

  const created = await service.upsert({ species, days: 3, intervalMinutes: 30, enabled: true });
  assert.equal(created.trackers.length, 1);
  assert.equal((await service.getEvents()).events.length, 0);
  assert.ok(stateChangeCount > 0);

  clock = new Date("2026-08-02T01:31:00.000Z");
  current = [{ ...firstObservation, obsDt: "2026-08-02 08:30", subId: "S2" }, firstObservation];
  const checked = await service.check({ speciesCode: "grpsni1" });
  assert.equal(checked.results[0].newObservations.length, 1);
  const events = await service.getEvents();
  assert.equal(events.unreadCount, 1);
  assert.equal(events.events[0].observation.subId, "S2");

  const beforeRead = stateChangeCount;
  await service.markEventRead(events.events[0].id);
  assert.equal((await service.getEvents()).unreadCount, 0);
  assert.ok(stateChangeCount > beforeRead);
});
