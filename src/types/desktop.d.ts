import type { ObservationEvent } from "./domain";

declare global {
  interface Window {
    eBirdDesktop?: {
      onNotificationSelected(callback: (event: ObservationEvent) => void): () => void;
    };
  }
}

export {};
