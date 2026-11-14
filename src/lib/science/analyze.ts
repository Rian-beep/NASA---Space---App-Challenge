/**
 * One scenario: solar horizon at the panel height, Earth horizon at the
 * antenna height, then the interruption screen. Selected time defaults to arrival.
 */

import type {
  AnalysisDataset,
  BaselineDelta,
  BodyVisibility,
  CelestialTarget,
  EphemerisSeries,
  LunarSite,
  Provenance,
  ScenarioInput,
  ScenarioResult,
  ScenarioSnapshot,
} from "./types";
import { SOFTWARE_VERSION } from "./types";
import {
  HORIZON_AZIMUTH_STEP_DEG,
  HORIZONS_DOC_URL,
  MODEL_LIMITATIONS,
  TIME_SAMPLE_HOURS,
  VISIBILITY_MODEL,
} from "./constants";
import { LunarDataError, addHours, interpolateAzimuth } from "./ephemeris";
import { buildHorizon, horizonElevationAt } from "./horizon";
import { compareSeries, limitCheck, overlapOf, screenLimits } from "./metrics";

export interface AnalysisContext {
  sites: readonly LunarSite[];
  getEphemeris: (
    site: LunarSite,
    target: CelestialTarget,
    startUtc: string,
    stopUtc: string,
  ) => EphemerisSeries;
  terrain: AnalysisDataset;
}

export function resolveSite(input: ScenarioInput, sites: readonly LunarSite[]): LunarSite {
  const found = sites.find((site) => site.id === input.siteId);
  if (found) return found;
  if (input.customSite) {
    return {
      id: input.siteId,
      name: input.customSite.name,
      kind: "custom",
      eastLongitudeDeg: input.customSite.eastLongitudeDeg,
      latitudeDeg: input.customSite.latitudeDeg,
      surfaceHeightM: input.customSite.surfaceHeightM,
      summary: "Custom analysis location. It is not an officially designated landing site.",
    };
  }
  throw new LunarDataError(`No catalogue site with id "${input.siteId}".`);
}

function snapshotAt(
  sun: EphemerisSeries,
  earth: EphemerisSeries,
  sunHorizon: ReturnType<typeof buildHorizon>,
  earthHorizon: ReturnType<typeof buildHorizon>,
  timeUtc: string,
): ScenarioSnapshot {
  const sunState = interpolateAzimuth(sun.samples, timeUtc);
  const earthState = interpolateAzimuth(earth.samples, timeUtc);
  const sunHorizonDeg = horizonElevationAt(sunHorizon, sunState.azimuthDeg);
  const earthHorizonDeg = horizonElevationAt(earthHorizon, earthState.azimuthDeg);
  const sunClearance =
    sunHorizonDeg === null ? null : sunState.elevationDeg - sunHorizonDeg;
  const earthClearance =
    earthHorizonDeg === null ? null : earthState.elevationDeg - earthHorizonDeg;
  return {
    sunAzimuthDeg: sunState.azimuthDeg,
    sunElevationDeg: sunState.elevationDeg,
    sunHorizonDeg,
    sunClearanceDeg: sunClearance,
    sunVisible: sunClearance === null ? null : sunClearance > 0,
    earthAzimuthDeg: earthState.azimuthDeg,
    earthElevationDeg: earthState.elevationDeg,
    earthHorizonDeg,
    earthClearanceDeg: earthClearance,
    earthVisible: earthClearance === null ? null : earthClearance > 0,
  };
}

