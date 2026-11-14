import type {
  DemoBundle,
  LunarSite,
  ScenarioInput,
  ScenarioResult,
  ScenarioSnapshot,
  VisibilitySample,
} from "@/lib/science/types";
import { addHours } from "./format";

export function cloneScenario(
  scenario: ScenarioInput,
  overrides: Partial<ScenarioInput> = {},
): ScenarioInput {
  const customSite =
    "customSite" in overrides ? overrides.customSite : scenario.customSite;
  return {
    ...scenario,
    ...overrides,
    customSite: customSite ? { ...customSite } : undefined,
  };
}

export function pickBaseline(bundle: DemoBundle): ScenarioInput | null {
  return (
    bundle.scenarios.find((scenario) => scenario.id === bundle.baselineScenarioId) ??
    bundle.scenarios.find((scenario) => scenario.isBaseline) ??
    bundle.scenarios[0] ??
    null
  );
}

/** A second bundled case with a later arrival, when the demonstration includes one. */
export function demoDelayedScenario(bundle: DemoBundle): ScenarioInput | null {
  const baseline = pickBaseline(bundle);
  const others = bundle.scenarios.filter((scenario) => scenario.id !== baseline?.id);
  if (!baseline) return others[0] ?? null;
  const baselineTime = Date.parse(baseline.arrivalUtc);
  const later = others
    .filter((scenario) => Date.parse(scenario.arrivalUtc) > baselineTime)
    .sort((a, b) => Date.parse(a.arrivalUtc) - Date.parse(b.arrivalUtc));
  return later[0] ?? null;
}

export function windowBounds(scenarios: ScenarioInput[]): { startUtc: string; endUtc: string } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const scenario of scenarios) {
    const arrival = Date.parse(scenario.arrivalUtc);
    if (Number.isNaN(arrival) || !(scenario.durationHours > 0)) continue;
    const stop = arrival + scenario.durationHours * 3_600_000;
    if (arrival < start) start = arrival;
    if (stop > end) end = stop;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    startUtc: new Date(start).toISOString().replace(".000Z", "Z"),
    endUtc: new Date(end).toISOString().replace(".000Z", "Z"),
  };
}

export function emptySnapshot(): ScenarioSnapshot {
  return {
    sunAzimuthDeg: null,
    sunElevationDeg: null,
    sunHorizonDeg: null,
    sunClearanceDeg: null,
    sunVisible: null,
    earthAzimuthDeg: null,
    earthElevationDeg: null,
    earthHorizonDeg: null,
    earthClearanceDeg: null,
    earthVisible: null,
  };
}

function nearestSample(
  samples: VisibilitySample[],
  timeUtc: string,
  toleranceMs: number,
): VisibilitySample | null {
  const target = Date.parse(timeUtc);
  if (Number.isNaN(target) || samples.length === 0) return null;
  let best: VisibilitySample | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const distance = Math.abs(Date.parse(sample.timeUtc) - target);
    if (Number.isNaN(distance) || distance >= bestDistance) continue;
    best = sample;
    bestDistance = distance;
  }
  if (!best || bestDistance > toleranceMs) return null;
  return best;
}

/**
 * Reads visibility samples that analysis already computed.
 * Moving the scrubber does not recompute a horizon or call Horizons.
 */
export function snapshotAt(
  result: ScenarioResult | undefined,
  timeUtc: string,
): ScenarioSnapshot | null {
  if (!result) return null;
  const stepHours = result.provenance?.timeSampleHours;
  const toleranceMs =
    (Number.isFinite(stepHours) && stepHours > 0 ? stepHours : 1) * 3_600_000 * 0.51;
  const sunSamples = result.sun?.samples ?? [];
  const earthSamples = result.earth?.samples ?? [];
  if (sunSamples.length === 0 && earthSamples.length === 0) {
    const selected = Date.parse(result.selectedTimeUtc);
    const target = Date.parse(timeUtc);
    if (!Number.isNaN(selected) && !Number.isNaN(target) && Math.abs(selected - target) <= toleranceMs) {
      return result.atTime;
    }
    return emptySnapshot();
  }
  const sun = nearestSample(sunSamples, timeUtc, toleranceMs);
  const earth = nearestSample(earthSamples, timeUtc, toleranceMs);
  if (!sun && !earth) return emptySnapshot();
  return {
    sunAzimuthDeg: sun?.azimuthDeg ?? null,
    sunElevationDeg: sun?.elevationDeg ?? null,
    sunHorizonDeg: sun?.horizonElevationDeg ?? null,
    sunClearanceDeg: sun?.clearanceDeg ?? null,
    sunVisible: sun?.visible ?? null,
    earthAzimuthDeg: earth?.azimuthDeg ?? null,
    earthElevationDeg: earth?.elevationDeg ?? null,
    earthHorizonDeg: earth?.horizonElevationDeg ?? null,
    earthClearanceDeg: earth?.clearanceDeg ?? null,
    earthVisible: earth?.visible ?? null,
  };
}

export function shiftLanding(scenario: ScenarioInput, hours: number, id: string, name: string): ScenarioInput {
  return cloneScenario(scenario, {
    id,
    name,
    arrivalUtc: addHours(scenario.arrivalUtc, hours),
    isBaseline: false,
  });
}

export function knownSite(sites: LunarSite[], siteId: string): LunarSite | null {
  return sites.find((site) => site.id === siteId) ?? null;
}
