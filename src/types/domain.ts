export interface Species {
  speciesCode: string;
  comName: string;
  sciName: string;
  category?: string;
  taxonOrder?: number;
}

export interface Observation {
  locId?: string | null;
  speciesCode: string;
  comName: string;
  sciName: string;
  obsDt: string;
  locName: string;
  howMany: number | null;
  subId: string;
  lat: number;
  lng: number;
  locationPrivate: boolean;
  obsValid: boolean;
  obsReviewed: boolean;
}

export interface ObservationEvent {
  id: number;
  type: "new-observation";
  createdAt: string;
  read: boolean;
  species: Species;
  observation: Observation;
}

export interface BirdSpot {
  locId: string;
  locName: string | null;
  lat: number | null;
  lng: number | null;
  locationType: "hotspot" | "personal" | "unknown";
}

export interface BirdSpotObservation extends BirdSpot {
  speciesCode: string;
  comName: string | null;
  sciName: string | null;
  obsDt: string;
  howMany: number | null;
  subId: string;
  locationPrivate: boolean | null;
  obsValid: boolean;
  obsReviewed: boolean;
}

export interface BirdSpotRecentResponse {
  locId: string;
  days: number;
  generatedAt: string;
  observations: BirdSpotObservation[];
}
