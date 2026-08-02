import { normalizeSpecies } from "../domain/species.mjs";

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

export function createApiRouter({ settings, species, observations, tracking }) {
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
