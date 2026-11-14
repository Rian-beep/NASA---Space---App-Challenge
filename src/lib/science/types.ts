/**
 * Shared contracts for Lunar Window.
 * Science, visualisation, and workflow code all import from here.
 * Do not put rendering or React state in this module.
 */

export const SOFTWARE_VERSION = "0.1.0";

export type AudienceMode = "explore" | "plan" | "analyze";

/** User-facing screening language. Never imply flight approval. */
export type VerdictStatus =
  | "within_limits"
  | "exceeds_limits"
  | "insufficient_data";

export type CelestialTarget = "sun" | "earth";

export interface LunarSite {
  id: string;
  /** Display name. Example sites must not be labelled as official landing sites. */
  name: string;
  kind: "example_analysis" | "custom";
  /** Geodetic east longitude, degrees, positive east (Horizons / MOON_ME). */
  eastLongitudeDeg: number;
  /** Geodetic latitude, degrees, negative in the south. */
  latitudeDeg: number;
  /** Surface height above the reference sphere/ellipsoid, metres. */
  surfaceHeightM: number;
  summary: string;
}

export interface ScenarioInput {
  id: string;
  name: string;
  siteId: string;
  /** Required when siteId is "custom" or the site is not in the catalogue. */
  customSite?: Pick<
    LunarSite,
    "eastLongitudeDeg" | "latitudeDeg" | "surfaceHeightM" | "name"
  >;
  /** ISO-8601 UTC, e.g. 2026-12-01T00:00:00Z */
  arrivalUtc: string;
  durationHours: number;
  solarPanelHeightM: number;
  antennaHeightM: number;
  /** User assumption: longest solar-access gap they will tolerate. */
  maxSolarInterruptionHours: number;
  /** User assumption: longest Earth-visibility gap they will tolerate. */
  maxEarthInterruptionHours: number;
  isBaseline: boolean;
}

export interface EphemerisSample {
  timeUtc: string;
  /** Degrees clockwise from north: N=0, E=90, S=180, W=270. */
  azimuthDeg: number;
  /** Degrees above the local airless horizontal. */
  elevationDeg: number;
}

export interface EphemerisSeries {
  target: CelestialTarget;
  siteId: string;
  samples: EphemerisSample[];
  /** Exact Horizons query parameters that produced this series. */
  request: Record<string, string>;
  retrievedAtUtc: string;
  source: "horizons_live" | "horizons_cache" | "demo_cache";
  apiVersion: string | null;
}

export interface HorizonSample {
  azimuthDeg: number;
  /** Terrain mask elevation, degrees. Null when this azimuth has no coverage. */
  elevationDeg: number | null;
  distanceM: number | null;
  coverage: "terrain" | "geometric_limb_only" | "missing";
}

export interface TerrainHorizon {
  siteId: string;
  heightAboveGroundM: number;
  azimuthStepDeg: number;
  samples: HorizonSample[];
  coverage: "complete" | "partial" | "insufficient";
  datasetId: string;
  analysisResolutionM: number;
}

export interface TimeInterval {
  startUtc: string;
  endUtc: string;
  kind: "access" | "interruption";
  /** True when the state continues outside the requested analysis window. */
  truncated: boolean;
}

export interface VisibilitySample {
  timeUtc: string;
  azimuthDeg: number | null;
  elevationDeg: number | null;
  horizonElevationDeg: number | null;
  clearanceDeg: number | null;
  /** Null means the sample cannot be classified (missing ephemeris or terrain). */
  visible: boolean | null;
}

export interface BodyVisibility {
  target: CelestialTarget;
  equipmentHeightM: number;
  samples: VisibilitySample[];
  /** Hours classified as visible. Null if any sample is unknown. */
  accessDurationHours: number | null;
  accessPercent: number | null;
  /**
   * Longest continuous hidden stretch inside the window.
   * Null if unknown. Does not invent duration beyond the window.
   */
  longestInterruptionHours: number | null;
  longestInterruptionTruncated: boolean;
  intervals: TimeInterval[];
  nextTransitionUtc: string | null;
  nextTransition: "becomes_visible" | "becomes_hidden" | null;
}

export interface LimitCheck {
  id: "solar_interruption" | "earth_interruption";
  limitHours: number;
  observedHours: number | null;
  exceededByHours: number | null;
  status: VerdictStatus;
  /** Plain language: which limit, by how much, during which interval. */
  detail: string;
}

