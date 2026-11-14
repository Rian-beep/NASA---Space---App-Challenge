import type {
  AnalysisDataset,
  CelestialTarget,
  DemoBundle,
  EphemerisSeries,
  LunarSite,
  ScenarioInput,
  ScenarioResult,
  TerrainHorizon,
} from "@/lib/science/types";
import { DISCLAIMER, SCIENCE_NOT_READY } from "./copy";
import { addHours } from "./format";

/**
 * Runtime contract for `@/lib/science`:
 * - SOFTWARE_VERSION
 * - TIME_SAMPLE_HOURS
 * - getDemoBundle()
 * - analyzeScenario(input, { sites, terrain, getEphemeris })
 * - findAlternatives(scenario, sites, getEphemeris, terrain)
 * - attachBaselineDelta(result, baseline)
 * - buildHorizon(terrain, site, heightAboveGroundM)
 * - resolveSite(input, sites)
 * - cacheKey(siteId, target, start, stop, stepHours)
 * - sliceSeries(series, start, stop)
 *
 * getEphemeris reads the demonstration cache only. It does not call JPL.
 */
type ScienceModule = {
  SOFTWARE_VERSION: string;
  TIME_SAMPLE_HOURS: number;
  DISCLAIMER?: string;
  MAX_SCENARIOS?: number;
  getDemoBundle: () => DemoBundle | Promise<DemoBundle>;
  analyzeScenario: (
    input: ScenarioInput,
    ctx: {
      sites: readonly LunarSite[];
      terrain: AnalysisDataset;
      getEphemeris: (
        site: LunarSite,
        target: CelestialTarget,
        startUtc: string,
        stopUtc: string,
      ) => EphemerisSeries;
    },
  ) => ScenarioResult | Promise<ScenarioResult>;
  findAlternatives: (
    scenario: ScenarioInput,
    sites: readonly LunarSite[],
    ephemerisLookup: (
      site: LunarSite,
      target: CelestialTarget,
      startUtc: string,
      stopUtc: string,
    ) => EphemerisSeries,
    terrain: AnalysisDataset,
  ) => import("@/lib/science/types").AlternativeSearch | Promise<import("@/lib/science/types").AlternativeSearch>;
  attachBaselineDelta: (result: ScenarioResult, baseline: ScenarioResult) => ScenarioResult;
  buildHorizon: (
    terrain: AnalysisDataset,
    site: LunarSite,
    heightAboveGroundM: number,
  ) => TerrainHorizon;
  resolveSite: (input: ScenarioInput, sites: readonly LunarSite[]) => LunarSite;
  cacheKey: (
    siteId: string,
    target: CelestialTarget,
    start: string,
    stop: string,
    stepHours: number,
  ) => string;
  sliceSeries: (series: EphemerisSeries, startUtc: string, stopUtc: string) => EphemerisSeries;
  demoEphemeris?: (
    site: LunarSite,
    target: CelestialTarget,
    startUtc: string,
    stopUtc: string,
  ) => EphemerisSeries;
};

export type ScienceSession = {
  bundle: DemoBundle;
  softwareVersion: string;
  disclaimer: string;
  maxScenarios: number;
};

export type AnalyzeOptions = {
  bundle?: DemoBundle;
  baselineScenario?: ScenarioInput | null;
  baselineResult?: ScenarioResult | null;
};

let pending: Promise<ScienceModule> | null = null;
let unavailable = false;

export function resetScienceCache(): void {
  pending = null;
  unavailable = false;
}

function isReady(value: Partial<ScienceModule> | undefined): value is ScienceModule {
  return Boolean(
    value &&
      typeof value.getDemoBundle === "function" &&
      typeof value.analyzeScenario === "function" &&
      typeof value.findAlternatives === "function" &&
      typeof value.attachBaselineDelta === "function" &&
      typeof value.buildHorizon === "function" &&
      typeof value.resolveSite === "function" &&
      typeof value.cacheKey === "function" &&
      typeof value.sliceSeries === "function" &&
      typeof value.SOFTWARE_VERSION === "string" &&
      value.SOFTWARE_VERSION.length > 0 &&
      typeof value.TIME_SAMPLE_HOURS === "number",
  );
}

