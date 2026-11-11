import { searchBirdSpots } from "../../src/domain/bird-spot-directory.mjs";
import { SavedBirdSpotError } from "../../src/domain/saved-bird-spots.mjs";
import { BirdSpotError, readBirdSpotQuery } from "../../src/domain/bird-spots.mjs";
import { normalizeSpecies } from "../domain/species.mjs";
import { createSearchScope } from "../../src/domain/search-discovery.mjs";

export function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

export function createApiRouter({ settings, species, observations, tracking, searchSnapshots, birdSpots, savedBirdSpots, birdSpotDirectory }) {
  return async function handleApi(request, response, url) {
    if (url.pathname === "/api/settings/api-key" && request.method === "GET") {
      jsonResponse(response, 200, await settings.status());
      return;
    }
    if (url.pathname === "/api/settings/api-key" && request.method === "PUT") {
      const body = JSON.parse(await readBody(request));
      jsonResponse(response, 200, await settings.save(body.apiKey));
      return;
    }
    if (url.pathname === "/api/settings/api-key" && request.method === "DELETE") {
      jsonResponse(response, 200, await settings.remove());
      return;
    }
    if (url.pathname === "/api/species/saved" && request.method === "GET") {
      jsonResponse(response, 200, await species.listSaved());
      return;
    }
    if (url.pathname === "/api/species/search" && request.method === "GET") {
      jsonResponse(response, 200, { results: await species.search(url.searchParams.get("q") ?? "") });
      return;
    }
    if (url.pathname === "/api/species/resolve" && request.method === "GET") {
      jsonResponse(response, 200, await species.resolve(url.searchParams.get("q") ?? ""));
      return;
    }
    if (url.pathname === "/api/species/save" && request.method === "POST") {
      const normalized = normalizeSpecies(JSON.parse(await readBody(request)));
      if (!normalized.speciesCode || !normalized.comName) {
        jsonResponse(response, 400, { error: "speciesCode and comName are required" });
        return;
      }
      jsonResponse(response, 200, { saved: await species.save(normalized) });
      return;
    }
    if (["/api/bird-spots/directory", "/api/bird-spots/search"].includes(url.pathname)) {
      const searching = url.pathname.endsWith("/search");
      if (request.method !== "GET") { jsonResponse(response, 405, { code: "method_not_allowed", error: "此 API 僅接受 GET" }); return; }
      if ([...url.searchParams.keys()].some(key => !searching || key !== "q") || url.searchParams.getAll("q").length > 1 || (url.searchParams.get("q") ?? "").length > 200) {
        jsonResponse(response, 400, { code: "unexpected_query", error: "鳥點搜尋只接受單一 q（最多 200 字）" }); return;
      }
      let apiKey;
      try { apiKey = await settings.requireApiKey(); } catch {}
      const directory = await birdSpotDirectory.directory(apiKey);
      jsonResponse(response, 200, searching ? { ...directory, spots: searchBirdSpots(directory.spots, await savedBirdSpots.list(), url.searchParams.get("q") ?? "") } : directory);
      return;
    }
    const savedSpotMatch = url.pathname.match(/^\/api\/bird-spots\/saved(?:\/([^/]+))?$/);
    if (savedSpotMatch) {
      try {
        const resource = savedSpotMatch[1];
        if (!resource && request.method === "GET") {
          if ([...url.searchParams.keys()].some(key => key !== "sort") || url.searchParams.getAll("sort").length > 1) {
            throw new SavedBirdSpotError("invalid_saved_bird_spot", "收藏查詢只接受單一 sort");
          }
          jsonResponse(response, 200, { spots: await savedBirdSpots.list({ sort: url.searchParams.get("sort") ?? "pinned" }) });
        } else if (!resource && request.method === "POST") {
          const body = JSON.parse(await readBody(request));
          jsonResponse(response, 200, { spot: await savedBirdSpots.save(body?.spot) });
        } else if (resource === "restore" && request.method === "POST") {
          const body = JSON.parse(await readBody(request));
          jsonResponse(response, 200, { spot: await savedBirdSpots.restore(body?.spot) });
        } else if (resource && resource !== "restore" && request.method === "PATCH") {
          jsonResponse(response, 200, { spot: await savedBirdSpots.update(resource, JSON.parse(await readBody(request))) });
        } else if (resource && resource !== "restore" && request.method === "DELETE") {
          jsonResponse(response, 200, { removed: await savedBirdSpots.remove(resource) });
        } else throw new SavedBirdSpotError("method_not_allowed", "不支援的收藏操作", 405);
      } catch (error) {
        if (error instanceof SyntaxError) jsonResponse(response, 400, { code: "invalid_json", error: "請提供有效的 JSON" });
        else if (error instanceof SavedBirdSpotError) jsonResponse(response, error.statusCode, { code: error.code, error: error.message });
        else throw error;
      }
      return;
    }
    if (url.pathname === "/api/bird-spots/observations") {
      try {
        if (request.method !== "GET") throw new BirdSpotError(405, "method_not_allowed", "此 API 僅接受 GET");
        const { locId, days } = readBirdSpotQuery(url.searchParams);
        jsonResponse(response, 200, await birdSpots.recent(locId, days));
      } catch (error) {
        if (!(error instanceof BirdSpotError)) throw error;
        jsonResponse(response, error.statusCode, { code: error.code, error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/observations" && request.method === "GET") {
      const speciesCode = url.searchParams.get("speciesCode")?.trim();
      const daysRaw = Number.parseInt(url.searchParams.get("days") ?? "3", 10);
      const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 30)) : 3;
      if (!speciesCode) {
        jsonResponse(response, 400, { error: "speciesCode is required" });
        return;
      }
      jsonResponse(response, 200, {
        speciesCode,
        days,
        generatedAt: new Date().toISOString(),
        observations: await observations.recent(speciesCode, days),
      });
      return;
    }
    if (url.pathname === "/api/search-snapshots" && request.method === "GET") {
      const scope = createSearchScope(url.searchParams.get("speciesCode"), url.searchParams.get("days"));
      if (!scope.speciesCode) {
        jsonResponse(response, 400, { error: "speciesCode is required" });
        return;
      }
      jsonResponse(response, 200, { snapshot: await searchSnapshots.read(scope) });
      return;
    }
    if (url.pathname === "/api/search-snapshot-sessions" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      if (!searchSnapshots.advance(body.commitToken)) {
        jsonResponse(response, 409, { error: "stale search snapshot session" });
        return;
      }
      jsonResponse(response, 200, { advanced: true });
      return;
    }
    if (url.pathname === "/api/search-snapshots" && request.method === "PUT") {
      const body = JSON.parse(await readBody(request));
      const scope = createSearchScope(body.scope?.speciesCode, body.scope?.days);
      if (!scope.speciesCode || !body.snapshot || body.snapshot.scope?.key !== scope.key || !body.commitToken) {
        jsonResponse(response, 400, { error: "valid scope, snapshot, and commit token are required" });
        return;
      }
      const committed = await searchSnapshots.commit(scope, body.snapshot, body.commitToken);
      jsonResponse(response, 200, { snapshot: committed ? body.snapshot : null, committed });
      return;
    }

    const checklistMatch = url.pathname.match(/^\/api\/checklists\/([^/]+)$/);
    if (checklistMatch && request.method === "GET") {
      jsonResponse(response, 200, await observations.checklist(decodeURIComponent(checklistMatch[1])));
      return;
    }
    if (url.pathname === "/api/tracking" && request.method === "GET") {
      jsonResponse(response, 200, { trackers: await tracking.list() });
      return;
    }
    if (url.pathname === "/api/tracking" && request.method === "POST") {
      jsonResponse(response, 200, await tracking.upsert(JSON.parse(await readBody(request))));
      return;
    }

    const trackingMatch = url.pathname.match(/^\/api\/tracking\/([^/]+)$/);
    if (trackingMatch && request.method === "DELETE") {
      jsonResponse(response, 200, { trackers: await tracking.remove(decodeURIComponent(trackingMatch[1])) });
      return;
    }
    if (trackingMatch && request.method === "PATCH") {
      jsonResponse(response, 200, await tracking.update(
        decodeURIComponent(trackingMatch[1]),
        JSON.parse(await readBody(request)),
      ));
      return;
    }
    if (url.pathname === "/api/tracking/check" && request.method === "POST") {
      const bodyText = await readBody(request);
      jsonResponse(response, 200, await tracking.check(bodyText ? JSON.parse(bodyText) : {}));
      return;
    }
    if (url.pathname === "/api/events" && request.method === "GET") {
      jsonResponse(response, 200, await tracking.getEvents(Number.parseInt(url.searchParams.get("since") ?? "0", 10)));
      return;
    }
    if (url.pathname === "/api/events/read" && request.method === "POST") {
      jsonResponse(response, 200, await tracking.markAllEventsRead());
      return;
    }

    const eventReadMatch = url.pathname.match(/^\/api\/events\/(\d+)\/read$/);
    if (eventReadMatch && request.method === "PATCH") {
      jsonResponse(response, 200, await tracking.markEventRead(Number.parseInt(eventReadMatch[1], 10)));
      return;
    }
    jsonResponse(response, 404, { error: "Not found" });
  };
}
