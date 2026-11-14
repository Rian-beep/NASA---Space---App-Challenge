import climateFile from "./data/date-climate.json";
import type { RainRisk, StationId } from "./types";

export const DATE_CLIMATE_SOURCE = "NASA POWER date climate";

export interface DateNormal {
  years: number;
  temperatureC: number | null;
  precipitationMm: number | null;
  wetYears: number;
  windSpeedMs: number | null;
  cloudCoverPercent: number | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function finiteField(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNormal(value: unknown): DateNormal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<DateNormal>;
  if (typeof row.years !== "number" || row.years <= 0) return null;
  if (typeof row.wetYears !== "number") return null;
  return {
    years: row.years,
    temperatureC: finiteField(row.temperatureC),
    precipitationMm: finiteField(row.precipitationMm),
    wetYears: row.wetYears,
    windSpeedMs: finiteField(row.windSpeedMs),
    cloudCoverPercent: finiteField(row.cloudCoverPercent),
  };
}

/** NASA daily means for this month and day at one dish, 1991–2020. */
export function normalFor(stationId: StationId, date: string): DateNormal | null {
  const monthDay = date.slice(5);
  const table = climateFile.stations[stationId] as Record<string, unknown> | undefined;
  return asNormal(table?.[monthDay]);
}

/**
 * How often this date was wet in the NASA years, plus the average rain.
 * High: wet in at least 45% of years, or at least 5 mm on the average day.
 * Elevated: wet in at least 20% of years, or at least 1 mm on the average day.
 */
export function rainRiskFromDateNormal(normal: DateNormal | null): RainRisk {
  if (!normal || normal.precipitationMm === null || normal.years <= 0) return "unknown";
  const wetFraction = normal.wetYears / normal.years;
  if (wetFraction >= 0.45 || normal.precipitationMm >= 5) return "high";
  if (wetFraction >= 0.2 || normal.precipitationMm >= 1) return "elevated";
  return "low";
}

export function dateClimateSentence(name: string, date: string, normal: DateNormal, rainRisk: RainRisk): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? date.slice(5, 7);
  const day = Number(date.slice(8, 10));
  const temp = normal.temperatureC === null ? "temperature unknown" : `about ${Math.round(normal.temperatureC)}°C`;
  const rain =
    normal.precipitationMm === null ? "rain unknown" : `about ${normal.precipitationMm.toFixed(1)} mm of rain`;
  const risk = rainRisk === "unknown" ? "Rain risk is unknown" : `Rain risk is ${rainRisk}`;
  const gust =
    normal.windSpeedMs !== null && normal.windSpeedMs >= 12
      ? " The wind is high enough that a gust can push the dish off the Moon."
      : "";
  return (
    `Usual for ${day} ${month} at ${name}, from ${normal.years} NASA years at this dish: ${temp}, ${rain}, wet in ${normal.wetYears} of those years. ${risk}. ` +
    `This is the past pattern for this date, not a promise for one future day.${gust}`
  );
}

export function dateClimateUrl(): string {
  return climateFile.sourceUrl;
}
