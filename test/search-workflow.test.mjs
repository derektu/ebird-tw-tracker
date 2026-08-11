import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopSearchRuntime } from "../src/features/search/desktop-search-runtime.mjs";
import { createSearchWorkflow } from "../src/features/search/search-workflow.mjs";

const species = {
  speciesCode: "grpsni1",
  comName: "彩鷸",
  sciName: "Rostratula benghalensis",
};

const payload = {
  speciesCode: species.speciesCode,
  days: 30,
  generatedAt: "2026-08-11T00:00:00.000Z",
  observations: [],
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("search workflow normalizes the intent and publishes a complete lifecycle", async () => {
  const calls = [];
  const events = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        calls.push(["resolve", intent]);
        return intent.species;
      },
      async fetchObservations(input) {
        calls.push(["observations", input]);
        return payload;
      },
    },
    publish(event) {
      events.push(event);
    },
  });

  const outcome = await workflow.run({ source: "startup", species, days: 45 });

  assert.equal(outcome.status, "completed");
  assert.deepEqual(calls, [
    ["resolve", { source: "startup", species, days: 30 }],
    ["observations", { requestId: "search-1", source: "startup", species, days: 30 }],
  ]);
  assert.deepEqual(events.map((event) => event.type), ["busy", "completed", "busy"]);
  assert.equal(events[0].busy, true);
  assert.equal(events[0].days, 30);
  assert.equal(events[1].result.source, "startup");
  assert.equal(events[1].result.days, 30);
  assert.equal(events[2].busy, false);
});

test("search workflow resolves a query through the runtime and preserves a supplied request id", async () => {
  const calls = [];
  const events = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        calls.push(["resolve", intent]);
        return { ...species, comName: intent.query };
      },
      async fetchObservations(input) {
        calls.push(["observations", input]);
        return payload;
      },
    },
    publish(event) {
      events.push(event);
    },
  });

  const outcome = await workflow.run({
    source: "explicit",
    requestId: "desktop-explicit-7",
    query: "小白鷺",
    days: 0,
  });

  assert.equal(outcome.status, "completed");
  assert.deepEqual(calls, [
    ["resolve", { source: "explicit", requestId: "desktop-explicit-7", query: "小白鷺", days: 1 }],
    ["observations", {
      requestId: "desktop-explicit-7",
      source: "explicit",
      species: { ...species, comName: "小白鷺" },
      days: 1,
    }],
  ]);
  assert.equal(events[0].requestId, "desktop-explicit-7");
  assert.equal(events[0].query, "小白鷺");
  assert.equal(events[1].result.requestId, "desktop-explicit-7");
  assert.equal(events[1].result.source, "explicit");
  assert.equal(events[1].result.days, 1);
  assert.equal(events[2].requestId, "desktop-explicit-7");
});

test("only the latest request can publish a result, failure, or busy clear", async () => {
  const requests = new Map();
  const events = [];
  const staleRequests = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      fetchObservations(input) {
        return new Promise((resolve, reject) => {
          requests.set(input.requestId, { resolve, reject });
        });
      },
    },
    publish(event) {
      events.push(event);
    },
    onStale(request) {
      staleRequests.push(request);
    },
  });

  const first = workflow.run({ source: "explicit", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const second = workflow.run({
    source: "notification-focus",
    species: { ...species, speciesCode: "yebgre1", comName: "小白鷺" },
    days: 2,
  });

  await new Promise((resolve) => setImmediate(resolve));
  requests.get("search-1").resolve({ ...payload, speciesCode: species.speciesCode });
  requests.get("search-2").reject(new Error("最新搜尋失敗"));

  assert.deepEqual(await first, { status: "stale", requestId: "search-1", source: "explicit" });
  assert.deepEqual(staleRequests, [{ requestId: "search-1", source: "explicit" }]);
  assert.deepEqual(await second, {
    status: "failed",
    error: { requestId: "search-2", source: "notification-focus", message: "最新搜尋失敗" },
  });
  assert.deepEqual(
    events.filter((event) => event.type === "completed" || event.type === "failed"),
    [{
      type: "failed",
      error: { requestId: "search-2", source: "notification-focus", message: "最新搜尋失敗" },
    }],
  );
  assert.deepEqual(
    events.filter((event) => event.type === "busy" && !event.busy),
    [{
      type: "busy",
      busy: false,
      requestId: "search-2",
      source: "notification-focus",
      species: { speciesCode: "yebgre1", comName: "小白鷺", sciName: "Rostratula benghalensis" },
      days: 2,
    }],
  );
});

