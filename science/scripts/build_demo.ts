/**
 * Build the offline demo bundle from the saved Horizons responses and the
 * LOLA analysis grid. Samples are sliced from those responses; none are invented.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TIME_SAMPLE_HOURS } from "../../src/lib/science/constants";
import {
  addHours,
  cacheKey,
  parseHorizonsJson,
  sliceSeries,
  toUtcIso,
} from "../../src/lib/science/ephemeris";
import { buildHorizon } from "../../src/lib/science/horizon";
import { compareSeries, overlapOf, screenLimits, limitCheck } from "../../src/lib/science/metrics";
import { findAlternatives } from "../../src/lib/science/alternatives";
import { analyzeScenario, deltaFromBaseline } from "../../src/lib/science/analyze";
import type {
  AnalysisDataset,
  CelestialTarget,
  EphemerisSeries,
  LunarSite,
  ScenarioInput,
  ScenarioResult,
  VerdictStatus,
} from "../../src/lib/science/types";

const root = join(import.meta.dirname, "..", "..");
const fixtureDir = join(root, "src/lib/science/fixtures");
const rawDir = join(root, "data/raw/horizons");

interface SiteFile extends LunarSite {
  stereographicX: number;
  stereographicY: number;
}

interface SweepRow {
  siteId: string;
  arrivalUtc: string;
  status: VerdictStatus;
  sunAccessHours: number | null;
  earthAccessHours: number | null;
  overlapHours: number | null;
  sunInterruptionHours: number | null;
  earthInterruptionHours: number | null;
  sunTruncated: boolean;
  earthTruncated: boolean;
  statement: string;
}

function loadSeries(siteId: string, target: CelestialTarget): EphemerisSeries {
  const raw = JSON.parse(readFileSync(join(rawDir, `${siteId}_${target}.json`), "utf8")) as unknown;
  const meta = JSON.parse(readFileSync(join(rawDir, `${siteId}_${target}.meta.json`), "utf8")) as {
    retrievedAtUtc: string;
    request: Record<string, string>;
  };
  return parseHorizonsJson(raw, {
    target,
    siteId,
    request: meta.request,
    retrievedAtUtc: meta.retrievedAtUtc,
    source: "horizons_cache",
  });
}

function hoursText(value: number | null): string {
  if (value === null) return "unknown";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function catalogueSite(site: SiteFile): LunarSite {
  return {
    id: site.id,
    name: site.name,
    kind: site.kind,
    eastLongitudeDeg: site.eastLongitudeDeg,
    latitudeDeg: site.latitudeDeg,
    surfaceHeightM: site.surfaceHeightM,
    summary: site.summary,
  };
}

function main(): void {
  const terrain = JSON.parse(readFileSync(join(fixtureDir, "terrain.json"), "utf8")) as AnalysisDataset;
  const siteFiles = JSON.parse(readFileSync(join(fixtureDir, "sites.json"), "utf8")) as SiteFile[];
  const sites = siteFiles.map(catalogueSite);
  const full = new Map<string, EphemerisSeries>();
  mkdirSync(join(fixtureDir, "horizons"), { recursive: true });
  for (const site of sites) {
    for (const target of ["sun", "earth"] as const) {
      const series = loadSeries(site.id, target);
      full.set(`${site.id}|${target}`, series);
      writeFileSync(
        join(fixtureDir, "horizons", `${site.id}_${target}.json`),
        JSON.stringify(series),
      );
      console.log(
        `${site.id} ${target}: ${series.samples.length} samples, ${series.samples[0].timeUtc} → ${series.samples.at(-1)?.timeUtc}, api ${series.apiVersion}`,
      );
    }
  }

  const horizons = new Map<string, { sun: ReturnType<typeof buildHorizon>; earth: ReturnType<typeof buildHorizon> }>();
  for (const site of sites) {
    const started = Date.now();
    const sun = buildHorizon(terrain, site, 2);
    const earth = buildHorizon(terrain, site, 3);
    horizons.set(site.id, { sun, earth });
    const missing = sun.samples.filter((sample) => sample.coverage !== "terrain").length;
    console.log(
      `${site.id} horizon ${Date.now() - started} ms coverage ${sun.coverage}/${earth.coverage} non-terrain sun rays ${missing} elev ${Math.min(
        ...sun.samples.map((sample) => sample.elevationDeg ?? 999),
      ).toFixed(2)} to ${Math.max(...sun.samples.map((sample) => sample.elevationDeg ?? -999)).toFixed(2)}`,
    );
  }

  const rows: SweepRow[] = [];
  for (const site of sites) {
    const sunFull = full.get(`${site.id}|sun`)!;
    const earthFull = full.get(`${site.id}|earth`)!;
    const mask = horizons.get(site.id)!;
    for (let index = 0; index + 168 < sunFull.samples.length; index += 6) {
      const start = sunFull.samples[index].timeUtc;
      const stop = addHours(start, 168);
      const sun = sliceSeries(sunFull, start, stop);
      const earth = sliceSeries(earthFull, start, stop);
      sun.target = "sun";
      earth.target = "earth";
      const sunVisibility = compareSeries(sun, mask.sun);
      const earthVisibility = compareSeries(earth, mask.earth);
      const overlap = overlapOf(sunVisibility, earthVisibility);
      const checks = [
        limitCheck("solar_interruption", sunVisibility, 48),
        limitCheck("earth_interruption", earthVisibility, 24),
      ];
      const screen = screenLimits(checks);
      rows.push({
        siteId: site.id,
        arrivalUtc: start,
        status: screen.status,
        sunAccessHours: sunVisibility.accessDurationHours,
        earthAccessHours: earthVisibility.accessDurationHours,
        overlapHours: overlap.hours,
        sunInterruptionHours: sunVisibility.longestInterruptionHours,
        earthInterruptionHours: earthVisibility.longestInterruptionHours,
        sunTruncated: sunVisibility.longestInterruptionTruncated,
        earthTruncated: earthVisibility.longestInterruptionTruncated,
        statement: screen.statement,
      });
    }
  }

  const byKey = new Map(rows.map((row) => [`${row.siteId}|${row.arrivalUtc}`, row]));
  const delays = [12, 24, 48, 72, 96, 120, 168];
  let chosen: { baseline: SweepRow; delayed: SweepRow; delayHours: number; score: number } | null = null;
  for (const baseline of rows) {
    if (baseline.status === "insufficient_data") continue;
    for (const delayHours of delays) {
      const delayed = byKey.get(`${baseline.siteId}|${addHours(baseline.arrivalUtc, delayHours)}`);
      if (!delayed || delayed.status === "insufficient_data") continue;
      const sunDelta = Math.abs((delayed.sunInterruptionHours ?? 0) - (baseline.sunInterruptionHours ?? 0));
      const earthDelta = Math.abs(
        (delayed.earthInterruptionHours ?? 0) - (baseline.earthInterruptionHours ?? 0),
      );
      const overlapDelta = Math.abs((delayed.overlapHours ?? 0) - (baseline.overlapHours ?? 0));
      const statusChanged = delayed.status !== baseline.status;
      if (!statusChanged && sunDelta < 0.5 && earthDelta < 0.5 && overlapDelta < 0.5) continue;
      const score =
        (statusChanged ? 1_000 : 0) +
        sunDelta +
        earthDelta +
        overlapDelta +
        (baseline.siteId === "example-b" ? 5 : 0);
      if (!chosen || score > chosen.score) chosen = { baseline, delayed, delayHours, score };
    }
  }
  if (!chosen) {
    throw new Error("No decisive pair of windows changed the calculated visibility.");
  }

  const baselineSite = sites.find((site) => site.id === chosen.baseline.siteId)!;
  const baselineInput: ScenarioInput = {
    id: "baseline",
    name: `Baseline plan — ${baselineSite.name}`,
    siteId: baselineSite.id,
    arrivalUtc: chosen.baseline.arrivalUtc,
    durationHours: 168,
    solarPanelHeightM: 2,
    antennaHeightM: 3,
    maxSolarInterruptionHours: 48,
    maxEarthInterruptionHours: 24,
    isBaseline: true,
  };
  const delayedInput: ScenarioInput = {
    ...baselineInput,
    id: "delayed-landing",
    name: `Landing delay +${chosen.delayHours} h — ${baselineSite.name}`,
    arrivalUtc: chosen.delayed.arrivalUtc,
    isBaseline: false,
  };

  const ephemerides: Record<string, EphemerisSeries> = {};
  const remember = (site: LunarSite, target: CelestialTarget, start: string, stop: string) => {
    const key = cacheKey(site.id, target, start, stop, TIME_SAMPLE_HOURS);
    if (ephemerides[key]) return;
    const sliced = sliceSeries(full.get(`${site.id}|${target}`)!, start, stop);
    ephemerides[key] = { ...sliced, source: "demo_cache" };
  };
  const offsets = [-48, -24, 0, 24, 48, chosen.delayHours];
  for (const site of sites) {
    for (const offset of offsets) {
      const start = addHours(baselineInput.arrivalUtc, offset);
      const stop = addHours(start, baselineInput.durationHours);
      remember(site, "sun", start, stop);
      remember(site, "earth", start, stop);
    }
  }

  const lookup = (site: LunarSite, target: CelestialTarget, start: string, stop: string) => {
    const key = cacheKey(site.id, target, start, stop, TIME_SAMPLE_HOURS);
    const series = ephemerides[key];
    if (!series) throw new Error(`Missing series ${key}`);
    return series;
  };
  const ctx = { sites, terrain, getEphemeris: lookup };
  const baselineResult = analyzeScenario(baselineInput, ctx);
  const delayedResult = {
    ...analyzeScenario(delayedInput, ctx),
    deltaFromBaseline: deltaFromBaseline(
      analyzeScenario(delayedInput, ctx),
      baselineResult,
    ),
  };
  // analyzeScenario was called twice for the delay; recompute delta from one pair.
  const delayedOnce = analyzeScenario(delayedInput, ctx);
  const delta = deltaFromBaseline(delayedOnce, baselineResult);
  const delayedWithDelta: ScenarioResult = { ...delayedOnce, deltaFromBaseline: delta };
  const alternatives = findAlternatives(baselineInput, sites, lookup, terrain);

  const counts: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    counts[row.siteId] ??= {};
    counts[row.siteId][row.status] = (counts[row.siteId][row.status] ?? 0) + 1;
  }

  const notes = [
    `Example analysis locations A, B, and C are samples of the LOLA grid. They are NOT officially designated landing sites.`,
    `The baseline is ${baselineSite.name} at ${baselineInput.arrivalUtc} for ${baselineInput.durationHours} hours.`,
    `User-assumption limits, not NASA requirements: solar interruption ${baselineInput.maxSolarInterruptionHours} h, Earth interruption ${baselineInput.maxEarthInterruptionHours} h, panel ${baselineInput.solarPanelHeightM} m, antenna ${baselineInput.antennaHeightM} m.`,
    `Calculated baseline status is ${baselineResult.status}. Solar access ${hoursText(baselineResult.sun.accessDurationHours)} h, longest solar interruption ${hoursText(baselineResult.sun.longestInterruptionHours)} h (truncated ${baselineResult.sun.longestInterruptionTruncated}). Earth access ${hoursText(baselineResult.earth.accessDurationHours)} h, longest Earth interruption ${hoursText(baselineResult.earth.longestInterruptionHours)} h (truncated ${baselineResult.earth.longestInterruptionTruncated}). Overlap ${hoursText(baselineResult.overlapHours)} h.`,
    `A landing delay of ${chosen.delayHours} hours moves arrival to ${delayedInput.arrivalUtc}. ${delta.summary}`,
    `The bounded alternative search (${alternatives.candidateCount} candidates) ${alternatives.anyMeetsLimits ? "found at least one option inside the user assumptions" : "found no option inside the user assumptions"}. Rank 1 is ${alternatives.results[0]?.site.name} at ${alternatives.results[0]?.arrivalUtc}: ${alternatives.results[0]?.rankReason}`,
    alternatives.boundsDescription,
  ].join(" ");

  const manifest = {
    sites,
    baselineScenarioId: baselineInput.id,
    scenarios: [baselineInput, delayedInput],
    demonstrationNotes: notes,
  };
  writeFileSync(join(fixtureDir, "demoManifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(fixtureDir, "ephemerides.json"), JSON.stringify(ephemerides));
  writeFileSync(
    join(fixtureDir, "demoResults.json"),
    JSON.stringify(
      {
        counts,
        chosen: {
          delayHours: chosen.delayHours,
          score: chosen.score,
          baseline: chosen.baseline,
          delayed: chosen.delayed,
        },
        baselineStatement: baselineResult.statement,
        delayedStatement: delayedWithDelta.statement,
        delta,
        alternatives: {
          anyMeetsLimits: alternatives.anyMeetsLimits,
          boundsDescription: alternatives.boundsDescription,
          top: alternatives.results.slice(0, 5).map((result) => ({
            rank: result.rank,
            id: result.id,
            site: result.site.name,
            arrivalUtc: result.arrivalUtc,
            meetsAllLimits: result.meetsAllLimits,
            rankReason: result.rankReason,
            shortfall: result.shortfall,
            status: result.result.status,
            sunInterruptionHours: result.result.sun.longestInterruptionHours,
            earthInterruptionHours: result.result.earth.longestInterruptionHours,
            overlapHours: result.result.overlapHours,
            sunAccessHours: result.result.sun.accessDurationHours,
            earthAccessHours: result.result.earth.accessDurationHours,
          })),
        },
        ephemerisKeys: Object.keys(ephemerides).length,
      },
      null,
      2,
    ),
  );
  console.log(notes);
  console.log("--- TOP ---");
  for (const result of alternatives.results.slice(0, 5)) {
    console.log(result.rank, result.id, result.result.status, result.rankReason);
  }
  console.log("keys", Object.keys(ephemerides).length, "sweep", rows.length);
}

main();
