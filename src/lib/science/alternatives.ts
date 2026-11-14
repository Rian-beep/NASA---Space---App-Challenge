/**
 * Bounded alternative search. Only the sites and date offsets handed in are
 * evaluated. The result is never described as a global optimum.
 *
 * Order, best first:
 *   1. meets every evaluated interruption limit
 *   2. shorter worst interruption (unknown sorts after a known value)
 *   3. more overlapping Sun and Earth hours (unknown sorts after a known value)
 *   4. smaller plan change: surface distance in kilometres plus |date offset| in hours
 */

import type {
  AlternativeCandidate,
  AlternativeScore,
  AlternativeSearch,
  AnalysisDataset,
  CelestialTarget,
  EphemerisSeries,
  LunarSite,
  ScenarioInput,
} from "./types";
import { BODY_RADIUS_M } from "./constants";
import { LunarDataError, addHours } from "./ephemeris";
import { analyzeScenario, type AnalysisContext } from "./analyze";

/**
 * Hour offsets from the original arrival. The two-day cluster is the small
 * schedule slip. +168 hours is one week later, included because the saved
 * south-pole calculation changes on that step. Still a bounded set.
 */
export const ALTERNATIVE_DATE_OFFSETS_HOURS = [-48, -24, 0, 24, 48, 168] as const;

function describeOffsets(offsets: readonly number[]): string {
  return offsets.map((hours) => (hours > 0 ? `+${hours}` : String(hours))).join(", ");
}

export type EphemerisLookup = (
  site: LunarSite,
  target: CelestialTarget,
  startUtc: string,
  stopUtc: string,
) => EphemerisSeries;

const ORDERING = [
  "meets all evaluated interruption limits",
  "shorter worst interruption",
  "more overlapping Sun and Earth hours",
  "smaller plan change (surface distance in kilometres plus the absolute date offset in hours)",
];

function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}

