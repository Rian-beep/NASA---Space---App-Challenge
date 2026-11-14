/**
 * Offline demonstration. The JSON files are sliced from saved Horizons
 * responses and the LOLA analysis window. Importing this module does not
 * use the network.
 */
import terrainJson from "./terrain.json";
import manifestJson from "./demoManifest.json";
import ephemeridesJson from "./ephemerides.json";
import type {
  AnalysisDataset,
  CelestialTarget,
  DemoBundle,
  EphemerisSeries,
  LunarSite,
  ScenarioInput,
} from "../types";
import { TIME_SAMPLE_HOURS } from "../constants";
import { LunarDataError, cacheKey } from "../ephemeris";

interface DemoManifest {
  sites: LunarSite[];
  baselineScenarioId: string;
  scenarios: ScenarioInput[];
  demonstrationNotes: string;
}

const terrain = terrainJson as AnalysisDataset;
const manifest = manifestJson as DemoManifest;
const ephemerides = ephemeridesJson as Record<string, EphemerisSeries>;

export function getDemoBundle(): DemoBundle {
  return {
    sites: manifest.sites,
    baselineScenarioId: manifest.baselineScenarioId,
    scenarios: manifest.scenarios,
    ephemerides,
    terrain,
    demonstrationNotes: manifest.demonstrationNotes,
  };
}

/** Synchronous lookup into the bundled Horizons slices. */
export function demoEphemeris(
  site: LunarSite,
  target: CelestialTarget,
  startUtc: string,
  stopUtc: string,
): EphemerisSeries {
  const key = cacheKey(site.id, target, startUtc, stopUtc, TIME_SAMPLE_HOURS);
  const series = ephemerides[key];
  if (!series) {
    throw new LunarDataError(`No demo ephemeris for ${key}.`);
  }
  return series;
}
