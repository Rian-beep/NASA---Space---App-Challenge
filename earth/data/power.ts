const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const EMPTY = {
  precipitationMm: null,
  cloudCoverPercent: null,
  windSpeedMs: null,
  temperatureC: null,
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** NASA POWER uses -999 as the missing fill. */
function finiteOrNull(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= -999) return null;
  return value;
}

function readMonth(series: unknown, monthIndex: number): number | null {
  const table = asRecord(series);
  const key = MONTHS[monthIndex];
  if (!table || !key) return null;
  return finiteOrNull(table[key]);
}

/**
 * One month from a NASA POWER climatology point response.
 * A wrong shape returns nulls. This never throws.
 */
export function parsePowerMonth(
  payload: unknown,
  monthIndex: number,
): {
  precipitationMm: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
} {
  try {
    const properties = asRecord(asRecord(payload)?.properties);
    const parameter = asRecord(properties?.parameter);
    if (!parameter) return { ...EMPTY };
    return {
      precipitationMm: readMonth(parameter.PRECTOTCORR, monthIndex),
      cloudCoverPercent: readMonth(parameter.CLOUD_AMT, monthIndex),
      windSpeedMs: readMonth(parameter.WS10M, monthIndex),
      temperatureC: readMonth(parameter.T2M, monthIndex),
    };
  } catch {
    return { ...EMPTY };
  }
}
