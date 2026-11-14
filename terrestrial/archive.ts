import type { Station } from "./types";

const POWER_START = "1981-01-01";

export interface RecordedDay {
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
}

const EMPTY: RecordedDay = {
  precipitationMm: null,
  precipitationChancePercent: null,
  cloudCoverPercent: null,
  windSpeedMs: null,
  temperatureC: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteOrNull(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= -999) return null;
  return value;
}

function numberAt(series: unknown, index: number): number | null {
  if (!Array.isArray(series)) return null;
  return finiteOrNull(series[index]);
}

/** NASA POWER daily values begin on 1 January 1981. Earlier days use the archive. */
export function powerDailyCovers(date: string): boolean {
  return date >= POWER_START;
}

export function powerDailyUrl(station: Station, date: string): string {
  const ymd = date.replace(/-/g, "");
  return (
    "https://power.larc.nasa.gov/api/temporal/daily/point" +
    "?parameters=T2M,PRECTOTCORR,WS10M,CLOUD_AMT&community=RE" +
    `&longitude=${station.eastLongitudeDeg}&latitude=${station.latitudeDeg}` +
    `&start=${ymd}&end=${ymd}&format=JSON`
  );
}

export function archiveUrl(station: Station, date: string): string {
  return (
    "https://archive-api.open-meteo.com/v1/archive" +
    `?latitude=${station.latitudeDeg}&longitude=${station.eastLongitudeDeg}` +
    `&start_date=${date}&end_date=${date}` +
    "&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max,cloud_cover_mean" +
    "&timezone=UTC&wind_speed_unit=ms"
  );
}

/** One day from a NASA POWER daily point response. Wind is already metres per second. */
export function parsePowerDay(payload: unknown, date: string): RecordedDay {
  try {
    const parameter = asRecord(asRecord(asRecord(payload)?.properties)?.parameter);
    if (!parameter) return { ...EMPTY };
    const key = date.replace(/-/g, "");
    return {
      precipitationMm: finiteOrNull(asRecord(parameter.PRECTOTCORR)?.[key]),
      precipitationChancePercent: null,
      cloudCoverPercent: finiteOrNull(asRecord(parameter.CLOUD_AMT)?.[key]),
      windSpeedMs: finiteOrNull(asRecord(parameter.WS10M)?.[key]),
      temperatureC: finiteOrNull(asRecord(parameter.T2M)?.[key]),
    };
  } catch {
    return { ...EMPTY };
  }
}

/** One day from the Open-Meteo archive. Wind in this request is metres per second. */
export function parseArchiveDay(payload: unknown, date: string): RecordedDay {
  try {
    const daily = asRecord(asRecord(payload)?.daily);
    if (!daily || !Array.isArray(daily.time)) return { ...EMPTY };
    const index = daily.time.findIndex((entry) => entry === date);
    if (index < 0) return { ...EMPTY };
    return {
      precipitationMm: numberAt(daily.precipitation_sum, index),
      precipitationChancePercent: null,
      cloudCoverPercent: numberAt(daily.cloud_cover_mean, index),
      windSpeedMs: numberAt(daily.wind_speed_10m_max, index),
      temperatureC: numberAt(daily.temperature_2m_mean, index),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function historySentence(input: {
  name: string;
  rainRisk: "low" | "elevated" | "high" | "unknown";
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
}): string {
  const temp = finiteOrNull(input.temperatureC) === null ? "temperature unknown" : `${Math.round(input.temperatureC as number)}°C`;
  const rain =
    finiteOrNull(input.precipitationMm) === null
      ? "rain unknown"
      : `${(input.precipitationMm as number).toFixed(1)} mm of rain`;
  const wind =
    finiteOrNull(input.windSpeedMs) === null ? "wind unknown" : `wind ${Math.round(input.windSpeedMs as number)} m/s`;
  const risk = input.rainRisk === "unknown" ? "Rain risk is unknown" : `Rain risk is ${input.rainRisk}`;
  const gust =
    finiteOrNull(input.windSpeedMs) !== null && (input.windSpeedMs as number) >= 12
      ? " The wind is high enough that a gust can push the dish off the Moon."
      : "";
  return `Recorded on this day at ${input.name}: ${temp}, ${rain}, ${wind}. ${risk}.${gust}`;
}
