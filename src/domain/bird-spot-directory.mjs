import { BirdSpotError, normalizeBirdSpot } from "./bird-spots.mjs";

const text = value => typeof value === "string" && value.trim() ? value.trim() : null;
export const normalizeBirdSpotText = value => (text(value) ?? "").normalize("NFKC").replaceAll("臺", "台").toLowerCase();

export function normalizeBirdSpotDirectory(items) {
  if (!Array.isArray(items)) throw new BirdSpotError(502, "malformed_upstream_response", "eBird 回傳的目錄無法解析");
  const spots = new Map();
  for (const item of items) {
    const spot = normalizeBirdSpot(item);
    if (!spot || (item.countryCode != null && item.countryCode !== "TW")) {
      throw new BirdSpotError(502, "malformed_upstream_response", "eBird 回傳的目錄無法解析");
    }
    spots.set(spot.locId, {
      ...spot, locationType: "hotspot",
      countryCode: text(item.countryCode),
      subnational1Code: text(item.subnational1Code),
      subnational2Code: text(item.subnational2Code),
    });
  }
  return [...spots.values()];
}

// Call with only local saved spots: aliases and notes must never reach the Worker.
export function searchBirdSpots(directory, saved, query = "") {
  const publicNames = new Map(directory.map(spot => [spot.locId, spot.locName]));
  const byId = new Map(directory.map(spot => [spot.locId, { ...spot, saved: false }]));
  for (const favorite of saved) {
    const publicSpot = byId.get(favorite.locId);
    byId.set(favorite.locId, { ...publicSpot, ...favorite,
      locationType: favorite.locationType && favorite.locationType !== "unknown" ? favorite.locationType : publicSpot?.locationType ?? "unknown",
      locName: favorite.locName ?? publicSpot?.locName ?? null,
      lat: favorite.lat ?? publicSpot?.lat ?? null,
      lng: favorite.lng ?? publicSpot?.lng ?? null,
      saved: true,
    });
  }
  const needle = normalizeBirdSpotText(query);
  return [...byId.values()].filter(spot => [spot.locId, spot.locName, spot.alias, spot.note,
    spot.countryCode, spot.subnational1Code, spot.subnational2Code,
    publicNames.get(spot.locId),
  ].some(value => normalizeBirdSpotText(value).includes(needle)));
}
