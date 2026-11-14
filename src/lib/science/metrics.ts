/**
 * Visibility, interruption intervals, and the user-assumption screen.
 *
 * A sample is visible only when the body centre is strictly above the terrain
 * horizon (clearance > 0). Equality is not access. A null horizon or a null
 * ephemeris angle is unknown, not hidden and not visible.
 *
 * Hours between samples are assigned by linear clearance. A crossing can fall
 * inside an hour. Sub-hour peaks between samples are not resolved.
 *
 * An interval that includes the start or end of the analysis window is
 * truncated. Its duration is only the in-window part. If that in-window part
 * already exceeds the user limit, the limit is exceeded. If a truncated
 * interruption is still shorter than the limit, the full real-world duration
 * is unknown and the check is "Insufficient data".
 */

import type {
  BodyVisibility,
  EphemerisSeries,
  LimitCheck,
  TerrainHorizon,
  TimeInterval,
  VerdictStatus,
  VisibilitySample,
} from "./types";
import { horizonElevationAt } from "./horizon";
import { parseUtcMs, toUtcIso } from "./ephemeris";

interface Span {
  startMs: number;
  endMs: number;
  visible: boolean;
  /** Closed by the window edge or by an unknown sample, not by a measured crossing. */
  openEnded: boolean;
}

function hoursBetween(startMs: number, endMs: number): number {
  return (endMs - startMs) / 3_600_000;
}

function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}

export function compareSeries(ephemeris: EphemerisSeries, horizon: TerrainHorizon): BodyVisibility {
  const samples: VisibilitySample[] = ephemeris.samples.map((sample) => {
    const horizonElevationDeg = horizonElevationAt(horizon, sample.azimuthDeg);
    if (horizonElevationDeg === null || !Number.isFinite(sample.elevationDeg)) {
      return {
        timeUtc: sample.timeUtc,
        azimuthDeg: sample.azimuthDeg,
        elevationDeg: Number.isFinite(sample.elevationDeg) ? sample.elevationDeg : null,
        horizonElevationDeg,
        clearanceDeg: null,
        visible: null,
      };
    }
    const clearanceDeg = sample.elevationDeg - horizonElevationDeg;
    return {
      timeUtc: sample.timeUtc,
      azimuthDeg: sample.azimuthDeg,
      elevationDeg: sample.elevationDeg,
      horizonElevationDeg,
      clearanceDeg,
      visible: clearanceDeg > 0,
    };
  });
  const spans = spansFromSamples(samples);
  const intervals = intervalsFromSpans(samples, spans);
  const anyUnknown = samples.some((sample) => sample.visible === null);
  const windowHours =
    samples.length >= 2
      ? hoursBetween(parseUtcMs(samples[0].timeUtc), parseUtcMs(samples[samples.length - 1].timeUtc))
      : 0;
  const accessDurationHours = anyUnknown
    ? null
    : spans.filter((span) => span.visible).reduce((sum, span) => sum + hoursBetween(span.startMs, span.endMs), 0);
  const accessPercent =
    accessDurationHours === null || windowHours === 0 ? null : (accessDurationHours / windowHours) * 100;

  const interruptions = intervals.filter((interval) => interval.kind === "interruption");
  let longestInterruptionHours: number | null = anyUnknown ? null : 0;
  let longestInterruptionTruncated = false;
  if (!anyUnknown && interruptions.length > 0) {
    let longest = interruptions[0];
    let longestHours = hoursBetween(parseUtcMs(longest.startUtc), parseUtcMs(longest.endUtc));
    for (const interval of interruptions.slice(1)) {
      const hours = hoursBetween(parseUtcMs(interval.startUtc), parseUtcMs(interval.endUtc));
      if (hours > longestHours) {
        longest = interval;
        longestHours = hours;
      }
    }
    longestInterruptionHours = longestHours;
    longestInterruptionTruncated = longest.truncated;
  }

  let nextTransitionUtc: string | null = null;
  let nextTransition: BodyVisibility["nextTransition"] = null;
  if (spans.length >= 2) {
    nextTransitionUtc = toUtcIso(spans[1].startMs);
    nextTransition = spans[1].visible ? "becomes_visible" : "becomes_hidden";
  }

  return {
    target: ephemeris.target,
    equipmentHeightM: horizon.heightAboveGroundM,
    samples,
    accessDurationHours,
    accessPercent,
    longestInterruptionHours,
    longestInterruptionTruncated,
    intervals,
    nextTransitionUtc,
    nextTransition,
  };
}

