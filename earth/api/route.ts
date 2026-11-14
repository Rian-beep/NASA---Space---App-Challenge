import { buildEarthReport } from "../data/report";

export const dynamic = "force-dynamic";

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LENGTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CACHE_CONTROL = "public, max-age=900";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** A real Gregorian calendar day, written YYYY-MM-DD. Not a rolled-over date. */
function isCalendarDay(value: string): boolean {
  const match = CALENDAR_DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const length = MONTH_LENGTH[month] + (month === 2 && isLeapYear(year) ? 1 : 0);
  return day >= 1 && day <= length;
}

function mentionsDate(message: string): boolean {
  return /\bdates?\b/i.test(message) || /\d{4}-\d{2}-\d{2}/.test(message);
}

function thrownMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function json(body: unknown, status: number, cacheControl: string) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

const hits: number[] = [];

function tooManyRequests(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 60) return true;
  hits.push(now);
  return false;
}

export async function GET(request: Request) {
  if (tooManyRequests()) {
    return json({ error: "Too many Earth reads. Wait a minute and try again." }, 429, "no-store");
  }
  const today = utcToday();
  const date = new URL(request.url).searchParams.get("date") ?? today;
  if (!isCalendarDay(date)) {
    return json({ error: "Use a date like 2026-12-05." }, 400, CACHE_CONTROL);
  }

  try {
    const report = await buildEarthReport({ date, today });
    return json(report, 200, CACHE_CONTROL);
  } catch (error) {
    const message = thrownMessage(error);
    if (mentionsDate(message)) {
      return json({ error: message }, 400, CACHE_CONTROL);
    }
    return json({ error: "The Earth read failed." }, 502, "no-store");
  }
}
