import type { SpaceWeather } from "./types";

const SOURCE_NAME = "NOAA Space Weather Prediction Center";
const SOURCE_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

const NO_FORECAST =
  "No published solar-storm forecast reaches this date. Storms are only forecast a few days ahead.";
const STORM =
  "A solar storm is in the published forecast. It can make the signal flicker as it passes through the air above the dish.";
const QUIET = "No solar storm in the published forecast for this date.";

function unavailable(): SpaceWeather {
  return {
    available: false,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    maxKp: null,
    storm: false,
    sentence: NO_FORECAST,
  };
}

function numericKp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when the cell's instant falls on `date` in UTC. Zone-less NOAA times are already UTC. */
function timeFallsOnDate(value: unknown, date: string): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10) === date;
  }
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }
  return text === date || text.startsWith(`${date}T`) || text.startsWith(`${date} `);
}

/**
 * NOAA planetary K forecast. The first row is headers.
 * A Kp of 5 or more on that UTC date is a storm in this view.
 * This never throws.
 */
export function parseSwpcForecast(payload: unknown, date: string): SpaceWeather {
  try {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return unavailable();
    const headers = payload[0].map((cell) =>
      typeof cell === "string" ? cell.trim().toLowerCase() : "",
    );
    const timeIndex = headers.findIndex((header) => header.includes("time"));
    const kpIndex = headers.findIndex(
      (header, index) => index !== timeIndex && header.includes("k"),
    );
    if (timeIndex < 0 || kpIndex < 0) return unavailable();

    const values: number[] = [];
    for (const row of payload.slice(1)) {
      if (!Array.isArray(row)) continue;
      if (!timeFallsOnDate(row[timeIndex], date)) continue;
      const kp = numericKp(row[kpIndex]);
      if (kp !== null) values.push(kp);
    }
    if (values.length === 0) return unavailable();

    const maxKp = Math.max(...values);
    const storm = maxKp >= 5;
    return {
      available: true,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      maxKp,
      storm,
      sentence: storm ? STORM : QUIET,
    };
  } catch {
    return unavailable();
  }
}
