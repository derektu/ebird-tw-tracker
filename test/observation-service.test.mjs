import assert from "node:assert/strict";
import test from "node:test";
import { createObservationService } from "../server/services/observation-service.mjs";

test("checklist returns the observer display name and caches it by submission ID", async () => {
  const requests = [];
  const service = createObservationService({
    ebird: {
      async request(pathname) {
        requests.push(pathname);
        return { userDisplayName: "  Example Birder  " };
      },
    },
  });

  assert.deepEqual(await service.checklist("S379420319"), {
    subId: "S379420319",
    userDisplayName: "Example Birder",
  });
  assert.deepEqual(await service.checklist("S379420319"), {
    subId: "S379420319",
    userDisplayName: "Example Birder",
  });
  assert.deepEqual(requests, ["/product/checklist/view/S379420319"]);
});

test("checklist rejects malformed submission IDs without calling eBird", async () => {
  let called = false;
  const service = createObservationService({
    ebird: {
      async request() {
        called = true;
      },
    },
  });

  await assert.rejects(() => service.checklist("not-a-checklist"), { message: "Invalid checklist ID" });
  assert.equal(called, false);
});
