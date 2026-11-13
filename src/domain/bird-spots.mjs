const locationIdPattern = /^L\d+$/;

export function normalizeLocationId(value) {
  return typeof value === "string" && locationIdPattern.test(value.trim()) ? value.trim() : null;
}

export class BirdSpotError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function readBirdSpotQuery(searchParams) {
  for (const key of searchParams.keys()) {
    if (!["locId", "days"].includes(key) || searchParams.getAll(key).length !== 1) {
      throw new BirdSpotError(400, "unexpected_query", "鳥點查詢只接受單一 locId 與 days");
    }
  }
  const locId = normalizeLocationId(searchParams.get("locId"));
  if (!locId) throw new BirdSpotError(400, "invalid_location_id", "locId 必須是 eBird 地點 ID（L 加數字）");
  const daysRaw = searchParams.get("days") ?? "14";
  if (!/^\d{1,2}$/.test(daysRaw) || Number(daysRaw) < 1 || Number(daysRaw) > 30) {
    throw new BirdSpotError(400, "invalid_days", "days 必須是 1 到 30 之間的整數");
  }
  return { locId, days: Number(daysRaw) };
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeBirdSpot(item) {
  if (!item || typeof item !== "object") return null;
  const locId = normalizeLocationId(item.locId);
  if (!locId) return null;
  const hasCoordinates = Number.isFinite(item.lat) && Math.abs(item.lat) <= 90
    && Number.isFinite(item.lng) && Math.abs(item.lng) <= 180;
  return {
    locId,
    locName: optionalText(item.locName),
    lat: hasCoordinates ? Number(item.lat.toFixed(6)) : null,
    lng: hasCoordinates ? Number(item.lng.toFixed(6)) : null,
    locationType: item.locationPrivate === true ? "personal" : item.locationPrivate === false ? "hotspot" : "unknown",
  };
}

export function mapBirdSpotObservations(items) {
  if (!Array.isArray(items)) throw new BirdSpotError(502, "malformed_upstream_response", "eBird 回傳的資料無法解析");
  return items.map((item) => {
    const spot = normalizeBirdSpot(item);
    if (!spot || typeof item.speciesCode !== "string" || !item.speciesCode.trim()
      || typeof item.obsDt !== "string" || !item.obsDt.trim() || !/^S\d+$/.test(item.subId)) {
      throw new BirdSpotError(502, "malformed_upstream_response", "eBird 回傳的資料無法解析");
    }
    return {
      ...spot,
      speciesCode: item.speciesCode,
      comName: optionalText(item.comName),
      sciName: optionalText(item.sciName),
      obsDt: item.obsDt,
      subId: item.subId,
      howMany: Number.isFinite(item.howMany) && item.howMany >= 0 ? item.howMany : null,
      locationPrivate: typeof item.locationPrivate === "boolean" ? item.locationPrivate : null,
      obsValid: item.obsValid === true,
      obsReviewed: item.obsReviewed === true,
    };
  }).sort((a, b) => b.obsDt.localeCompare(a.obsDt));
}

export function getBirdSpotRecentDetail(spot, response) {
  const observations = response?.locId === spot.locId ? response.observations : [];
  const matching = observations.filter(row => row.locId === spot.locId);
  const coordinates = matching.find(row => row.lat !== null && row.lng !== null);
  return {
    spot: {
      ...spot,
      locName: spot.locName ?? matching.find(row => row.locName)?.locName ?? null,
      lat: spot.lat ?? coordinates?.lat ?? null,
      lng: spot.lng ?? coordinates?.lng ?? null,
      locationType: spot.locationType === "unknown" ? matching.find(row => row.locationType !== "unknown")?.locationType ?? "unknown" : spot.locationType,
    },
    observations,
    hasOtherLocations: observations.some(row => row.locId !== spot.locId),
  };
}
