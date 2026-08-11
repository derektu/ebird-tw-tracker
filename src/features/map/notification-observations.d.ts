import type { Observation, ObservationEvent } from "../../types/domain";
import type { SearchResult } from "../search/types";

export function prioritizeNotificationObservation(
  observations: Observation[],
  selected: Observation,
): Observation[];

export function notificationCanApplyToSearchResult(
  pending: ObservationEvent | null,
  pendingRequestId: string | null,
  result: SearchResult,
): boolean;

export function selectCurrentNotification(
  observations: Observation[],
  selected: Observation,
  invalidateSearch: () => void,
): Observation[];
