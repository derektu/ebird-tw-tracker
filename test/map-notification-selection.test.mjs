import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationCanApplyToSearchResult,
  prioritizeNotificationObservation,
  selectCurrentNotification,
} from "../src/features/map/notification-observations.mjs";
import { createSearchWorkflow } from "../src/features/search/search-workflow.mjs";

const oldReport = {
  speciesCode: "grpsni1",
  comName: "彩鷸",
  sciName: "Rostratula benghalensis",
  obsDt: "2026-08-02 09:06",
  locName: "台北--北投忠義小徑",
  howMany: 2,
  subId: "S378963308",
  lat: 25.131,
  lng: 121.467,
  locationPrivate: false,
  obsValid: true,
  obsReviewed: false,
};

const newReport = {
  ...oldReport,
  obsDt: "2026-08-03 07:42",
  howMany: 1,
  subId: "S379395954",
};

const otherLocation = {
  ...oldReport,
  obsDt: "2026-08-03 10:22",
  locName: "台南--歸仁武東農田",
  subId: "S379420319",
  lat: 22.95,
  lng: 120.3,
};

test("notification replaces an older report at the same coordinates", () => {
  const result = prioritizeNotificationObservation([oldReport, otherLocation], newReport);

  assert.deepEqual(
    result.map((observation) => observation.subId),
    ["S379395954", "S379420319"],
  );
});

test("notification moves an existing report to the front without duplicating it", () => {
  const result = prioritizeNotificationObservation([otherLocation, newReport], newReport);

  assert.deepEqual(
    result.map((observation) => observation.subId),
    ["S379395954", "S379420319"],
  );
});

test("only the matching notification-focus search can apply a pending notification", () => {
  const pending = { species: { speciesCode: "grpsni1" } };

  assert.equal(notificationCanApplyToSearchResult(pending, "map-1", {
    requestId: "map-1",
    source: "notification-focus",
    species: { speciesCode: "grpsni1" },
  }), true);
  assert.equal(notificationCanApplyToSearchResult(pending, "map-1", {
    requestId: "search-2",
    source: "explicit",
    species: { speciesCode: "grpsni1" },
  }), false);
});

test("selecting the current notification observation cancels an older cross-species search", async () => {
  let releaseSearch;
  const events = [];
  const cancellations = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      fetchObservations() {
        return new Promise((resolve) => {
          releaseSearch = resolve;
        });
      },
    },
    publish(event) {
      events.push(event);
    },
    onCancelled(request) {
      cancellations.push(request);
    },
  });
  const bSpecies = { ...oldReport, speciesCode: "yebgre1", comName: "小白鷺" };
  const bSearch = workflow.run({ source: "notification-focus", species: bSpecies, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));

  const aObservations = selectCurrentNotification(
    [oldReport, otherLocation],
    newReport,
    () => workflow.invalidate(),
  );
  releaseSearch({ observations: [bSpecies] });

  assert.deepEqual(aObservations.map((observation) => observation.subId), ["S379395954", "S379420319"]);
  assert.deepEqual(await bSearch, { status: "stale", requestId: "search-1", source: "notification-focus" });
  assert.deepEqual(
    events.filter((event) => event.type === "completed" || event.type === "failed"),
    [],
  );
  assert.equal(events.at(-1).busy, false);
  assert.deepEqual(cancellations, [{ requestId: "search-1", source: "notification-focus" }]);
});