/** Great-circle distance on the MOON_ME sphere. */
export function surfaceDistanceM(a: LunarSite, b: LunarSite): number {
  const lat1 = (a.latitudeDeg * Math.PI) / 180;
  const lat2 = (b.latitudeDeg * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.eastLongitudeDeg - a.eastLongitudeDeg) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * BODY_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function compareNullable(left: number | null, right: number | null, direction: "asc" | "desc"): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const delta = direction === "asc" ? left - right : right - left;
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

function shortfallText(meetsAllLimits: boolean, detail: string): string | null {
  if (meetsAllLimits) return null;
  return detail;
}

function rankReason(input: {
  meetsAllLimits: boolean;
  score: AlternativeScore;
  distanceKm: number;
  offsetHours: number;
}): string {
  const limits = input.meetsAllLimits
    ? "It meets all evaluated interruption limits"
    : "It does not meet all evaluated interruption limits";
  const worst =
    input.score.worstInterruptionHours === null
      ? "its worst interruption is unknown"
      : `its worst interruption is ${formatHours(input.score.worstInterruptionHours)} hours`;
  const overlap =
    input.score.overlapHours === null
      ? "Sun–Earth overlap is unknown"
      : `Sun–Earth overlap is ${formatHours(input.score.overlapHours)} hours`;
  const plan = `the plan change is ${formatHours(input.score.planChangeScore)} (surface distance ${formatHours(input.distanceKm)} km plus a ${formatHours(Math.abs(input.offsetHours))}-hour date offset)`;
  return `${limits}; ${worst}; ${overlap}; and ${plan}.`;
}

export function findAlternatives(
  baselineInput: ScenarioInput,
  sites: readonly LunarSite[],
  ephemerisLookup: EphemerisLookup,
  terrain: AnalysisDataset,
): AlternativeSearch {
  const baselineSite =
    sites.find((site) => site.id === baselineInput.siteId) ??
    (baselineInput.customSite
      ? {
          id: baselineInput.siteId,
          name: baselineInput.customSite.name,
          kind: "custom" as const,
          eastLongitudeDeg: baselineInput.customSite.eastLongitudeDeg,
          latitudeDeg: baselineInput.customSite.latitudeDeg,
          surfaceHeightM: baselineInput.customSite.surfaceHeightM,
          summary: "Custom analysis location supplied with the baseline.",
        }
      : null);
  if (!baselineSite) {
    throw new LunarDataError(`Baseline site ${baselineInput.siteId} is not in the searched site list.`);
  }
  const ctx: AnalysisContext = {
    sites,
    terrain,
    getEphemeris: ephemerisLookup,
  };
  const drafts = [];
  for (const site of sites) {
    for (const offsetHours of ALTERNATIVE_DATE_OFFSETS_HOURS) {
      const arrivalUtc = addHours(baselineInput.arrivalUtc, offsetHours);
      const scenario: ScenarioInput = {
        id: `${site.id}|${offsetHours}`,
        name: `${site.name} (${offsetHours >= 0 ? "+" : ""}${offsetHours} h)`,
        siteId: site.id,
        arrivalUtc,
        durationHours: baselineInput.durationHours,
        solarPanelHeightM: baselineInput.solarPanelHeightM,
        antennaHeightM: baselineInput.antennaHeightM,
        maxSolarInterruptionHours: baselineInput.maxSolarInterruptionHours,
        maxEarthInterruptionHours: baselineInput.maxEarthInterruptionHours,
        isBaseline: site.id === baselineInput.siteId && offsetHours === 0,
      };
      const result = analyzeScenario(scenario, ctx);
      const distanceKm = surfaceDistanceM(baselineSite, site) / 1000;
      const worstCandidates = [
        result.sun.longestInterruptionHours,
        result.earth.longestInterruptionHours,
      ];
      const worstInterruptionHours = worstCandidates.some((value) => value === null)
        ? null
        : Math.max(worstCandidates[0] as number, worstCandidates[1] as number);
      const meetsAllLimits = result.status === "within_limits";
      const score: AlternativeScore = {
        meetsAllLimits,
        worstInterruptionHours,
        overlapHours: result.overlapHours,
        planChangeScore: distanceKm + Math.abs(offsetHours),
      };
      drafts.push({
        site,
        offsetHours,
        arrivalUtc,
        result,
        score,
        distanceKm,
        meetsAllLimits,
      });
    }
  }
  drafts.sort((left, right) => {
    if (left.meetsAllLimits !== right.meetsAllLimits) return left.meetsAllLimits ? -1 : 1;
    const worst = compareNullable(
      left.score.worstInterruptionHours,
      right.score.worstInterruptionHours,
      "asc",
    );
    if (worst !== 0) return worst;
    const overlap = compareNullable(left.score.overlapHours, right.score.overlapHours, "desc");
    if (overlap !== 0) return overlap;
    const plan = left.score.planChangeScore - right.score.planChangeScore;
    if (plan !== 0) return plan > 0 ? 1 : -1;
    const siteOrder = left.site.id.localeCompare(right.site.id);
    if (siteOrder !== 0) return siteOrder;
    return left.offsetHours - right.offsetHours;
  });
  const anyMeetsLimits = drafts.some((draft) => draft.meetsAllLimits);
  const results: AlternativeCandidate[] = drafts.map((draft, index) => ({
    id: `${draft.site.id}|${draft.offsetHours}`,
    site: draft.site,
    arrivalUtc: draft.arrivalUtc,
    meetsAllLimits: draft.meetsAllLimits,
    rank: index + 1,
    rankReason: rankReason(draft),
    score: draft.score,
    shortfall: shortfallText(
      draft.meetsAllLimits,
      draft.result.limitChecks.map((check) => check.detail).join(" "),
    ),
    result: draft.result,
  }));
  const offsetText = describeOffsets(ALTERNATIVE_DATE_OFFSETS_HOURS);
  const boundsDescription = anyMeetsLimits
    ? `Searched only the ${sites.length} provided sites at date offsets ${offsetText} hours, with the same ${baselineInput.durationHours}-hour duration and the same user-assumption interruption limits. This is a bounded set, not a global optimum.`
    : `No searched option meets all evaluated limits. Searched only the ${sites.length} provided sites at date offsets ${offsetText} hours, with the same ${baselineInput.durationHours}-hour duration and the same user-assumption interruption limits. Results are the least-violating options in that bounded set, not a global optimum.`;
  return {
    boundsDescription,
    candidateCount: results.length,
    dateOffsetsHours: [...ALTERNATIVE_DATE_OFFSETS_HOURS],
    sitesSearched: [...sites],
    ordering: [...ORDERING],
    anyMeetsLimits,
    limitedSearch: true,
    results,
  };
}
