/**
 * Point weather above one dish from the Meteomatics Weather API.
 * The username and password stay on the server. They are never written into the report URL.
 */

export type MeteomaticsDay = {
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
};

const TEMPERATURE = "t_2m:C";
const PRECIPITATION = "precip_1h:mm";
const WIND = "wind_speed_10m:ms";
const GUST = "wind_gusts_10m:ms";
const CLOUD = "effective_cloud_cover:p";

export interface MeteomaticsHour {
  timeUtc: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  gustSpeedMs: number | null;
  cloudCoverPercent: number | null;
}

export function meteomaticsUrl(latitudeDeg: number, eastLongitudeDeg: number, date: string): string {
  const parameters = [TEMPERATURE, PRECIPITATION, WIND, GUST, CLOUD].join(",");
  return (
    `https://api.meteomatics.com/${date}T00:00:00Z--${date}T23:00:00Z:PT1H` +
    `/${parameters}/${latitudeDeg},${eastLongitudeDeg}/json`
  );
}

export function meteomaticsAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

/** Hourly series for one place, summed and averaged into one day. A bad payload is all nulls. */
export function parseMeteomaticsDay(payload: unknown): MeteomaticsDay {
  const hours = parseMeteomaticsHours(payload);
  const rain = numbers(hours.map((hour) => hour.precipitationMm));
  const wind = numbers(hours.map((hour) => hour.windSpeedMs));
  const cloud = numbers(hours.map((hour) => hour.cloudCoverPercent));
  const temperature = numbers(hours.map((hour) => hour.temperatureC));
  return {
    precipitationMm: rain.length > 0 ? sum(rain) : null,
    precipitationChancePercent: null,
    cloudCoverPercent: cloud.length > 0 ? mean(cloud) : null,
    windSpeedMs: wind.length > 0 ? Math.max(...wind) : null,
    temperatureC: temperature.length > 0 ? mean(temperature) : null,
  };
}

/** One row per hour. Gusts may be missing. A bad payload is an empty list. */
export function parseMeteomaticsHours(payload: unknown): MeteomaticsHour[] {
  if (!payload || typeof payload !== "object") return [];
  const status = (payload as { status?: unknown }).status;
  if (typeof status === "string" && status.toUpperCase() !== "OK") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const byTime = new Map<string, MeteomaticsHour>();
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const parameter = (item as { parameter?: unknown }).parameter;
    const coordinates = (item as { coordinates?: unknown }).coordinates;
    if (typeof parameter !== "string" || !Array.isArray(coordinates) || !coordinates[0]) continue;
    const dates = (coordinates[0] as { dates?: unknown }).dates;
    if (!Array.isArray(dates)) continue;
    for (const row of dates) {
      if (!row || typeof row !== "object") continue;
      const stamp = (row as { date?: unknown }).date;
      if (typeof stamp !== "string") continue;
      const hour = byTime.get(stamp) ?? emptyHour(stamp);
      const value = (row as { value?: unknown }).value;
      const number = typeof value === "number" && Number.isFinite(value) ? value : null;
      if (parameter === TEMPERATURE) hour.temperatureC = number;
      if (parameter === PRECIPITATION) hour.precipitationMm = number;
      if (parameter === WIND) hour.windSpeedMs = number;
      if (parameter === GUST) hour.gustSpeedMs = number;
      if (parameter === CLOUD) hour.cloudCoverPercent = number;
      byTime.set(stamp, hour);
    }
  }
  return [...byTime.values()].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
}

function emptyHour(timeUtc: string): MeteomaticsHour {
  return {
    timeUtc,
    temperatureC: null,
    precipitationMm: null,
    windSpeedMs: null,
    gustSpeedMs: null,
    cloudCoverPercent: null,
  };
}

function numbers(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}
