/** UTC and unit formatting shared by the visualisation panels. */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function parseUtc(iso: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** ISO-8601 UTC without milliseconds, matching the science time contract. */
export function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatUtcLabel(iso: string): string {
  const ms = parseUtc(iso);
  if (ms == null) return "Invalid time";
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = date.getUTCSeconds();
  const secondText =
    seconds === 0 ? "" : `:${String(seconds).padStart(2, "0")}`;
  return `${year}-${month}-${day} ${hours}:${minutes}${secondText} UTC`;
}

export function formatTickLabel(ms: number, stepMs: number, spanMs: number): string {
  const date = new Date(ms);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const dayMs = 86_400_000;
  if (spanMs <= 3 * dayMs && stepMs < dayMs) return `${hours}:${minutes}`;
  if (stepMs >= dayMs) return `${month} ${day}`;
  return `${month} ${day} ${hours}:${minutes}`;
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const sign = hours < 0 ? "-" : "";
  const absolute = Math.abs(hours);
  const rounded = Math.round(absolute * 10) / 10;
  if (absolute > 0 && rounded === 0) return `${sign}< 0.1 h`;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${sign}${text} h`;
}

/** `accessPercent` is treated as 0–100, not a fraction. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

export function formatDegrees(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}°`;
}

export function formatLatitude(deg: number): string {
  if (!Number.isFinite(deg)) return "—";
  const hemisphere = deg < 0 ? "S" : deg > 0 ? "N" : "";
  const magnitude = Math.abs(deg).toFixed(3);
  return hemisphere ? `${magnitude}° ${hemisphere}` : `${magnitude}°`;
}

/** Positive east, negative west, after wrapping into (−180°, 180°]. */
export function formatLongitude(deg: number): string {
  if (!Number.isFinite(deg)) return "—";
  const wrapped = wrapDegrees(deg);
  if (Math.abs(Math.abs(wrapped) - 180) < 1e-9) return "180°";
  const hemisphere = wrapped > 0 ? "E" : wrapped < 0 ? "W" : "E";
  return `${Math.abs(wrapped).toFixed(3)}° ${hemisphere}`;
}

export function formatMetres(metres: number): string {
  if (!Number.isFinite(metres)) return "—";
  const rounded = Math.round(metres);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped} m`;
}

export function formatKilometres(metres: number): string {
  if (!Number.isFinite(metres)) return "—";
  const km = metres / 1000;
  const rounded = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} km`;
}

export function wrapDegrees(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1, 2, 5 × 10ⁿ at or above `raw` when rounding up a scale, else the nice step at or below. */
export function niceLength(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / power;
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return nice * power;
}