function spansFromSamples(samples: readonly VisibilitySample[]): Span[] {
  const spans: Span[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const left = samples[index];
    const right = samples[index + 1];
    const startMs = parseUtcMs(left.timeUtc);
    const endMs = parseUtcMs(right.timeUtc);
    if (left.visible === null || right.visible === null) {
      const previous = spans[spans.length - 1];
      if (previous && left.visible !== null && previous.endMs === startMs) {
        previous.openEnded = true;
      }
      continue;
    }
    if (left.visible === right.visible) {
      spans.push({ startMs, endMs, visible: left.visible, openEnded: false });
      continue;
    }
    const clearanceLeft = left.clearanceDeg;
    const clearanceRight = right.clearanceDeg;
    let fraction = 0.5;
    if (
      clearanceLeft !== null &&
      clearanceRight !== null &&
      clearanceLeft !== clearanceRight
    ) {
      fraction = clamp01(clearanceLeft / (clearanceLeft - clearanceRight));
    }
    const crossMs = startMs + fraction * (endMs - startMs);
    if (crossMs > startMs) {
      spans.push({ startMs, endMs: crossMs, visible: left.visible, openEnded: false });
    }
    if (endMs > crossMs) {
      spans.push({ startMs: crossMs, endMs, visible: right.visible, openEnded: false });
    }
  }
  return mergeSpans(spans);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mergeSpans(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && previous.visible === span.visible && previous.endMs === span.startMs) {
      previous.endMs = span.endMs;
      previous.openEnded = previous.openEnded || span.openEnded;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function intervalsFromSpans(samples: readonly VisibilitySample[], spans: readonly Span[]): TimeInterval[] {
  if (samples.length === 0) return [];
  const windowStart = parseUtcMs(samples[0].timeUtc);
  const windowEnd = parseUtcMs(samples[samples.length - 1].timeUtc);
  return spans
    .filter((span) => span.endMs > span.startMs)
    .map((span) => {
      const touchesWindow = span.startMs === windowStart || span.endMs === windowEnd;
      return {
        startUtc: toUtcIso(span.startMs),
        endUtc: toUtcIso(span.endMs),
        kind: span.visible ? "access" : "interruption",
        truncated: touchesWindow || span.openEnded,
      } satisfies TimeInterval;
    });
}

export function windowHours(visibility: BodyVisibility): number | null {
  if (visibility.samples.length < 2) return 0;
  return hoursBetween(
    parseUtcMs(visibility.samples[0].timeUtc),
    parseUtcMs(visibility.samples[visibility.samples.length - 1].timeUtc),
  );
}

/**
 * Hours when both bodies are classified visible. Null if either series has an
 * unknown sample. Percent is of the analysis window, not of solar access.
 */
export function overlapOf(sun: BodyVisibility, earth: BodyVisibility): {
  hours: number | null;
  percent: number | null;
} {
  if (sun.samples.some((sample) => sample.visible === null) || earth.samples.some((sample) => sample.visible === null)) {
    return { hours: null, percent: null };
  }
  const sunAccess = sun.intervals.filter((interval) => interval.kind === "access");
  const earthAccess = earth.intervals.filter((interval) => interval.kind === "access");
  let hours = 0;
  for (const left of sunAccess) {
    const a0 = parseUtcMs(left.startUtc);
    const a1 = parseUtcMs(left.endUtc);
    for (const right of earthAccess) {
      const b0 = parseUtcMs(right.startUtc);
      const b1 = parseUtcMs(right.endUtc);
      const start = Math.max(a0, b0);
      const end = Math.min(a1, b1);
      if (end > start) hours += hoursBetween(start, end);
    }
  }
  const sunWindow = windowHours(sun) ?? 0;
  const earthWindow = windowHours(earth) ?? 0;
  const span = Math.min(sunWindow, earthWindow);
  return {
    hours,
    percent: span > 0 ? (hours / span) * 100 : null,
  };
}

function targetLabel(id: LimitCheck["id"]): string {
  return id === "solar_interruption" ? "solar-access" : "Earth-visibility";
}

function longestInterval(visibility: BodyVisibility): TimeInterval | null {
  const interruptions = visibility.intervals.filter((interval) => interval.kind === "interruption");
  if (interruptions.length === 0 || visibility.longestInterruptionHours === null) return null;
  let best = interruptions[0];
  let bestHours = hoursBetween(parseUtcMs(best.startUtc), parseUtcMs(best.endUtc));
  for (const interval of interruptions) {
    const hours = hoursBetween(parseUtcMs(interval.startUtc), parseUtcMs(interval.endUtc));
    if (hours > bestHours) {
      best = interval;
      bestHours = hours;
    }
  }
  return best;
}

export function limitCheck(
  id: LimitCheck["id"],
  visibility: BodyVisibility,
  limitHours: number,
): LimitCheck {
  const label = targetLabel(id);
  const observed = visibility.longestInterruptionHours;
  if (observed === null) {
    return {
      id,
      limitHours,
      observedHours: null,
      exceededByHours: null,
      status: "insufficient_data",
      detail: `${label} interruption cannot be evaluated because one or more samples are unclassified.`,
    };
  }
  const interval = longestInterval(visibility);
  const when = interval
    ? ` from ${interval.startUtc} to ${interval.endUtc}`
    : "";
  const truncated = visibility.longestInterruptionTruncated;
  if (observed > limitHours) {
    const exceededByHours = observed - limitHours;
    const edge = truncated
      ? " The in-window portion already exceeds the limit; the full real-world duration is not claimed and may be longer."
      : "";
    return {
      id,
      limitHours,
      observedHours: observed,
      exceededByHours,
      status: "exceeds_limits",
      detail: `Longest ${label} interruption is ${formatHours(observed)} hours${when}, which exceeds the user assumption of ${formatHours(limitHours)} hours by ${formatHours(exceededByHours)} hours.${edge}`,
    };
  }
  if (truncated && observed > 0) {
    return {
      id,
      limitHours,
      observedHours: observed,
      exceededByHours: null,
      status: "insufficient_data",
      detail: `Longest in-window ${label} interruption is ${formatHours(observed)} hours${when} and touches the window edge, so the full real-world duration is not known and is not claimed. It cannot be shown to sit inside the user assumption of ${formatHours(limitHours)} hours.`,
    };
  }
  return {
    id,
    limitHours,
    observedHours: observed,
    exceededByHours: 0,
    status: "within_limits",
    detail: `Longest ${label} interruption is ${formatHours(observed)} hours${when}, inside the user assumption of ${formatHours(limitHours)} hours.`,
  };
}

export function screenLimits(checks: readonly LimitCheck[]): {
  status: VerdictStatus;
  statement: string;
} {
  const exceeded = checks.filter((check) => check.status === "exceeds_limits");
  const insufficient = checks.filter((check) => check.status === "insufficient_data");
  if (exceeded.length > 0) {
    const detail = exceeded.map((check) => check.detail).join(" ");
    return {
      status: "exceeds_limits",
      statement: `Exceeds selected limits. ${detail}`,
    };
  }
  if (insufficient.length > 0) {
    const detail = insufficient.map((check) => check.detail).join(" ");
    return {
      status: "insufficient_data",
      statement: `Insufficient data. ${detail}`,
    };
  }
  const detail = checks.map((check) => check.detail).join(" ");
  return {
    status: "within_limits",
    statement: `Within selected limits. ${detail}`,
  };
}
