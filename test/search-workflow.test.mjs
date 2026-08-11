import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopSearchRuntime } from "../src/features/search/desktop-search-runtime.mjs";
import { createSearchScope, createSearchSnapshot } from "../src/domain/search-discovery.mjs";
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
        observations: payload.observations,
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
  let visibleSavedSpecies = [];
  let savedSpeciesReads = 0;
  const explicitSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: createDesktopSearchRuntime({
      fetchSavedSpecies() {
        savedSpeciesReads += 1;
        return savedSpeciesReads === 1 ? startupSavedSpecies.promise : Promise.resolve([explicitSpecies]);
      },
      publishSavedSpecies(species) {
        visibleSavedSpecies = species;
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
  assert.deepEqual(visibleSavedSpecies, [explicitSpecies]);
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
  let visibleSavedSpecies = [];
  const resolvedSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: createDesktopSearchRuntime({
      async fetchSavedSpecies() {
        savedSpecies.push("refreshed");
        return [resolvedSpecies];
      },
      publishSavedSpecies(species) {
        visibleSavedSpecies = species;
      },
      async resolveSpecies() {
        return resolvedSpecies;
      },
      async fetchObservations(request) {
        assert.deepEqual(savedSpecies, ["refreshed"]);
        assert.deepEqual(visibleSavedSpecies, [resolvedSpecies]);
        return { ...payload, speciesCode: request.species.speciesCode };
      },
    }),
    publish() {},
  });

  const outcome = await workflow.run({ source: "explicit", query: "小白鷺", days: 3 });

  assert.equal(outcome.status, "completed");
  assert.deepEqual(savedSpecies, ["refreshed"]);
  assert.deepEqual(visibleSavedSpecies, [resolvedSpecies]);
});

test("a stale startup fallback cannot remember its default species", async () => {
  const startupFallback = deferred();
  const events = [];
  const rememberedStartupSpecies = [];
  let visibleSavedSpecies = [];
  const explicitSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  let savedSpeciesReads = 0;
  const workflow = createSearchWorkflow({
    runtime: createDesktopSearchRuntime({
      fetchSavedSpecies() {
        savedSpeciesReads += 1;
        return Promise.resolve(savedSpeciesReads === 1 ? [] : [explicitSpecies]);
      },
      publishSavedSpecies(species) {
        visibleSavedSpecies = species;
      },
      resolveSpecies(query) {
        if (query === "彩鷸") return startupFallback.promise;
        return Promise.resolve(explicitSpecies);
      },
      async fetchObservations(request) {
        return { ...payload, speciesCode: request.species.speciesCode };
      },
      rememberStartupSpecies(species) {
        rememberedStartupSpecies.push(species);
      },
    }),
    publish(event) {
      events.push(event);
    },
  });

  const startup = workflow.run({ source: "startup", days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const explicit = await workflow.run({ source: "explicit", query: "小白鷺", days: 3 });
  startupFallback.resolve(species);

  assert.equal(explicit.status, "completed");
  assert.deepEqual(await startup, { status: "stale", requestId: "search-1", source: "startup" });
  assert.deepEqual(rememberedStartupSpecies, []);
  assert.deepEqual(visibleSavedSpecies, [explicitSpecies]);
  assert.equal(events.filter((event) => event.type === "completed").length, 1);
});

test("an explicit invalidation prevents an in-flight notification search from publishing", async () => {
  const request = deferred();
  const events = [];
  const cancellations = [];
  const staleRequests = [];
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
    onCancelled(request) {
      cancellations.push(request);
    },
    onStale(request) {
      staleRequests.push(request);
    },
  });

  const notification = workflow.run({ source: "notification-focus", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  workflow.invalidate();
  request.resolve(payload);

  assert.deepEqual(await notification, { status: "stale", requestId: "search-1", source: "notification-focus" });
  assert.deepEqual(events.map((event) => event.type), ["busy", "busy"]);
  assert.equal(events[1].busy, false);
  assert.deepEqual(cancellations, [{ requestId: "search-1", source: "notification-focus" }]);
  assert.deepEqual(staleRequests, [{ requestId: "search-1", source: "notification-focus" }]);
});

test("baseline-eligible searches compare and replace Search Snapshots while notification focus bypasses them", async () => {
  const scope = createSearchScope(species.speciesCode, 3);
  const reads = [];
  const commits = [];
  let baseline = null;
  const observations = [
    { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S1" }] },
    { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S2" }, { speciesCode: species.speciesCode, subId: "S1" }] },
    { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S2" }] },
  ];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations() {
        return observations.shift();
      },
    },
    snapshots: {
      async read(requestedScope) {
        reads.push(requestedScope.key);
        return baseline;
      },
      async commit(requestedScope, snapshot) {
        commits.push(requestedScope.key);
        baseline = snapshot;
      },
    },
    publish() {},
  });

  const first = await workflow.run({ source: "startup", species, days: 3 });
  const second = await workflow.run({ source: "explicit", species, days: 3 });
  const notification = await workflow.run({ source: "notification-focus", species, days: 3 });

  assert.equal(first.result.comparison.status, "baseline-created");
  assert.equal(second.result.comparison.status, "compared");
  assert.deepEqual(second.result.comparison.discoveryIds, ["grpsni1:S2"]);
  assert.deepEqual(second.result.observations.map((item) => item.subId), ["S2", "S1"]);
  assert.equal(notification.result.comparison, undefined);
  assert.deepEqual(reads, [scope.key, scope.key]);
  assert.deepEqual(commits, [scope.key, scope.key]);
});

test("Search Snapshot failures leave ordinary results visible with the specified comparison status", async () => {
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations() {
        return { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S1" }] };
      },
    },
    snapshots: {
      async read() {
        throw new Error("disk unavailable");
      },
      async commit() {
        throw new Error("should not write");
      },
    },
    publish() {},
  });

  const outcome = await workflow.run({ source: "explicit", species, days: 3 });

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.result.comparison.status, "unavailable");
  assert.equal(outcome.result.comparison.reason, "baseline-read-failed");
  assert.deepEqual(outcome.result.observations.map((item) => item.subId), ["S1"]);
});

