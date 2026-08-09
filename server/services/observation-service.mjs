export function createObservationService({ ebird }) {
  const checklistCache = new Map();

  async function recent(speciesCode, days) {
    const items = await ebird.request(`/data/obs/TW/recent/${encodeURIComponent(speciesCode)}`, {
      back: days,
      includeProvisional: "true",
      sppLocale: "zh",
    });
    return items
      .filter((observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lng))
      .map((observation) => ({
        speciesCode: observation.speciesCode,
        comName: observation.comName,
        sciName: observation.sciName,
        obsDt: observation.obsDt,
        locName: observation.locName,
        howMany: observation.howMany ?? null,
        subId: observation.subId,
        lat: Number(observation.lat.toFixed(6)),
        lng: Number(observation.lng.toFixed(6)),
        locationPrivate: Boolean(observation.locationPrivate),
        obsValid: Boolean(observation.obsValid),
        obsReviewed: Boolean(observation.obsReviewed),
      }))
      .sort((a, b) => b.obsDt.localeCompare(a.obsDt));
  }

  async function checklist(subId) {
    if (!/^S\d+$/.test(subId)) {
      throw Object.assign(new Error("Invalid checklist ID"), { statusCode: 400 });
    }
    if (!checklistCache.has(subId)) {
      const request = ebird.request(`/product/checklist/view/${encodeURIComponent(subId)}`)
        .then((result) => ({
          subId,
          userDisplayName:
            typeof result.userDisplayName === "string" && result.userDisplayName.trim()
              ? result.userDisplayName.trim()
              : null,
        }))
        .catch((error) => {
          checklistCache.delete(subId);
          throw error;
        });
      checklistCache.set(subId, request);
    }
    return checklistCache.get(subId);
  }

  return { recent, checklist };
}
