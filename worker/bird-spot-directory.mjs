import { createBirdSpotDirectoryService } from "../server/services/bird-spot-directory-service.mjs";

export const directoryCacheUrl = "https://ebird-tw-search-cache.internal/hotspots/TW-v1";
export const directoryRetentionSeconds = 30 * 24 * 60 * 60;
export function createWorkerBirdSpotDirectory({ upstreamFetch, cache, now }) {
  const key = new Request(directoryCacheUrl);
  return createBirdSpotDirectoryService({ upstreamFetch, now,
    readCache: async () => (await cache?.match(key))?.json(),
    writeCache: async snapshot => cache?.put(key, Response.json(snapshot, {
      headers: { "cache-control": `public, max-age=${directoryRetentionSeconds}` },
    })),
  });
}
