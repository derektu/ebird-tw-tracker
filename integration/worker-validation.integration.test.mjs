import assert from "node:assert/strict";
import test from "node:test";
import { createSearchWorker } from "../worker/index.mjs";

const fakeApiKey = "clearly-not-a-real-ebird-api-key";

function validationRequest(apiKey) {
  return new Request("https://search.example.test/api/key/validate", {
    method: "POST",
    headers: { "X-eBird-Api-Key": apiKey },
  });
}

test("real eBird validation rejects an obviously fake API key", async () => {
  const worker = createSearchWorker();
  const response = await worker.fetch(validationRequest(fakeApiKey));

  assert.ok([401, 403].includes(response.status), `expected an authentication failure, received ${response.status}`);
  assert.equal((await response.json()).code, "invalid_api_key");
});

const validApiKey = process.env.EBIRD_API_KEY;
const mustHaveValidApiKey = process.env.EBIRD_INTEGRATION_REQUIRE_VALID_KEY === "1";

test("real eBird validation accepts the locally supplied API key", { skip: !validApiKey && !mustHaveValidApiKey }, async () => {
  assert.ok(validApiKey, "EBIRD_API_KEY is required by test:integration:required");
  const worker = createSearchWorker();
  const response = await worker.fetch(validationRequest(validApiKey));

  assert.equal(response.status, 200, `expected a valid-key response, received ${response.status}`);
  assert.deepEqual(await response.json(), { valid: true });
});
