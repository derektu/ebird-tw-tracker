import assert from "node:assert/strict";
import test from "node:test";
import { ApiKeyValidationError, validateBrowserApiKey } from "../src/api/worker-client.mjs";

const apiKey = "browser-owned-key";

test("browser API-key validation only transports credentials over HTTPS or loopback preview", async () => {
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return new Response('{"valid":true}', { headers: { "content-type": "application/json" } });
  };

  await validateBrowserApiKey(apiKey, { location: new URL("https://search.example.test/"), request });
  await validateBrowserApiKey(apiKey, { location: new URL("http://127.0.0.1:7082/"), request });
  await assert.rejects(
    validateBrowserApiKey(apiKey, { location: new URL("http://search.example.test/"), request }),
    (error) => error instanceof ApiKeyValidationError && error.message.includes("HTTPS"),
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ url }) => url), ["/api/key/validate", "/api/key/validate"]);
  assert.ok(requests.every(({ options }) => options.headers["X-eBird-Api-Key"] === apiKey));
});

test("browser API-key validation aborts a hung request with a bounded temporary error", async () => {
  const request = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });

  await assert.rejects(
    validateBrowserApiKey(apiKey, {
      location: new URL("https://search.example.test/"),
      request,
      timeoutMs: 10,
    }),
    (error) => error instanceof ApiKeyValidationError && error.message.includes("逾時"),
  );
});