async function importScienceModule(): Promise<ScienceModule> {
  if (unavailable) throw new Error(SCIENCE_NOT_READY);
  const imported = (await import("@/lib/science")) as Partial<ScienceModule> & {
    default?: Partial<ScienceModule>;
  };
  const resolved: Partial<ScienceModule> = { ...imported.default, ...imported };
  if (!isReady(resolved)) throw new Error(SCIENCE_NOT_READY);
  return resolved;
}

export function loadScience(): Promise<ScienceModule> {
  if (!pending) {
    pending = importScienceModule().catch((error: unknown) => {
      pending = null;
      unavailable = true;
      if (error instanceof Error && error.message === SCIENCE_NOT_READY) throw error;
      throw new Error(SCIENCE_NOT_READY);
    });
  }
  return pending;
}

async function unwrap<T>(value: T | Promise<T>): Promise<T> {
  return await value;
}

export function scenarioCap(science: Pick<ScienceModule, "MAX_SCENARIOS">): number {
  const published = science.MAX_SCENARIOS;
  if (typeof published === "number" && Number.isFinite(published) && published >= 1) {
    return Math.min(3, Math.floor(published));
  }
  return 3;
}

export function disclaimerFrom(science: Pick<ScienceModule, "DISCLAIMER">): string {
  const text = science.DISCLAIMER?.trim();
  return text ? text : DISCLAIMER;
}

function coversWindow(series: EphemerisSeries, startUtc: string, stopUtc: string, stepHours: number): boolean {
  if (series.samples.length === 0) return false;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of series.samples) {
    const time = Date.parse(sample.timeUtc);
    if (Number.isNaN(time)) continue;
    if (time < min) min = time;
    if (time > max) max = time;
  }
  const start = Date.parse(startUtc);
  const stop = Date.parse(stopUtc);
  const slack = Math.max(stepHours, 1) * 3_600_000;
  return min <= start + slack && max >= stop - slack;
}

/** Reads cached Horizons samples. Does not build a request and does not call JPL. */
export function lookupCachedEphemeris(
  science: ScienceModule,
  bundle: DemoBundle,
  site: LunarSite,
  target: CelestialTarget,
  startUtc: string,
  stopUtc: string,
): EphemerisSeries {
  if (science.demoEphemeris) {
    try {
      return science.demoEphemeris(site, target, startUtc, stopUtc);
    } catch {
      // The exact demonstration key missed. A wider cached series may still cover it.
    }
  }
  const step = science.TIME_SAMPLE_HOURS;
  const exact = bundle.ephemerides[science.cacheKey(site.id, target, startUtc, stopUtc, step)];
  const candidates = exact
    ? [exact]
    : Object.values(bundle.ephemerides).filter(
        (series) => series.siteId === site.id && series.target === target,
      );
  for (const series of candidates) {
    try {
      const sliced = science.sliceSeries(series, startUtc, stopUtc);
      if (coversWindow(sliced, startUtc, stopUtc, step)) return sliced;
    } catch {
      continue;
    }
  }
  throw new Error(
    "No precomputed ephemeris covers this place and time. Lunar Window does not call JPL from the browser.",
  );
}

function contextFor(science: ScienceModule, bundle: DemoBundle) {
  return {
    sites: bundle.sites,
    terrain: bundle.terrain,
    getEphemeris: (site: LunarSite, target: CelestialTarget, startUtc: string, stopUtc: string) =>
      lookupCachedEphemeris(science, bundle, site, target, startUtc, stopUtc),
  };
}

function sitesForSearch(science: ScienceModule, bundle: DemoBundle, scenario: ScenarioInput): LunarSite[] {
  if (bundle.sites.some((site) => site.id === scenario.siteId)) return bundle.sites;
  return [...bundle.sites, science.resolveSite(scenario, bundle.sites)];
}

