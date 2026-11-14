const EMPTY = {
  precipitationMm: null,
  precipitationChancePercent: null,
  cloudCoverPercent: null,
  windSpeedMs: null,
  temperatureC: null,
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberAt(series: unknown, index: number): number | null {
  if (!Array.isArray(series)) return null;
  const value = series[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateIndex(times: unknown, date: string): number {
  if (!Array.isArray(times)) return -1;
  return times.findIndex((entry) => {
    if (typeof entry !== "string") return false;
    return entry === date || entry.startsWith(`${date}T`) || entry.startsWith(`${date} `);
  });
}

/**
 * One UTC day from an Open-Meteo daily forecast.
 * `wind_speed_10m_max` is kilometres per hour in this request and is converted to m/s.
 * A missing date or a wrong shape returns nulls. This never throws.
 */
export function parseOpenMeteoDay(
  payload: unknown,
  date: string,
): {
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
} {
  try {
    const daily = asRecord(asRecord(payload)?.daily);
    if (!daily) return { ...EMPTY };
    const index = dateIndex(daily.time, date);
    if (index < 0) return { ...EMPTY };
    const windKmh = numberAt(daily.wind_speed_10m_max, index);
    return {
      precipitationMm: numberAt(daily.precipitation_sum, index),
      precipitationChancePercent: numberAt(daily.precipitation_probability_max, index),
      cloudCoverPercent: numberAt(daily.cloud_cover_mean, index),
      windSpeedMs: windKmh === null ? null : windKmh / 3.6,
      temperatureC: numberAt(daily.temperature_2m_mean, index),
    };
  } catch {
    return { ...EMPTY };
  }
}