test("a stale failure cannot publish while the newest request publishes its result and clears busy", async () => {
  const requests = new Map();
  const events = [];
  const latestSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      fetchObservations(input) {
        return new Promise((resolve, reject) => {
          requests.set(input.requestId, { resolve, reject });
        });
      },
    },
    publish(event) {
      events.push(event);
    },
  });

  const first = workflow.run({ source: "explicit", species, requestId: "older", days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const latest = workflow.run({
    source: "notification-focus",
    species: latestSpecies,
    requestId: "latest",
    days: 31,
  });

  await new Promise((resolve) => setImmediate(resolve));
  requests.get("older").reject(new Error("舊搜尋失敗"));
  requests.get("latest").resolve({ ...payload, speciesCode: latestSpecies.speciesCode });

  assert.deepEqual(await first, { status: "stale", requestId: "older", source: "explicit" });
  const latestOutcome = await latest;
  assert.equal(latestOutcome.status, "completed");
  assert.equal(latestOutcome.result.requestId, "latest");
  assert.equal(latestOutcome.result.source, "notification-focus");
  assert.equal(latestOutcome.result.days, 30);
  assert.deepEqual(
    events.filter((event) => event.type === "completed" || event.type === "failed"),
    [{
      type: "completed",
      result: {
        requestId: "latest",
        source: "notification-focus",
        species: latestSpecies,
        days: 30,
        payload: { ...payload, speciesCode: latestSpecies.speciesCode },
      },
    }],
  );
  assert.deepEqual(
    events.filter((event) => event.type === "busy" && !event.busy),
    [{
      type: "busy",
      busy: false,
      requestId: "latest",
      source: "notification-focus",
      species: latestSpecies,
      days: 30,
    }],
  );
});

test("startup resolution is stale when a newer explicit search completes first", async () => {
  const startupSavedSpecies = deferred();
  const events = [];
  let savedSpeciesReads = 0;
  const explicitSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: createDesktopSearchRuntime({
      loadSavedSpecies() {
        savedSpeciesReads += 1;
        return savedSpeciesReads === 1 ? startupSavedSpecies.promise : Promise.resolve([explicitSpecies]);
      },
      async resolveSpecies(query) {
        assert.equal(query, "小白鷺");
        return explicitSpecies;
      },
      async fetchObservations(request) {
        return { ...payload, speciesCode: request.species.speciesCode };
      },
    }),
    publish(event) {
      events.push(event);
    },
  });

  const startup = workflow.run({ source: "startup", days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const explicit = await workflow.run({ source: "explicit", query: "小白鷺", days: 3 });
  startupSavedSpecies.resolve([species]);

  assert.equal(explicit.status, "completed");
  assert.deepEqual(await startup, { status: "stale", requestId: "search-1", source: "startup" });
  assert.deepEqual(
    events.filter((event) => event.type === "completed" || event.type === "failed"),
    [{ type: "completed", result: explicit.result }],
  );
  assert.deepEqual(
    events.filter((event) => event.type === "busy" && !event.busy),
    [{
      type: "busy",
      busy: false,
      requestId: "search-2",
      source: "explicit",
      query: "小白鷺",
      species: explicitSpecies,
      days: 3,
    }],
  );
});

test("a typed explicit search refreshes saved species before publishing its result", async () => {
  const savedSpecies = [];
  const resolvedSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: createDesktopSearchRuntime({
      async loadSavedSpecies() {
        savedSpecies.push("refreshed");
        return [resolvedSpecies];
      },
      async resolveSpecies() {
        return resolvedSpecies;
      },
      async fetchObservations(request) {
        assert.deepEqual(savedSpecies, ["refreshed"]);
        return { ...payload, speciesCode: request.species.speciesCode };
      },
    }),
    publish() {},
  });

  const outcome = await workflow.run({ source: "explicit", query: "小白鷺", days: 3 });

  assert.equal(outcome.status, "completed");
  assert.deepEqual(savedSpecies, ["refreshed"]);
});

test("an explicit invalidation prevents an in-flight notification search from publishing", async () => {
  const request = deferred();
  const events = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      fetchObservations() {
        return request.promise;
      },
    },
    publish(event) {
      events.push(event);
    },
  });

  const notification = workflow.run({ source: "notification-focus", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  workflow.invalidate();
  request.resolve(payload);

  assert.deepEqual(await notification, { status: "stale", requestId: "search-1", source: "notification-focus" });
  assert.deepEqual(events.map((event) => event.type), ["busy"]);
});
