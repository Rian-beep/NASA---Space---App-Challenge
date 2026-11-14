/** Shared contract for the Earth-dish view. Import these types. Do not invent a second set. */

export type StationId = "goldstone" | "madrid" | "canberra";

/** Forecast: a published weather model for a near date. Typical: NASA monthly normals. */
export type WeatherRegime = "forecast" | "typical-for-this-date";

export type RainRisk = "low" | "elevated" | "high" | "unknown";

export interface Station {
  id: StationId;
  name: string;
  dish: string;
  place: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
  elevationM: number;
}

export interface StationWeather {
  stationId: StationId;
  date: string;
  regime: WeatherRegime;
  sourceName: string;
  sourceUrl: string;
  /** Millimetres. Forecast: that day's total. Typical: average per day in that month. */
  precipitationMm: number | null;
  /** 0–100. Null for typical weather. The monthly product has no rain chance. */
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
  rainRisk: RainRisk;
  /** One or two short sentences. No promise that a radio call works. */
  sentence: string;
  /** One entry per hour when the read is hourly. Empty for a monthly typical. */
  hours: HourWeather[];
}

export interface HourWeather {
  timeUtc: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  gustSpeedMs: number | null;
  cloudCoverPercent: number | null;
  /** Heavy rain or a strong gust in this hour. Not a radio-link failure. */
  groundStorm: boolean;
  sentence: string;
}

export interface SpaceWeather {
  available: boolean;
  sourceName: string;
  sourceUrl: string;
  maxKp: number | null;
  storm: boolean;
  sentence: string;
}

export interface MoonAtStation {
  stationId: StationId;
  timeUtc: string;
  elevationDeg: number | null;
  /** True when the centre of the Moon is above the horizon. */
  moonUp: boolean | null;
  sourceName: string;
}

export interface EarthDayReport {
  date: string;
  today: string;
  weather: StationWeather[];
  space: SpaceWeather;
  moon: MoonAtStation[];
  caveat: string;
}

export const EARTH_CAVEAT =
  "This is a planning view. It does not say the radio call will work, and it does not approve a landing. Rain and solar storms can weaken a signal. Moon height is a sky calculation, not a Deep Space Network schedule.";
