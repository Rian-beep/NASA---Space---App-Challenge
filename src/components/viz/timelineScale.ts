/**
 * Time-window geometry for the timeline and the scrubber.
 * Durations are clipped to the requested window. Nothing is extended past it.
 */

import { formatHours, formatTickLabel, parseUtc, toIsoUtc } from "./format";

export interface IntervalLike {
  startUtc: string;
  endUtc: string;
  kind: "access" | "interruption";
  truncated: boolean;
}

export interface TimeTick {
  fraction: number;
  label: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function windowBounds(
  startUtc: string,
  endUtc: string,
): { startMs: number; endMs: number } | null {
  const startMs = parseUtc(startUtc);
  const endMs = parseUtc(endUtc);
  if (startMs == null || endMs == null || !(endMs > startMs)) return null;
  return { startMs, endMs };
}

export function timeFraction(ms: number, startMs: number, endMs: number): number {
  const span = endMs - startMs;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (ms - startMs) / span));
}

/** Nearest minute, clamped to the window. */
export function fractionToIso(fraction: number, startMs: number, endMs: number): string {
  const span = endMs - startMs;
  const ms = startMs + Math.min(1, Math.max(0, fraction)) * span;
  const rounded = Math.round(ms / 60_000) * 60_000;
  return toIsoUtc(Math.min(endMs, Math.max(startMs, rounded)));
}

export function shiftIso(
  iso: string,
  startUtc: string,
  endUtc: string,
  deltaHours: number,
): string | null {
  const bounds = windowBounds(startUtc, endUtc);
  const current = parseUtc(iso);
  if (!bounds || current == null || !Number.isFinite(deltaHours)) return null;
  const next = Math.min(
    bounds.endMs,
    Math.max(bounds.startMs, current + deltaHours * HOUR_MS),
  );
  return toIsoUtc(next);
}

export function clipInterval(
  interval: IntervalLike,
  startMs: number,
  endMs: number,
): { startMs: number; endMs: number } | null {
  const start = parseUtc(interval.startUtc);
  const end = parseUtc(interval.endUtc);
  if (start == null || end == null) return null;
  const clippedStart = Math.max(start, startMs);
  const clippedEnd = Math.min(end, endMs);
  if (!(clippedEnd > clippedStart)) return null;
  return { startMs: clippedStart, endMs: clippedEnd };
}

export function intervalHoursInWindow(
  interval: IntervalLike,
  startMs: number,
  endMs: number,
): number | null {
  const clipped = clipInterval(interval, startMs, endMs);
  if (!clipped) return null;
  return (clipped.endMs - clipped.startMs) / HOUR_MS;
}

export function interruptionLabel(hours: number, truncated: boolean): string {
  const duration = formatHours(hours);
  return truncated ? `${duration} (gap continues past this time window)` : duration;
}

export function intersectAccess(left: IntervalLike[], right: IntervalLike[]): IntervalLike[] {
  const overlaps: IntervalLike[] = [];
  for (const a of left) {
    if (a.kind !== "access") continue;
    for (const b of right) {
      if (b.kind !== "access") continue;
      const a0 = parseUtc(a.startUtc);
      const a1 = parseUtc(a.endUtc);
      const b0 = parseUtc(b.startUtc);
      const b1 = parseUtc(b.endUtc);
      if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
      const start = Math.max(a0, b0);
      const end = Math.min(a1, b1);
      if (end > start) {
        overlaps.push({
          startUtc: toIsoUtc(start),
          endUtc: toIsoUtc(end),
          kind: "access",
          truncated: false,
        });
      }
    }
  }
  overlaps.sort((a, b) => (parseUtc(a.startUtc) ?? 0) - (parseUtc(b.startUtc) ?? 0));
  return overlaps;
}

export function intervalAtTime(intervals: IntervalLike[], iso: string): IntervalLike | null {
  const time = parseUtc(iso);
  if (time == null) return null;
  for (const interval of intervals) {
    const start = parseUtc(interval.startUtc);
    const end = parseUtc(interval.endUtc);
    if (start == null || end == null) continue;
    if (time >= start && time < end) return interval;
  }
  const ending = [...intervals].reverse().find((interval) => {
    const end = parseUtc(interval.endUtc);
    return end != null && Math.abs(end - time) < 1;
  });
  return ending ?? null;
}

export function chooseTickStepMs(spanMs: number): number {
  const candidates = [
    HOUR_MS,
    2 * HOUR_MS,
    3 * HOUR_MS,
    6 * HOUR_MS,
    12 * HOUR_MS,
    DAY_MS,
    2 * DAY_MS,
    7 * DAY_MS,
    14 * DAY_MS,
    30 * DAY_MS,
  ];
  const target = spanMs / 6;
  let choice = candidates[0];
  for (const candidate of candidates) {
    if (candidate <= target) choice = candidate;
  }
  while (spanMs / choice > 8) {
    const next = candidates.find((candidate) => candidate > choice);
    if (!next) break;
    choice = next;
  }
  return choice;
}

export function timeTicks(startMs: number, endMs: number): TimeTick[] {
  const span = endMs - startMs;
  if (!(span > 0)) return [];
  const step = chooseTickStepMs(span);
  const ticks: TimeTick[] = [];
  let time = Math.ceil(startMs / step) * step;
  if (time < startMs) time += step;
  for (; time <= endMs + 1; time += step) {
    if (time < startMs || time > endMs) continue;
    ticks.push({
      fraction: (time - startMs) / span,
      label: formatTickLabel(time, step, span),
    });
    if (ticks.length > 12) break;
  }
  return ticks;
}

export interface TrackLayout {
  barY: number;
  barH: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  gutter: number;
  plotX: number;
  plotW: number;
  rows: TrackLayout[];
  axisY: number;
  font: number;
  explore: boolean;
}

export function timelineLayout(width: number, explore: boolean): TimelineLayout {
  const safeWidth = Math.max(width, 320);
  const gutter = explore ? 196 : 168;
  const labelH = explore ? 24 : 18;
  const barH = explore ? 34 : 28;
  const rowGap = explore ? 20 : 16;
  const top = explore ? 32 : 26;
  const plotX = gutter;
  const plotW = Math.max(48, safeWidth - gutter - 20);
  const block = labelH + barH;
  const rows = [0, 1, 2].map((index) => {
    const y = top + index * (block + rowGap);
    return { barY: y + labelH, barH };
  });
  const axisY = top + 3 * block + 2 * rowGap + 20;
  const height = axisY + (explore ? 30 : 24);
  return {
    width: safeWidth,
    height,
    gutter,
    plotX,
    plotW,
    rows,
    axisY,
    font: explore ? 16 : 13,
    explore,
  };
}
