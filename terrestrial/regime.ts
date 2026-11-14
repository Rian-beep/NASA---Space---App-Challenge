import type { WeatherRegime } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD that is a real Gregorian day. Rejects 2026-02-31 and 2026-13-01. */
export function isIsoDate(value: string): boolean {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const length = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= length;
}

/** Whole UTC days from `today` to `target` (target minus today). */
export function daysBetween(today: string, target: string): number {
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const [targetYear, targetMonth, targetDay] = target.split("-").map(Number);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/**
 * Forecast when the target is today or up to `horizonDays` ahead.
 * Anything else, including the past, is the monthly typical weather.
 */
export function regimeForDate(
  targetDate: string,
  today: string,
  horizonDays = 16,
): WeatherRegime {
  if (!isIsoDate(targetDate) || !isIsoDate(today)) {
    throw new Error("Invalid date");
  }
  const delta = daysBetween(today, targetDate);
  if (delta >= 0 && delta <= horizonDays) return "forecast";
  return "typical-for-this-date";
}
