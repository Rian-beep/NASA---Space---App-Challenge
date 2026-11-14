import { describe, expect, it } from "vitest";
import { findAlternatives } from "@/lib/science/alternatives";
import { HORIZON_SEARCH_RADIUS_M, BODY_RADIUS_M } from "@/lib/science/constants";
import { stereographicMetres } from "@/lib/science/horizon";
import type {
  AnalysisDataset,
  CelestialTarget,
  EphemerisSeries,
  LunarSite,
  ScenarioInput,
} from "@/lib/science/types";

const base: LunarSite = {
  id: "base",
  name: "Baseline ridge",
  kind: "example_analysis",
  eastLongitudeDeg: 0,
  latitudeDeg: -89.9,
  surfaceHeightM: 0,
  summary: "Synthetic baseline. Not an officially designated landing site.",
};

const near: LunarSite = {
  id: "near",
  name: "Nearby ridge",
  kind: "example_analysis",
  eastLongitudeDeg: 0.2,
  latitudeDeg: -89.9,
  surfaceHeightM: 0,
  summary: "Synthetic neighbour. Not an officially designated landing site.",
};

function dataset(): AnalysisDataset {
  const centre = stereographicMetres(0.1, -89.9);
  const pixel = 400;
  const radius = HORIZON_SEARCH_RADIUS_M + 1_000;
  const count = Math.ceil((radius * 2) / pixel) + 3;
  return {
    datasetId: "synthetic-alternatives",
    productUrl: "https://pgda.gsfc.nasa.gov/products/90",
    citation: "Synthetic.",
    coordinateReference: "MOON_ME",
    bodyRadiusM: BODY_RADIUS_M,
    sourcePixelSpacingM: pixel,
    analysisResolutionM: pixel,
    rows: count,
    cols: count,
    originX: centre.x - ((count - 1) / 2) * pixel,
    originY: centre.y + ((count - 1) / 2) * pixel,
    pixelSizeM: pixel,
    heights: Array(count * count).fill(0),
    retrievedAtUtc: "2026-11-14T00:00:00Z",
  };
}

function hours(pattern: "short" | "long" | "exceed", target: CelestialTarget): EphemerisSeries {
  const elevations =
    pattern === "short"
      ? [10, 10, -10, 10, 10]
      : pattern === "long"
        ? [10, 10, -10, -10, 10]
        : [-10, -10, -10, -10, -10];
  return {
    target,
    siteId: "pending",
    samples: elevations.map((elevationDeg, index) => ({
      timeUtc: `2026-12-0${1 + Math.floor(index / 24)}T${String(index).padStart(2, "0")}:00:00Z`.replace(
        "2026-12-01T",
        "2026-12-01T",
      ),
      azimuthDeg: 20,
      elevationDeg,
    })).map((sample, index) => ({
      ...sample,
      timeUtc: new Date(Date.UTC(2026, 11, 1, index)).toISOString().replace(".000Z", "Z"),
    })),
    request: { COMMAND: target === "sun" ? "10" : "399" },
    retrievedAtUtc: "2026-11-14T00:00:00Z",
    source: "horizons_cache",
    apiVersion: "1.2",
  };
}

function patternFor(siteId: string, startUtc: string): "short" | "long" | "exceed" {
  if (siteId === "base" && startUtc === "2026-12-03T00:00:00Z") return "short";
  if (siteId === "base" && startUtc === "2026-12-04T00:00:00Z") return "short";
  if (siteId === "base" && startUtc === "2026-12-05T00:00:00Z") return "exceed";
  return "long";
}

function lookup(site: LunarSite, target: CelestialTarget, startUtc: string): EphemerisSeries {
  const series = hours(patternFor(site.id, startUtc), target);
  return {
    ...series,
    siteId: site.id,
    samples: series.samples.map((sample, index) => ({
      ...sample,
      timeUtc: new Date(Date.parse(startUtc) + index * 3_600_000).toISOString().replace(".000Z", "Z"),
    })),
  };
}

const baseline: ScenarioInput = {
  id: "baseline",
  name: "Baseline",
  siteId: "base",
  arrivalUtc: "2026-12-03T00:00:00Z",
  durationHours: 4,
  solarPanelHeightM: 2,
  antennaHeightM: 3,
  maxSolarInterruptionHours: 2,
  maxEarthInterruptionHours: 2,
  isBaseline: true,
};

describe("alternative ranking", () => {
  it("orders by limits, then interruption, overlap, and plan change", () => {
    const search = findAlternatives(baseline, [base, near], lookup, dataset());
    expect(search.limitedSearch).toBe(true);
    expect(search.dateOffsetsHours).toEqual([-48, -24, 0, 24, 48, 168]);
    expect(search.candidateCount).toBe(12);
    expect(search.results.map((result) => result.id).slice(0, 2)).toEqual(["base|0", "base|24"]);
    expect(search.results[0].meetsAllLimits).toBe(true);
    expect(search.results[0].rankReason).toMatch(/meets all evaluated interruption limits/i);
    expect(search.results[0].rankReason).toMatch(/worst interruption/i);
    expect(search.results[0].rankReason).toMatch(/overlap/i);
    expect(search.results[0].rankReason).toMatch(/plan change/i);
    expect(search.results[0].shortfall).toBeNull();
    const missed = search.results.find((result) => result.id === "base|48");
    expect(missed?.meetsAllLimits).toBe(false);
    expect(missed?.shortfall).toMatch(/exceeds the user assumption/);
    expect(search.anyMeetsLimits).toBe(true);
    const meeting = search.results.filter((result) => result.meetsAllLimits);
    const later = search.results.filter((result) => !result.meetsAllLimits);
    expect(meeting.at(-1)!.rank).toBeLessThan(later[0].rank);
    for (let index = 1; index < meeting.length; index += 1) {
      const previous = meeting[index - 1].score;
      const current = meeting[index].score;
      const worstPrev = previous.worstInterruptionHours ?? Infinity;
      const worstCurr = current.worstInterruptionHours ?? Infinity;
      expect(worstCurr).toBeGreaterThanOrEqual(worstPrev - 1e-9);
    }
  });

  it("says when nothing in the bounded set meets the limits", () => {
    const strict: ScenarioInput = {
      ...baseline,
      maxSolarInterruptionHours: 0.25,
      maxEarthInterruptionHours: 0.25,
    };
    const search = findAlternatives(strict, [base, near], lookup, dataset());
    expect(search.anyMeetsLimits).toBe(false);
    expect(search.limitedSearch).toBe(true);
    expect(search.boundsDescription).toMatch(/No searched option meets all evaluated limits/);
    expect(search.boundsDescription).toMatch(/not a global optimum/);
    expect(search.results.every((result) => result.shortfall)).toBe(true);
    expect(search.results[0].id).toBe("base|0");
    expect(search.results[0].score.worstInterruptionHours ?? 99).toBeLessThan(
      search.results.at(-1)?.score.worstInterruptionHours ?? 0,
    );
  });
});