test("a failed replacement retains discoveries while an initial save failure reports unavailable", async () => {
  const scope = createSearchScope(species.speciesCode, 3);
  const baseline = createSearchSnapshot(scope, [{ speciesCode: species.speciesCode, subId: "S1" }], "2026-08-10T00:00:00.000Z");
  const createWorkflow = (savedBaseline) => createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations() {
        return { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S2" }, { speciesCode: species.speciesCode, subId: "S1" }] };
      },
    },
    snapshots: {
      async read() {
        return savedBaseline;
      },
      async commit() {
        throw new Error("disk unavailable");
      },
    },
    publish() {},
  });

  const replacement = await createWorkflow(baseline).run({ source: "explicit", species, days: 3 });
  const initial = await createWorkflow(null).run({ source: "startup", species, days: 3 });

  assert.equal(replacement.result.comparison.status, "compared");
  assert.equal(replacement.result.comparison.snapshotCommit, "save-failed");
  assert.deepEqual(replacement.result.comparison.discoveryIds, ["grpsni1:S2"]);
  assert.deepEqual(replacement.result.observations.map((item) => item.subId), ["S2", "S1"]);
  assert.equal(initial.result.comparison.status, "unavailable");
  assert.equal(initial.result.comparison.reason, "initial-save-failed");
  assert.deepEqual(initial.result.observations.map((item) => item.subId), ["S2", "S1"]);
});

test("a stale baseline read cannot commit or publish a Search Snapshot", async () => {
  const read = deferred();
  const events = [];
  const commits = [];
  const latestSpecies = { ...species, speciesCode: "yebgre1", comName: "小白鷺" };
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations(request) {
        return { ...payload, speciesCode: request.species.speciesCode, observations: [] };
      },
    },
    snapshots: {
      read(scope) {
        return scope.speciesCode === species.speciesCode ? read.promise : Promise.resolve(null);
      },
      async commit(scope) {
        commits.push(scope.key);
      },
    },
    publish(event) {
      events.push(event);
    },
  });

  const older = workflow.run({ source: "startup", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const latest = await workflow.run({ source: "explicit", species: latestSpecies, days: 3 });
  read.resolve(null);

  assert.equal(latest.status, "completed");
  assert.deepEqual(await older, { status: "stale", requestId: "search-1", source: "startup" });
  assert.deepEqual(commits, ["yebgre1:3"]);
  assert.deepEqual(events.filter((event) => event.type === "completed").map((event) => event.result.species.speciesCode), ["yebgre1"]);
});

test("a stale snapshot commit is cancelled before it can replace the baseline", async () => {
  const commit = deferred();
  const writes = [];
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations(request) {
        return { ...payload, speciesCode: request.species.speciesCode, observations: [] };
      },
    },
    snapshots: {
      async read() {
        return null;
      },
      async commit(scope, snapshot, token) {
        await commit.promise;
        if (!token.isCurrent()) return false;
        writes.push({ scope, snapshot });
      },
    },
    publish() {},
  });

  const older = workflow.run({ source: "startup", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  const latest = workflow.run({ source: "notification-focus", species, days: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  commit.resolve();

  assert.deepEqual(await older, { status: "stale", requestId: "search-1", source: "startup" });
  assert.equal((await latest).status, "completed");
  assert.deepEqual(writes, []);
});

test("an unavailable snapshot session still publishes ordinary search results", async () => {
  const workflow = createSearchWorkflow({
    runtime: {
      async resolveSpecies(intent) {
        return intent.species;
      },
      async fetchObservations() {
        return { ...payload, observations: [{ speciesCode: species.speciesCode, subId: "S1" }] };
      },
    },
    snapshots: {
      async advance() {
        throw new Error("snapshot session unavailable");
      },
      async read() {
        throw new Error("must not read");
      },
      async commit() {
        throw new Error("must not write");
      },
    },
    publish() {},
  });

  const outcome = await workflow.run({ source: "explicit", species, days: 3 });

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.result.comparison.status, "unavailable");
  assert.equal(outcome.result.comparison.reason, "baseline-read-failed");
  assert.deepEqual(outcome.result.observations.map((item) => item.subId), ["S1"]);
});
