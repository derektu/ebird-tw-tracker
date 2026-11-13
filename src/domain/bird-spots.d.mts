import type { BirdSpot, BirdSpotObservation, BirdSpotRecentResponse } from "../types/domain";
export function normalizeLocationId(value: unknown): string | null;
export class BirdSpotError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string);
}
export function readBirdSpotQuery(searchParams: URLSearchParams): { locId: string; days: number };
export function normalizeBirdSpot(item: unknown): BirdSpot | null;
export function mapBirdSpotObservations(items: unknown): BirdSpotObservation[];
export function getBirdSpotRecentDetail(spot: BirdSpot, response: BirdSpotRecentResponse | null): {
  spot: BirdSpot;
  observations: BirdSpotObservation[];
  hasOtherLocations: boolean;
};
