import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSecureSettingsStore } from "../electron/secure-settings.mjs";

function createFakeSafeStorage({ available = true, shouldReEncrypt = false } = {}) {
  return {
    async isAsyncEncryptionAvailable() {
      return available;
    },
    async encryptStringAsync(value) {
      return Buffer.from(`encrypted:${Buffer.from(value, "utf8").toString("base64")}`, "utf8");
    },
    async decryptStringAsync(value) {
      const encoded = value.toString("utf8").replace(/^encrypted:/, "");
      return {
        result: Buffer.from(encoded, "base64").toString("utf8"),
        shouldReEncrypt,
      };
    },
  };
}

test("secure settings encrypts API keys at rest and restores them", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-secure-settings-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "settings.encrypted");
  const store = createSecureSettingsStore({ filePath, safeStorage: createFakeSafeStorage() });

  await store.write({ apiKey: "secret-api-key", updatedAt: "2026-08-02T00:00:00.000Z" });

  const stored = await fs.readFile(filePath);
  assert.equal(stored.includes(Buffer.from("secret-api-key")), false);
  assert.notEqual(stored.toString("utf8"), JSON.stringify({ apiKey: "secret-api-key" }));
  assert.deepEqual(await store.read(), {
    apiKey: "secret-api-key",
    updatedAt: "2026-08-02T00:00:00.000Z",
  });
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test("secure settings rejects writes when operating-system encryption is unavailable", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-secure-settings-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createSecureSettingsStore({
    filePath: path.join(directory, "settings.encrypted"),
    safeStorage: createFakeSafeStorage({ available: false }),
  });

  await assert.rejects(() => store.write({ apiKey: "secret-api-key" }), {
    message: "系統安全儲存空間目前不可用",
    statusCode: 503,
  });
});
