import kpFile from "./kp-daily.json";
import { isIsoDate } from "./regime";
import type { SpaceWeather } from "./types";

const START_MS = Date.parse(`${kpFile.start}T00:00:00Z`);
const DAY_MS = 86_400_000;

const SOURCE_NAME = "GFZ Kp index";

/** Highest 3-hour Kp on that UTC day. Null when the stored index does not cover the day. */
export function maxKpOn(date: string): number | null {
  if (!isIsoDate(date)) return null;
  const index = Math.round((Date.parse(`${date}T00:00:00Z`) - START_MS) / DAY_MS);
  if (index < 0 || index >= kpFile.maxKp.length) return null;
  const value = kpFile.maxKp[index];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Historical geomagnetic storm index for a past day.
 * Kp of 5 or more is a storm in this view. It does not say a radio call failed.
 */
export function kpSpaceWeather(date: string): SpaceWeather {
  const maxKp = maxKpOn(date);
  if (maxKp === null) {
    return {
      available: false,
      sourceName: SOURCE_NAME,
      sourceUrl: kpFile.sourceUrl,
      maxKp: null,
      storm: false,
      sentence: `No Kp reading is stored for this date. The index runs from ${kpFile.start} through ${kpFile.end}.`,
    };
  }
  const storm = maxKp >= 5;
  const shown = maxKp.toFixed(1);
  const sentence = storm
    ? `On this date the highest Kp was ${shown}. That counts as a solar storm here. It can make the signal flicker as it passes through the air. This does not say the call failed.`
    : `On this date the highest Kp was ${shown}. That is under the storm line we use, which is 5. A solar storm can make the signal flicker. This does not say the call failed.`;
  return {
    available: true,
    sourceName: SOURCE_NAME,
    sourceUrl: kpFile.sourceUrl,
    maxKp,
    storm,
    sentence,
  };
}
