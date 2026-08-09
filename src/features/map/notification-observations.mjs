function sameCoordinates(left, right) {
  return left.lat === right.lat && left.lng === right.lng;
}

export function prioritizeNotificationObservation(observations, selected) {
  return [
    selected,
    ...observations.filter(
      (observation) => observation.subId !== selected.subId && !sameCoordinates(observation, selected),
    ),
  ];
}
