/** Keep independent marker signals composable at the map rendering boundary. */
export function createMarkerClassName({ locationPrivate, discovery, active }) {
  return ["bird-marker", locationPrivate ? "private" : "", discovery ? "discovery" : "", active ? "active" : ""]
    .filter(Boolean)
    .join(" ");
}