function provenanceFor(
  input: ScenarioInput,
  terrain: AnalysisDataset,
  sun: EphemerisSeries,
  earth: EphemerisSeries,
  startUtc: string,
  endUtc: string,
): Provenance {
  const presentation =
    sun.source === "demo_cache" && earth.source === "demo_cache"
      ? "precomputed from NASA data"
      : "cached Horizons response";
  const retrieved = [sun.retrievedAtUtc, earth.retrievedAtUtc, terrain.retrievedAtUtc].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  return {
    presentation,
    horizonsDocUrl: HORIZONS_DOC_URL,
    terrainProductUrl: terrain.productUrl,
    terrainProductId: terrain.datasetId,
    citation: terrain.citation,
    retrievedAtUtc: retrieved,
    analysisIntervalUtc: { start: startUtc, end: endUtc },
    coordinateReference: terrain.coordinateReference,
    longitudeConvention:
      "East longitude is positive. Geodetic latitude is negative in the south. Coordinates are MOON_ME / DE421.",
    sourcePixelSpacingM: terrain.sourcePixelSpacingM,
    analysisResolutionM: terrain.analysisResolutionM,
    equipment: {
      solarPanelHeightM: input.solarPanelHeightM,
      antennaHeightM: input.antennaHeightM,
    },
    timeSampleHours: TIME_SAMPLE_HOURS,
    horizonAzimuthStepDeg: HORIZON_AZIMUTH_STEP_DEG,
    softwareVersion: SOFTWARE_VERSION,
    visibilityModel: VISIBILITY_MODEL,
    eclipseModel: "Eclipses are NOT modelled.",
    limitations: [...MODEL_LIMITATIONS],
  };
}

export function analyzeScenario(input: ScenarioInput, ctx: AnalysisContext): ScenarioResult {
  const site = resolveSite(input, ctx.sites);
  const startUtc = input.arrivalUtc;
  const endUtc = addHours(input.arrivalUtc, input.durationHours);
  const sunSeries = ctx.getEphemeris(site, "sun", startUtc, endUtc);
  const earthSeries = ctx.getEphemeris(site, "earth", startUtc, endUtc);
  const sunHorizon = buildHorizon(ctx.terrain, site, input.solarPanelHeightM);
  const earthHorizon = buildHorizon(ctx.terrain, site, input.antennaHeightM);
  const sun = compareSeries(sunSeries, sunHorizon);
  const earth = compareSeries(earthSeries, earthHorizon);
  const overlap = overlapOf(sun, earth);
  const limitChecks = [
    limitCheck("solar_interruption", sun, input.maxSolarInterruptionHours),
    limitCheck("earth_interruption", earth, input.maxEarthInterruptionHours),
  ];
  const screen = screenLimits(limitChecks);
  const selectedTimeUtc = input.arrivalUtc;
  return {
    scenarioId: input.id,
    status: screen.status,
    statement: screen.statement,
    sun,
    earth,
    overlapHours: overlap.hours,
    overlapPercent: overlap.percent,
    selectedTimeUtc,
    atTime: snapshotAt(sunSeries, earthSeries, sunHorizon, earthHorizon, selectedTimeUtc),
    limitChecks,
    provenance: provenanceFor(input, ctx.terrain, sunSeries, earthSeries, startUtc, endUtc),
  };
}

function deltaHours(next: number | null, baseline: number | null): number | null {
  if (next === null || baseline === null) return null;
  return next - baseline;
}

function hoursText(value: number | null): string {
  if (value === null) return "unknown";
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)} h`;
}

export function deltaFromBaseline(result: ScenarioResult, baseline: ScenarioResult): BaselineDelta {
  const solarInterruptionDeltaHours = deltaHours(
    result.sun.longestInterruptionHours,
    baseline.sun.longestInterruptionHours,
  );
  const earthInterruptionDeltaHours = deltaHours(
    result.earth.longestInterruptionHours,
    baseline.earth.longestInterruptionHours,
  );
  const overlapDeltaHours = deltaHours(result.overlapHours, baseline.overlapHours);
  const statusChanged = result.status !== baseline.status;
  const summary = [
    `Solar interruption ${hoursText(solarInterruptionDeltaHours)}`,
    `Earth interruption ${hoursText(earthInterruptionDeltaHours)}`,
    `Sun–Earth overlap ${hoursText(overlapDeltaHours)}`,
    statusChanged
      ? `screening status changed from ${baseline.status} to ${result.status}`
      : `screening status stays ${result.status}`,
  ].join("; ") + ".";
  return {
    solarInterruptionDeltaHours,
    earthInterruptionDeltaHours,
    overlapDeltaHours,
    statusChanged,
    summary,
  };
}

export function attachBaselineDelta(result: ScenarioResult, baseline: ScenarioResult): ScenarioResult {
  return { ...result, deltaFromBaseline: deltaFromBaseline(result, baseline) };
}

/** Re-export so callers can name the visibility series without importing metrics. */
export type { BodyVisibility };
