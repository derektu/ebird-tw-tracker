import type { Observation } from "../../types/domain";

export function prioritizeNotificationObservation(
  observations: Observation[],
  selected: Observation,
): Observation[];