export interface Provenance {
  presentation: "precomputed from NASA data" | "cached Horizons response";
  horizonsDocUrl: string;
  terrainProductUrl: string;
  terrainProductId: string;
  citation: string;
  retrievedAtUtc: string[];
  analysisIntervalUtc: { start: string; end: string };
  coordinateReference: string;
  longitudeConvention: string;
  sourcePixelSpacingM: number | null;
  analysisResolutionM: number | null;
  equipment: { solarPanelHeightM: number; antennaHeightM: number };
  timeSampleHours: number;
  horizonAzimuthStepDeg: number;
  softwareVersion: string;
  visibilityModel: string;
  eclipseModel: string;
  limitations: string[];
}

export interface ScenarioSnapshot {
  sunAzimuthDeg: number | null;
  sunElevationDeg: number | null;
  sunHorizonDeg: number | null;
  sunClearanceDeg: number | null;
  sunVisible: boolean | null;
  earthAzimuthDeg: number | null;
  earthElevationDeg: number | null;
  earthHorizonDeg: number | null;
  earthClearanceDeg: number | null;
  earthVisible: boolean | null;
}

export interface BaselineDelta {
  solarInterruptionDeltaHours: number | null;
  earthInterruptionDeltaHours: number | null;
  overlapDeltaHours: number | null;
  statusChanged: boolean;
  summary: string;
}

export interface ScenarioResult {
  scenarioId: string;
  status: VerdictStatus;
  /** One plain-language statement backed by the numbers in limitChecks. */
  statement: string;
  sun: BodyVisibility;
  earth: BodyVisibility;
  overlapHours: number | null;
  overlapPercent: number | null;
  selectedTimeUtc: string;
  atTime: ScenarioSnapshot;
  limitChecks: LimitCheck[];
  provenance: Provenance;
  deltaFromBaseline?: BaselineDelta;
}

export interface AlternativeScore {
  meetsAllLimits: boolean;
  /** Max of the two longest interruptions. Null if either is unknown. */
  worstInterruptionHours: number | null;
  overlapHours: number | null;
  /** Smaller is closer to the original site and arrival time. */
  planChangeScore: number;
}

export interface AlternativeCandidate {
  id: string;
  site: LunarSite;
  arrivalUtc: string;
  meetsAllLimits: boolean;
  rank: number;
  rankReason: string;
  score: AlternativeScore;
  /** Remaining shortfall when limits are missed. Null when all evaluated limits are met. */
  shortfall: string | null;
  result: ScenarioResult;
}

export interface AlternativeSearch {
  /** Human description of what was and was not searched. */
  boundsDescription: string;
  candidateCount: number;
  dateOffsetsHours: number[];
  sitesSearched: LunarSite[];
  ordering: string[];
  anyMeetsLimits: boolean;
  /** True when the search set is bounded and not a global optimum. */
  limitedSearch: true;
  results: AlternativeCandidate[];
}

export interface AnalysisDataset {
  datasetId: string;
  productUrl: string;
  citation: string;
  coordinateReference: string;
  /** Moon radius used for curvature, metres. */
  bodyRadiusM: number;
  sourcePixelSpacingM: number;
  analysisResolutionM: number;
  /** Flat row-major heights, metres. Nodata is null. */
  rows: number;
  cols: number;
  /** South-polar stereographic origin of pixel (0,0) centre, metres. */
  originX: number;
  originY: number;
  pixelSizeM: number;
  heights: Array<number | null>;
  retrievedAtUtc: string;
  /**
   * Surface distance, metres, that must be inside the grid before an azimuth
   * is treated as terrain-backed. Absent on older grids; the horizon builder
   * then uses its documented default.
   */
  horizonSearchRadiusM?: number;
}

export interface DemoBundle {
  sites: LunarSite[];
  baselineScenarioId: string;
  scenarios: ScenarioInput[];
  /** Keyed by cacheKey(site, target, start, stop, step). */
  ephemerides: Record<string, EphemerisSeries>;
  terrain: AnalysisDataset;
  /**
   * Narrative of the bundled demonstration, written from calculated results.
   * Requirements mentioned here are user assumptions.
   */
  demonstrationNotes: string;
}

export interface ExportReport {
  generatedAtUtc: string;
  softwareVersion: string;
  disclaimer: string;
  scenarios: ScenarioInput[];
  results: ScenarioResult[];
  alternatives: AlternativeSearch | null;
  mode: AudienceMode;
}
