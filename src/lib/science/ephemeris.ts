/**
 * JPL Horizons observer ephemerides: request construction, parsing, and
 * azimuth interpolation. Parsers never invent samples.
 */

import type { CelestialTarget, EphemerisSample, EphemerisSeries } from "./types";
import {
  HORIZONS_API_URL,
  TIME_SAMPLE_HOURS,
} from "./constants";

export class LunarDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LunarDataError";
  }
}

export interface HorizonsParseMeta {
  target: CelestialTarget;
  siteId: string;
  request: Record<string, string>;
  retrievedAtUtc: string;
  source: EphemerisSeries["source"];
}

export interface HorizonsSiteQuery {
  target: CelestialTarget;
  eastLongitudeDeg: number;
  latitudeDeg: number;
  /** Metres above the lunar reference sphere. Not the equipment height. */
  surfaceHeightM: number;
  startUtc: string;
  stopUtc: string;
  stepHours?: number;
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function toUtcIso(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export function parseUtcMs(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new LunarDataError(`Invalid UTC time "${iso}".`);
  }
  return ms;
}

export function addHours(iso: string, hours: number): string {
  return toUtcIso(parseUtcMs(iso) + hours * 3_600_000);
}

/** Surface height in metres to the kilometres Horizons expects on SITE_COORD. */
export function altitudeKilometres(surfaceHeightM: number): number {
  return surfaceHeightM / 1000;
}

function formatNumber(value: number, fractionDigits: number): string {
  const text = value.toFixed(fractionDigits);
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * SITE_COORD value: east longitude degrees, geodetic latitude degrees,
 * altitude kilometres. Longitude is not rewritten; altitude is metres/1000.
 */
export function formatSiteCoord(
  eastLongitudeDeg: number,
  latitudeDeg: number,
  surfaceHeightM: number,
): string {
  const altKm = altitudeKilometres(surfaceHeightM);
  return [
    formatNumber(eastLongitudeDeg, 6),
    formatNumber(latitudeDeg, 6),
    formatNumber(altKm, 6),
  ].join(",");
}

export function horizonsTime(isoUtc: string): string {
  const ms = parseUtcMs(isoUtc);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** Query string parameters for one observer ephemeris. Targets are 10 and 399. */
export function buildHorizonsParams(query: HorizonsSiteQuery): Record<string, string> {
  const step = query.stepHours ?? TIME_SAMPLE_HOURS;
  return {
    format: "json",
    COMMAND: query.target === "sun" ? "10" : "399",
    MAKE_EPHEM: "YES",
    EPHEM_TYPE: "OBSERVER",
    OBJ_DATA: "NO",
    CENTER: "coord@301",
    COORD_TYPE: "GEODETIC",
    SITE_COORD: formatSiteCoord(
      query.eastLongitudeDeg,
      query.latitudeDeg,
      query.surfaceHeightM,
    ),
    START_TIME: horizonsTime(query.startUtc),
    STOP_TIME: horizonsTime(query.stopUtc),
    STEP_SIZE: `${step} h`,
    TIME_TYPE: "UT",
    QUANTITIES: "4",
    APPARENT: "AIRLESS",
    CSV_FORMAT: "YES",
  };
}

export function horizonsRequestUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${HORIZONS_API_URL}?${search.toString()}`;
}

export function cacheKey(
  siteId: string,
  target: CelestialTarget,
  start: string,
  stop: string,
  stepHours: number,
): string {
  return [
    siteId,
    target,
    toUtcIso(parseUtcMs(start)),
    toUtcIso(parseUtcMs(stop)),
    String(stepHours),
  ].join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (Array.isArray(error) && error.length > 0) {
    return error.map((item) => String(item)).join("; ");
  }
  return null;
}

function parseHorizonsDate(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith("b") || trimmed.startsWith("B")) {
    throw new LunarDataError(`Horizons returned a B.C. date (${trimmed}), which this tool does not accept.`);
  }
  const match = /^(\d{4})-([A-Za-z]{3})-(\d{1,2})\s+(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(
    trimmed,
  );
  if (!match) {
    throw new LunarDataError(`Unrecognised Horizons time "${trimmed}". No sample was invented.`);
  }
  const year = Number(match[1]);
  const month = MONTHS[match[2]];
  if (month === undefined) {
    throw new LunarDataError(`Unrecognised Horizons month in "${trimmed}".`);
  }
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const ms = Date.UTC(year, month, day, hour, minute, second);
  if (!Number.isFinite(ms)) {
    throw new LunarDataError(`Horizons time "${trimmed}" is not a real UTC instant.`);
  }
  return toUtcIso(ms);
}

function parseAngle(token: string, label: string): number {
  const text = token.trim();
  if (!text || /^n\.?\s*a\.?$/i.test(text)) {
    throw new LunarDataError(
      `Horizons ${label} is missing (${text || "blank"}). No sample was invented.`,
    );
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new LunarDataError(
      `Horizons ${label} is not a number ("${text}"). No sample was invented.`,
    );
  }
  return value;
}

function wrap360(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Parse a Horizons JSON payload (signature.version + result string).
 * The observer table is the CSV block between $$SOE and $$EOE.
 * An error field, a missing table, or an n.a. angle throws LunarDataError.
 */
export function parseHorizonsJson(payload: unknown, meta: HorizonsParseMeta): EphemerisSeries {
  if (!isRecord(payload)) {
    throw new LunarDataError("Horizons payload is not a JSON object.");
  }
  const failure = errorMessage(payload);
  if (failure) {
    throw new LunarDataError(`Horizons error: ${failure}`);
  }
  let apiVersion: string | null = null;
  if (isRecord(payload.signature) && typeof payload.signature.version === "string") {
    apiVersion = payload.signature.version;
  }
  if (typeof payload.result !== "string") {
    throw new LunarDataError("Horizons payload has no result string. No samples were invented.");
  }
  const result = payload.result;
  const soe = result.indexOf("$$SOE");
  const eoe = result.indexOf("$$EOE");
  if (soe < 0 || eoe < 0 || eoe < soe) {
    throw new LunarDataError(
      "Horizons result has no $$SOE/$$EOE table. No samples were invented.",
    );
  }
  const preamble = result.slice(0, soe).split(/\r?\n/);
  let header: string[] | null = null;
  for (const line of preamble) {
    if (line.includes("Azi") && line.includes("Elev")) {
      header = line.split(",").map((cell) => cell.trim());
    }
  }
  if (!header) {
    throw new LunarDataError(
      "Horizons table is missing azimuth and elevation column labels. No samples were invented.",
    );
  }
  const azimuthIndex = header.findIndex((cell) => cell.includes("Azi"));
  const elevationIndex = header.findIndex((cell) => cell.includes("Elev"));
  if (azimuthIndex < 0 || elevationIndex < 0) {
    throw new LunarDataError("Horizons azimuth or elevation column was not found.");
  }
  const table = result.slice(soe + "$$SOE".length, eoe);
  const samples: EphemerisSample[] = [];
  for (const rawLine of table.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = line.split(",");
    if (cells.length <= Math.max(azimuthIndex, elevationIndex)) {
      throw new LunarDataError(
        `Horizons row is missing columns ("${line}"). No sample was invented.`,
      );
    }
    const timeUtc = parseHorizonsDate(cells[0] ?? "");
    const azimuthDeg = wrap360(parseAngle(cells[azimuthIndex] ?? "", "azimuth"));
    const elevationDeg = parseAngle(cells[elevationIndex] ?? "", "elevation");
    samples.push({ timeUtc, azimuthDeg, elevationDeg });
  }
  if (samples.length === 0) {
    throw new LunarDataError(
      "Horizons returned no ephemeris samples between $$SOE and $$EOE. No samples were invented.",
    );
  }
  samples.sort((a, b) => parseUtcMs(a.timeUtc) - parseUtcMs(b.timeUtc));
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].timeUtc === samples[i - 1].timeUtc) {
      throw new LunarDataError(`Horizons repeated the time ${samples[i].timeUtc}.`);
    }
  }
  return {
    target: meta.target,
    siteId: meta.siteId,
    samples,
    request: { ...meta.request },
    retrievedAtUtc: meta.retrievedAtUtc,
    source: meta.source,
    apiVersion,
  };
}

/**
 * Shortest-path unwrapping of `azimuthDeg` relative to `referenceDeg`.
 * Crossing north (0/360) yields a continuous value, which may lie outside 0–360.
 * Example: reference 350 and azimuth 10 unwraps to 370, not to the long way around.
 */
export function unwrapAzimuthDegrees(referenceDeg: number, azimuthDeg: number): number {
  let value = azimuthDeg;
  while (value - referenceDeg > 180) value -= 360;
  while (referenceDeg - value > 180) value += 360;
  return value;
}

/**
 * Interpolate azimuth along the shortest arc and elevation linearly.
 * Times outside the series throw; nothing is extrapolated.
 */
export function interpolateAzimuth(
  samples: readonly EphemerisSample[],
  timeUtc: string,
): EphemerisSample {
  if (samples.length === 0) {
    throw new LunarDataError("No ephemeris samples to interpolate.");
  }
  const time = parseUtcMs(timeUtc);
  const first = parseUtcMs(samples[0].timeUtc);
  const last = parseUtcMs(samples[samples.length - 1].timeUtc);
  if (time < first || time > last) {
    throw new LunarDataError(
      `Time ${timeUtc} is outside the ephemeris range ${samples[0].timeUtc} to ${samples[samples.length - 1].timeUtc}.`,
    );
  }
  if (time === first) return { ...samples[0] };
  if (time === last) return { ...samples[samples.length - 1] };
  let hi = 1;
  while (hi < samples.length && parseUtcMs(samples[hi].timeUtc) < time) hi += 1;
  const right = samples[hi];
  const left = samples[hi - 1];
  const t0 = parseUtcMs(left.timeUtc);
  const t1 = parseUtcMs(right.timeUtc);
  if (t1 === time) return { ...right };
  const fraction = (time - t0) / (t1 - t0);
  const unwrapped = unwrapAzimuthDegrees(left.azimuthDeg, right.azimuthDeg);
  const azimuth = wrap360(left.azimuthDeg + fraction * (unwrapped - left.azimuthDeg));
  const elevation = left.elevationDeg + fraction * (right.elevationDeg - left.elevationDeg);
  return {
    timeUtc: toUtcIso(time),
    azimuthDeg: azimuth,
    elevationDeg: elevation,
  };
}

export function sliceSeries(
  series: EphemerisSeries,
  startUtc: string,
  stopUtc: string,
): EphemerisSeries {
  const start = parseUtcMs(startUtc);
  const stop = parseUtcMs(stopUtc);
  const samples = series.samples.filter((sample) => {
    const time = parseUtcMs(sample.timeUtc);
    return time >= start && time <= stop;
  });
  if (samples.length === 0) {
    throw new LunarDataError(
      `Cached Horizons series ${series.siteId}/${series.target} has no samples in ${startUtc} to ${stopUtc}.`,
    );
  }
  return {
    ...series,
    samples,
    request: {
      ...series.request,
      SLICE_START: toUtcIso(start),
      SLICE_STOP: toUtcIso(stop),
    },
  };
}
