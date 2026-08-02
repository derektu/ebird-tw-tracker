export interface Species {
  speciesCode: string;
  comName: string;
  sciName: string;
  category?: string;
  taxonOrder?: number;
}

export interface Observation {
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
