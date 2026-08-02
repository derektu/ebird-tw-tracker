import assert from "node:assert/strict";
import test from "node:test";
import { isInQuietHours, normalizeTracker, trackerIsDue } from "../server/domain/tracking.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };

test("normalizeTracker clamps numeric settings and uses the species code as id", () => {
  const tracker = normalizeTracker({ species, days: 99, intervalMinutes: 0 }, new Date("2026-08-02T00:00:00Z"));
  assert.equal(tracker.id, "grpsni1");
  assert.equal(tracker.days, 30);
  assert.equal(tracker.intervalMinutes, 1);
  assert.equal(tracker.createdAt, "2026-08-02T00:00:00.000Z");
});

test("quiet hours spanning midnight exclude both late night and early morning", () => {
  const quietHours = { enabled: true, start: "22:00", end: "06:00" };
  assert.equal(isInQuietHours(quietHours, new Date(2026, 7, 2, 23, 30)), true);
  assert.equal(isInQuietHours(quietHours, new Date(2026, 7, 2, 5, 59)), true);
  assert.equal(isInQuietHours(quietHours, new Date(2026, 7, 2, 6, 0)), false);
  assert.equal(isInQuietHours(quietHours, new Date(2026, 7, 2, 14, 0)), false);
});

test("trackerIsDue respects enabled state, quiet hours, and interval", () => {
  const now = new Date(2026, 7, 2, 12, 0);
  const base = normalizeTracker({
    species,
    intervalMinutes: 30,
    quietHours: { enabled: false },
    lastCheckedAt: new Date(2026, 7, 2, 11, 29).toISOString(),
  });
  assert.equal(trackerIsDue(base, now), true);
  assert.equal(trackerIsDue({ ...base, lastCheckedAt: new Date(2026, 7, 2, 11, 31).toISOString() }, now), false);
  assert.equal(trackerIsDue({ ...base, enabled: false }, now), false);
  assert.equal(trackerIsDue({
    ...base,
    quietHours: { enabled: true, start: "10:00", end: "13:00" },
  }, now), false);
});
