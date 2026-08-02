import type { ObservationEvent } from "../../types/domain";

export interface EventsResponse {
  events: ObservationEvent[];
  unreadCount: number;
}
