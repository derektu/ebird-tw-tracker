import fs from "node:fs/promises";
import path from "node:path";
import { readJson, writePrivateJson } from "../storage/json-store.mjs";

export function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const name = trimmed.split("=")[0].trim();
    let value = trimmed.split("=").slice(1).join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
}

export function createSettingsService({ root, settingsPath, settingsStore, env = process.env, validateApiKey }) {
  const store = settingsStore ?? {
    read: () => readJson(settingsPath, {}),
    write: (value) => writePrivateJson(settingsPath, value),
  };
  async function readDotEnv() {
    try {
      return parseEnv(await fs.readFile(path.join(root, ".env"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return new Map();
      throw error;
    }
  }

  async function resolveApiKey() {
    const processKey = env.EBIRD_API_KEY;
    if (processKey?.trim()) return { apiKey: processKey.trim(), source: "environment" };

    const dotEnv = await readDotEnv();
    const dotEnvKey = dotEnv.get("EBIRD_API_KEY");
    if (dotEnvKey?.trim()) return { apiKey: dotEnvKey.trim(), source: "environment" };

    const settings = await store.read();
    if (settings.apiKey?.trim()) return { apiKey: settings.apiKey.trim(), source: "settings" };
    return { apiKey: null, source: "none" };
  }

  async function requireApiKey() {
    const resolved = await resolveApiKey();
    if (!resolved.apiKey) {
      throw Object.assign(new Error("尚未設定 eBird API key"), { statusCode: 503 });
    }
    return resolved.apiKey;
  }

  async function status() {
    const resolved = await resolveApiKey();
    return {
      configured: Boolean(resolved.apiKey),
      source: resolved.source,
      editable: resolved.source !== "environment",
    };
  }

  async function save(apiKey) {
    const resolved = await resolveApiKey();
    if (resolved.source === "environment") {
      throw Object.assign(new Error("API key 目前由環境設定管理"), { statusCode: 409 });
    }
    const normalized = String(apiKey ?? "").trim();
    if (normalized.length < 8 || normalized.length > 256 || /\s/.test(normalized)) {
      throw Object.assign(new Error("請輸入有效的 eBird API key"), { statusCode: 400 });
    }
    await validateApiKey(normalized);
    await store.write({ apiKey: normalized, updatedAt: new Date().toISOString() });
    return { configured: true, source: "settings", editable: true };
  }

  async function remove() {
    const resolved = await resolveApiKey();
    if (resolved.source === "environment") {
      throw Object.assign(new Error("API key 目前由環境設定管理"), { statusCode: 409 });
    }
    await store.write({ updatedAt: new Date().toISOString() });
    return { configured: false, source: "none", editable: true };
  }

  return { resolveApiKey, requireApiKey, status, save, remove };
}
