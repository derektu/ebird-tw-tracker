/**
 * Reduce raw eBird recent-observation records to the fields the product
 * needs, keep only records with valid coordinates, and order them
 * newest-first by observation date.
 */
export function mapObservations(items) {
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
