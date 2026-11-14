export {
  BODY_RADIUS_M,
  TIME_SAMPLE_HOURS,
  HORIZON_AZIMUTH_STEP_DEG,
  HORIZON_SEARCH_RADIUS_M,
  VISIBILITY_MODEL,
  HORIZONS_DOC_URL,
  HORIZONS_API_URL,
  TERRAIN_PRODUCT_PAGE_URL,
  TERRAIN_PRODUCT_FILE_URL,
  TERRAIN_PRODUCT_ID,
  HORIZONS_USER_AGENT,
  MODEL_LIMITATIONS,
} from "./constants";

export {
  LunarDataError,
  altitudeKilometres,
  formatSiteCoord,
  buildHorizonsParams,
  horizonsRequestUrl,
  cacheKey,
  parseHorizonsJson,
  unwrapAzimuthDegrees,
  interpolateAzimuth,
  sliceSeries,
  addHours,
  toUtcIso,
  parseUtcMs,
} from "./ephemeris";
export type { HorizonsParseMeta, HorizonsSiteQuery } from "./ephemeris";

export {
  buildHorizon,
  horizonElevationAt,
  elevationAboveHorizontalDeg,
  geometricLimbElevationDeg,
  geometricLimbDistanceM,
  localAzimuthDeg,
  stereographicMetres,
  geodeticFromStereographic,
  geodeticToBodyFixed,
} from "./horizon";

export {
  compareSeries,
  overlapOf,
  limitCheck,
  screenLimits,
  windowHours,
} from "./metrics";

export {
  findAlternatives,
  surfaceDistanceM,
  ALTERNATIVE_DATE_OFFSETS_HOURS,
} from "./alternatives";
export type { EphemerisLookup } from "./alternatives";

export {
  analyzeScenario,
  deltaFromBaseline,
  attachBaselineDelta,
  resolveSite,
} from "./analyze";
export type { AnalysisContext } from "./analyze";

export { getDemoBundle, demoEphemeris } from "./fixtures/demoBundle";

export { SOFTWARE_VERSION } from "./types";
export type {
  AudienceMode,
  VerdictStatus,
  CelestialTarget,
  LunarSite,
  ScenarioInput,
  EphemerisSample,
  EphemerisSeries,
  HorizonSample,
  TerrainHorizon,
  TimeInterval,
  VisibilitySample,
  BodyVisibility,
  LimitCheck,
  Provenance,
  ScenarioSnapshot,
  BaselineDelta,
  ScenarioResult,
  AlternativeScore,
  AlternativeCandidate,
  AlternativeSearch,
  AnalysisDataset,
  DemoBundle,
  ExportReport,
} from "./types";
