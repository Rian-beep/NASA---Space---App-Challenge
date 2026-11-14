import { describe, expect, it } from "vitest";
import { compareSeries, limitCheck, overlapOf, screenLimits } from "@/lib/science/metrics";
import type { EphemerisSample, EphemerisSeries, TerrainHorizon } from "@/lib/science/types";

function series(elevations: number[], azimuths?: number[]): EphemerisSeries {
  const samples: EphemerisSample[] = elevations.map((elevationDeg, index) => ({
    timeUtc: `2026-12-01T${String(index).padStart(2, "0")}:00:00Z`,
    azimuthDeg: azimuths?.[index] ?? 10,
    elevationDeg,
  }));
  return {
    target: "sun",
    siteId: "metrics",
    samples,
    request: {},
    retrievedAtUtc: "2026-11-14T00:00:00Z",
    source: "horizons_cache",
    apiVersion: "1.2",
  };
}

function flatHorizon(height: number): TerrainHorizon {
  return {
    siteId: "metrics",
    heightAboveGroundM: height,
    azimuthStepDeg: 2,
    samples: Array.from({ length: 180 }, (_, index) => ({
      azimuthDeg: index * 2,
      elevationDeg: 0,
      distanceM: 1000,
      coverage: "terrain" as const,
    })),
    coverage: "complete",
    datasetId: "synthetic",
    analysisResolutionM: 80,
  };
}

describe("visibility intervals", () => {
  it("places an interruption edge inside a sample gap", () => {
    const visibility = compareSeries(series([10, -10]), flatHorizon(2));
    const interruption = visibility.intervals.find((interval) => interval.kind === "interruption");
    const access = visibility.intervals.find((interval) => interval.kind === "access");
    expect(access?.endUtc).toBe("2026-12-01T00:30:00Z");
    expect(interruption?.startUtc).toBe("2026-12-01T00:30:00Z");
    expect(visibility.accessDurationHours).toBeCloseTo(0.5, 8);
    expect(visibility.longestInterruptionHours).toBeCloseTo(0.5, 8);
  });

  it("reports always visible as no interruption", () => {
    const visibility = compareSeries(series([5, 5, 5, 5, 5]), flatHorizon(2));
    expect(visibility.accessDurationHours).toBeCloseTo(4, 8);
    expect(visibility.longestInterruptionHours).toBe(0);
    expect(visibility.longestInterruptionTruncated).toBe(false);
    expect(visibility.intervals.filter((interval) => interval.kind === "interruption")).toHaveLength(0);
    expect(visibility.nextTransition).toBeNull();
    expect(visibility.intervals[0].truncated).toBe(true);
  });

  it("reports always hidden as one truncated interruption", () => {
    const visibility = compareSeries(series([-5, -5, -5, -5]), flatHorizon(2));
    expect(visibility.accessDurationHours).toBe(0);
    expect(visibility.longestInterruptionHours).toBeCloseTo(3, 8);
    expect(visibility.longestInterruptionTruncated).toBe(true);
    expect(visibility.intervals).toHaveLength(1);
    expect(visibility.intervals[0]).toMatchObject({ kind: "interruption", truncated: true });
    expect(visibility.nextTransition).toBeNull();
  });

  it("keeps an edge-touching interruption truncated and brackets interior gaps", () => {
    const visibility = compareSeries(series([-8, -8, 8, 8, 8]), flatHorizon(2));
    const hidden = visibility.intervals.find((interval) => interval.kind === "interruption");
    expect(hidden?.truncated).toBe(true);
    expect(hidden?.startUtc).toBe("2026-12-01T00:00:00Z");
    expect(visibility.longestInterruptionTruncated).toBe(true);
    expect(visibility.nextTransition).toBe("becomes_visible");

    const twoGaps = compareSeries(series([8, 8, -8, -8, 8, 8, -8, -8, 8]), flatHorizon(2));
    const gaps = twoGaps.intervals.filter((interval) => interval.kind === "interruption");
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.truncated === false)).toBe(true);
    expect(twoGaps.longestInterruptionTruncated).toBe(false);
  });

  it("returns null durations when a sample cannot be classified", () => {
    const horizon = flatHorizon(2);
    horizon.samples = horizon.samples.map((sample) =>
      sample.azimuthDeg === 10 ? { ...sample, elevationDeg: null, coverage: "missing" } : sample,
    );
    const visibility = compareSeries(series([5, 5, -5], [10, 40, 40]), horizon);
    expect(visibility.samples[0].visible).toBeNull();
    expect(visibility.accessDurationHours).toBeNull();
    expect(visibility.longestInterruptionHours).toBeNull();
    const screen = screenLimits([
      limitCheck("solar_interruption", visibility, 48),
      limitCheck("earth_interruption", { ...visibility, target: "earth" }, 24),
    ]);
    expect(screen.status).toBe("insufficient_data");
    expect(screen.statement.startsWith("Insufficient data")).toBe(true);
  });

  it("uses the required screening phrases", () => {
    const visible = compareSeries(series([4, 4, 4]), flatHorizon(2));
    const within = screenLimits([
      limitCheck("solar_interruption", visible, 48),
      limitCheck("earth_interruption", { ...visible, target: "earth" }, 24),
    ]);
    expect(within.status).toBe("within_limits");
    expect(within.statement.startsWith("Within selected limits")).toBe(true);

    const hidden = compareSeries(series([-4, -4, -4, -4, -4]), flatHorizon(2));
    const exceeded = screenLimits([
      limitCheck("solar_interruption", hidden, 2),
      limitCheck("earth_interruption", { ...visible, target: "earth" }, 24),
    ]);
    expect(exceeded.status).toBe("exceeds_limits");
    expect(exceeded.statement.startsWith("Exceeds selected limits")).toBe(true);
    expect(exceeded.statement).toContain("exceeds the user assumption");

    const edge = compareSeries(series([-4, 4, 4, 4, 4]), flatHorizon(2));
    const unknownEdge = limitCheck("solar_interruption", edge, 48);
    expect(edge.longestInterruptionTruncated).toBe(true);
    expect(unknownEdge.status).toBe("insufficient_data");
    expect(unknownEdge.detail).toContain("not claimed");
  });

  it("overlaps sun access with earth visibility", () => {
    const sun = compareSeries(series([5, 5, 5, -5, -5]), flatHorizon(2));
    const earthSeries = series([ -5, 5, 5, 5, -5 ]);
    earthSeries.target = "earth";
    const earth = compareSeries(earthSeries, flatHorizon(3));
    const overlap = overlapOf(sun, earth);
    // Sun access 0–2.5 h, Earth access 0.5–3.5 h, overlap 2 h of a 4 h window.
    expect(overlap.hours).toBeCloseTo(2, 6);
    expect(overlap.percent).toBeCloseTo(50, 6);
  });
});
