import type { LunarSite, ScenarioInput, ScenarioResult } from "@/lib/science/types";
import { statusPhrase } from "./format";

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const HEADERS = [
  "scenario_id",
  "name",
  "baseline",
  "site_id",
  "site_name",
  "east_longitude_deg",
  "latitude_deg",
  "surface_height_m",
  "arrival_utc",
  "duration_hours",
  "solar_panel_height_m",
  "antenna_height_m",
  "max_solar_interruption_hours",
  "max_earth_interruption_hours",
  "status",
  "statement",
  "sun_access_hours",
  "sun_access_percent",
  "sun_longest_interruption_hours",
  "sun_interruption_truncated",
  "earth_access_hours",
  "earth_access_percent",
  "earth_longest_interruption_hours",
  "earth_interruption_truncated",
  "overlap_hours",
  "overlap_percent",
  "limit_details",
  "baseline_delta",
  "presentation",
  "horizons_doc_url",
  "terrain_product_url",
  "terrain_product_id",
  "citation",
  "software_version",
  "visibility_model",
  "eclipse_model",
  "source_pixel_spacing_m",
  "analysis_resolution_m",
  "time_sample_hours",
  "horizon_azimuth_step_deg",
  "limitations",
] as const;

function siteFields(scenario: ScenarioInput, sites: LunarSite[]): Array<string | number | null> {
  const catalog = sites.find((site) => site.id === scenario.siteId);
  const custom = scenario.customSite;
  return [
    scenario.siteId,
    custom?.name || catalog?.name || "",
    custom?.eastLongitudeDeg ?? catalog?.eastLongitudeDeg ?? "",
    custom?.latitudeDeg ?? catalog?.latitudeDeg ?? "",
    custom?.surfaceHeightM ?? catalog?.surfaceHeightM ?? "",
  ];
}

function row(scenario: ScenarioInput, result: ScenarioResult | undefined, sites: LunarSite[]): string {
  const provenance = result?.provenance;
  const values: Array<string | number | boolean | null | undefined> = [
    scenario.id,
    scenario.name,
    scenario.isBaseline,
    ...siteFields(scenario, sites),
    scenario.arrivalUtc,
    scenario.durationHours,
    scenario.solarPanelHeightM,
    scenario.antennaHeightM,
    scenario.maxSolarInterruptionHours,
    scenario.maxEarthInterruptionHours,
    result ? statusPhrase(result.status) : "",
    result?.statement ?? "",
    result?.sun.accessDurationHours,
    result?.sun.accessPercent,
    result?.sun.longestInterruptionHours,
    result?.sun.longestInterruptionTruncated,
    result?.earth.accessDurationHours,
    result?.earth.accessPercent,
    result?.earth.longestInterruptionHours,
    result?.earth.longestInterruptionTruncated,
    result?.overlapHours,
    result?.overlapPercent,
    result?.limitChecks.map((check) => check.detail).join(" | ") ?? "",
    result?.deltaFromBaseline?.summary ?? "",
    provenance?.presentation ?? "",
    provenance?.horizonsDocUrl ?? "",
    provenance?.terrainProductUrl ?? "",
    provenance?.terrainProductId ?? "",
    provenance?.citation ?? "",
    provenance?.softwareVersion ?? "",
    provenance?.visibilityModel ?? "",
    provenance?.eclipseModel ?? "",
    provenance?.sourcePixelSpacingM,
    provenance?.analysisResolutionM,
    provenance?.timeSampleHours,
    provenance?.horizonAzimuthStepDeg,
    provenance?.limitations.join(" | ") ?? "",
  ];
  return values.map(cell).join(",");
}

/** One row per case. Full samples stay in the JSON export. */
export function scenariosToCsv(
  scenarios: ScenarioInput[],
  results: ScenarioResult[],
  sites: LunarSite[] = [],
): string {
  const byId = new Map(results.map((result) => [result.scenarioId, result]));
  const lines = [HEADERS.join(","), ...scenarios.map((scenario) => row(scenario, byId.get(scenario.id), sites))];
  return `\uFEFF${lines.join("\n")}\n`;
}
