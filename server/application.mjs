import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createApiRouter, jsonResponse } from "./http/api-router.mjs";
import { createEbirdClient, validateApiKey } from "./services/ebird-client.mjs";
import { createObservationService } from "./services/observation-service.mjs";
import { createSettingsService } from "./services/settings-service.mjs";
import { createSpeciesService } from "./services/species-service.mjs";
import { createTrackingService } from "./services/tracking-service.mjs";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

export async function createApplication({
  root,
  dataDir = path.join(root, "data"),
  distDir = path.join(root, "dist"),
  port = 7079,
  host = "127.0.0.1",
  isProduction = false,
  env = process.env,
  logger = console,
  minTrackerIntervalMs = 60_000,
  settingsStore,
  onEvents,
  onTrackingStateChange,
  viteHmr = true,
} = {}) {
  const paths = {
    savedSpecies: path.join(dataDir, "saved-species.json"),
    trackers: path.join(dataDir, "trackers.json"),
    seen: path.join(dataDir, "seen-observations.json"),
    events: path.join(dataDir, "events.json"),
    settings: path.join(dataDir, "settings.json"),
    taxonomy: path.join(dataDir, "taxonomy-cache.zh.json"),
  };

  let settings;
  settings = createSettingsService({ root, settingsPath: paths.settings, settingsStore, env, validateApiKey });
  const ebird = createEbirdClient({ getApiKey: () => settings.requireApiKey() });
  const observations = createObservationService({ ebird });
  const species = createSpeciesService({
    ebird,
    savedSpeciesPath: paths.savedSpecies,
    taxonomyCachePath: paths.taxonomy,
  });
  const tracking = createTrackingService({
    trackersPath: paths.trackers,
    seenPath: paths.seen,
    eventsPath: paths.events,
    observations,
    minTimerMs: minTrackerIntervalMs,
    logger,
    onEvents,
    onStateChange: onTrackingStateChange,
  });
  const handleApi = createApiRouter({ settings, species, observations, tracking });

  let vite = null;
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: viteHmr, ws: viteHmr },
      appType: "spa",
    });
  }

  async function serveStatic(request, response, url) {
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const requestedPath = path.resolve(distDir, `.${pathname}`);
    if (requestedPath !== distDir && !requestedPath.startsWith(`${distDir}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const body = await fs.readFile(requestedPath);
      response.writeHead(200, {
        "content-type": MIME_TYPES.get(path.extname(requestedPath)) ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      throw error;
    }
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
      else if (vite) {
        vite.middlewares(request, response, (error) => {
          if (!error) return;
          logger.error(error);
          if (!response.headersSent) jsonResponse(response, error.statusCode ?? 500, { error: error.message });
          else response.end();
        });
      } else await serveStatic(request, response, url);
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) logger.error(error);
      if (!response.headersSent) {
        jsonResponse(response, error.statusCode ?? 500, { error: error.message || "Internal server error" });
      } else response.end();
    }
  });

  async function listen() {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
    await tracking.start();
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    return { host, port: actualPort, url: `http://${host}:${actualPort}` };
  }

  async function close() {
    await tracking.stop();
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await vite?.close();
  }

  return { listen, close, server, services: { settings, species, observations, tracking } };
}
