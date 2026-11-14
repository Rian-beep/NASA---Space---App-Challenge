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
const CLOUD = "effective_cloud_cover:p";

export function meteomaticsUrl(latitudeDeg: number, eastLongitudeDeg: number, date: string): string {
  const parameters = [TEMPERATURE, PRECIPITATION, WIND, CLOUD].join(",");
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
  const empty: MeteomaticsDay = {
    precipitationMm: null,
    precipitationChancePercent: null,
    cloudCoverPercent: null,
    windSpeedMs: null,
    temperatureC: null,
  };
  if (!payload || typeof payload !== "object") return empty;
  const status = (payload as { status?: unknown }).status;
  if (typeof status === "string" && status.toUpperCase() !== "OK") return empty;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return empty;

  const series = new Map<string, number[]>();
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const parameter = (item as { parameter?: unknown }).parameter;
    const coordinates = (item as { coordinates?: unknown }).coordinates;
    if (typeof parameter !== "string" || !Array.isArray(coordinates) || !coordinates[0]) continue;
    const dates = (coordinates[0] as { dates?: unknown }).dates;
    if (!Array.isArray(dates)) continue;
    const values: number[] = [];
    for (const row of dates) {
      if (!row || typeof row !== "object") continue;
      const value = (row as { value?: unknown }).value;
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
    series.set(parameter, values);
  }

  const rain = series.get(PRECIPITATION) ?? [];
  const wind = series.get(WIND) ?? [];
  const cloud = series.get(CLOUD) ?? [];
  const temperature = series.get(TEMPERATURE) ?? [];
  return {
    precipitationMm: rain.length > 0 ? sum(rain) : null,
    precipitationChancePercent: null,
    cloudCoverPercent: cloud.length > 0 ? mean(cloud) : null,
    windSpeedMs: wind.length > 0 ? Math.max(...wind) : null,
    temperatureC: temperature.length > 0 ? mean(temperature) : null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}