export function solarHorizonFor(
  science: ScienceModule,
  bundle: DemoBundle,
  scenario: ScenarioInput,
): TerrainHorizon | null {
  try {
    const site = science.resolveSite(scenario, bundle.sites);
    return science.buildHorizon(bundle.terrain, site, scenario.solarPanelHeightM);
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return payload ?? {};
}

export async function loadSession(): Promise<ScienceSession> {
  try {
    const science = await loadScience();
    const bundle = await unwrap(science.getDemoBundle());
    if (!bundle || !Array.isArray(bundle.scenarios) || !Array.isArray(bundle.sites)) {
      throw new Error(SCIENCE_NOT_READY);
    }
    return {
      bundle,
      softwareVersion: science.SOFTWARE_VERSION,
      disclaimer: disclaimerFrom(science),
      maxScenarios: scenarioCap(science),
    };
  } catch (error) {
    if (typeof window === "undefined") throw error;
    const response = await fetch("/api/demo", { cache: "no-store" });
    const payload = await readJson(response);
    if (!response.ok || !payload.bundle) {
      throw new Error(typeof payload.error === "string" ? payload.error : SCIENCE_NOT_READY);
    }
    return {
      bundle: payload.bundle as DemoBundle,
      softwareVersion: typeof payload.softwareVersion === "string" ? payload.softwareVersion : "unknown",
      disclaimer: typeof payload.disclaimer === "string" ? payload.disclaimer : DISCLAIMER,
      maxScenarios: 3,
    };
  }
}

export async function analyzeWithScience(
  scenario: ScenarioInput,
  options: AnalyzeOptions = {},
): Promise<ScenarioResult> {
  try {
    const science = await loadScience();
    const bundle = options.bundle ?? (await unwrap(science.getDemoBundle()));
    const ctx = contextFor(science, bundle);
    const own = await unwrap(science.analyzeScenario(scenario, ctx));
    if (options.baselineResult && options.baselineResult.scenarioId !== scenario.id) {
      return science.attachBaselineDelta(own, options.baselineResult);
    }
    if (options.baselineScenario && options.baselineScenario.id !== scenario.id) {
      const baseline = await unwrap(science.analyzeScenario(options.baselineScenario, ctx));
      return science.attachBaselineDelta(own, baseline);
    }
    return own;
  } catch (error) {
    if (typeof window === "undefined" || !(error instanceof Error) || error.message !== SCIENCE_NOT_READY) {
      throw error;
    }
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario,
        baselineScenario: options.baselineScenario ?? null,
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || !payload.result) {
      throw new Error(typeof payload.error === "string" ? payload.error : SCIENCE_NOT_READY);
    }
    return payload.result as ScenarioResult;
  }
}

export async function alternativesWithScience(
  scenario: ScenarioInput,
  options: { bundle?: DemoBundle } = {},
): Promise<import("@/lib/science/types").AlternativeSearch> {
  try {
    const science = await loadScience();
    const bundle = options.bundle ?? (await unwrap(science.getDemoBundle()));
    const sites = sitesForSearch(science, bundle, scenario);
    return await unwrap(
      science.findAlternatives(
        scenario,
        sites,
        (site, target, startUtc, stopUtc) => lookupCachedEphemeris(science, bundle, site, target, startUtc, stopUtc),
        bundle.terrain,
      ),
    );
  } catch (error) {
    if (typeof window === "undefined" || !(error instanceof Error) || error.message !== SCIENCE_NOT_READY) {
      throw error;
    }
    const response = await fetch("/api/alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const payload = await readJson(response);
    if (!response.ok || !payload.search) {
      throw new Error(typeof payload.error === "string" ? payload.error : SCIENCE_NOT_READY);
    }
    return payload.search as import("@/lib/science/types").AlternativeSearch;
  }
}

export async function horizonForScenario(
  scenario: ScenarioInput,
  bundle: DemoBundle,
): Promise<TerrainHorizon | null> {
  const science = await loadScience();
  return solarHorizonFor(science, bundle, scenario);
}

export function isScenarioInput(value: unknown): value is ScenarioInput {
  if (!value || typeof value !== "object") return false;
  const scenario = value as Partial<ScenarioInput>;
  return (
    typeof scenario.id === "string" &&
    typeof scenario.name === "string" &&
    typeof scenario.siteId === "string" &&
    typeof scenario.arrivalUtc === "string" &&
    typeof scenario.durationHours === "number" &&
    typeof scenario.solarPanelHeightM === "number" &&
    typeof scenario.antennaHeightM === "number" &&
    typeof scenario.maxSolarInterruptionHours === "number" &&
    typeof scenario.maxEarthInterruptionHours === "number" &&
    typeof scenario.isBaseline === "boolean" &&
    !Number.isNaN(Date.parse(scenario.arrivalUtc))
  );
}

export function activeWindow(scenario: ScenarioInput): { startUtc: string; endUtc: string } | null {
  if (Number.isNaN(Date.parse(scenario.arrivalUtc)) || !(scenario.durationHours > 0)) return null;
  return {
    startUtc: scenario.arrivalUtc,
    endUtc: addHours(scenario.arrivalUtc, scenario.durationHours),
  };
}
