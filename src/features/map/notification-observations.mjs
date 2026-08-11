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

export function notificationCanApplyToSearchResult(pending, pendingRequestId, result) {
  return Boolean(
    pending &&
      result.source === "notification-focus" &&
      pending.species.speciesCode === result.species.speciesCode &&
      (!pendingRequestId || pendingRequestId === result.requestId),
  );
}
