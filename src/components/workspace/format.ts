import type {
  LunarSite,
  Provenance,
  ScenarioInput,
  VerdictStatus,
} from "@/lib/science/types";
import { STATUS_PHRASE } from "./copy";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function statusPhrase(status: VerdictStatus): string {
  return STATUS_PHRASE[status];
}

export function presentationLabel(presentation: Provenance["presentation"] | undefined): string {
  if (presentation === "cached Horizons response") return "Cached Horizons response";
  return "Precomputed from NASA data";
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  const text = Math.abs(value).toFixed(1);
  return value < 0 ? `−${text} h` : `${text} h`;
}

export function formatSignedHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  const text = Math.abs(value).toFixed(1);
  if (value > 0) return `+${text} h`;
  if (value < 0) return `−${text} h`;
  return "0.0 h";
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  return `${value.toFixed(1)}%`;
}

export function formatMetres(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  return `${value} m`;
}

export function formatDegrees(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  return `${value.toFixed(1)}°`;
}

export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const date = new Date(parsed);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function addHours(isoUtc: string, hours: number): string {
  const parsed = Date.parse(isoUtc);
  if (Number.isNaN(parsed) || !Number.isFinite(hours)) return isoUtc;
  return new Date(parsed + hours * 3_600_000).toISOString().replace(".000Z", "Z");
}

export function isoToDatetimeLocalValue(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  const date = new Date(parsed);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function datetimeLocalValueToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function siteLabel(scenario: ScenarioInput, sites: LunarSite[]): string {
  if (scenario.siteId === "custom") {
    const name = scenario.customSite?.name?.trim();
    return name || "Custom location";
  }
  return sites.find((site) => site.id === scenario.siteId)?.name ?? "this place";
}

export function siteCoordinates(
  scenario: ScenarioInput,
  sites: LunarSite[],
): { eastLongitudeDeg: number; latitudeDeg: number; surfaceHeightM: number } | null {
  if (scenario.siteId === "custom") {
    const site = scenario.customSite;
    if (!site) return null;
    if (!Number.isFinite(site.eastLongitudeDeg) || !Number.isFinite(site.latitudeDeg)) {
      return null;
    }
    return {
      eastLongitudeDeg: site.eastLongitudeDeg,
      latitudeDeg: site.latitudeDeg,
      surfaceHeightM: site.surfaceHeightM,
    };
  }
  const site = sites.find((item) => item.id === scenario.siteId);
  if (!site) return null;
  return {
    eastLongitudeDeg: site.eastLongitudeDeg,
    latitudeDeg: site.latitudeDeg,
    surfaceHeightM: site.surfaceHeightM,
  };
}

export function newId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function scenarioProblem(scenario: ScenarioInput): string | null {
  if (!scenario.arrivalUtc || Number.isNaN(Date.parse(scenario.arrivalUtc))) {
    return "Enter an arrival time in UTC.";
  }
  if (!(scenario.durationHours > 0) || !Number.isFinite(scenario.durationHours)) {
    return "Duration must be longer than 0 hours.";
  }
  if (!Number.isFinite(scenario.solarPanelHeightM) || scenario.solarPanelHeightM < 0) {
    return "Solar-panel height must be zero or a positive number of metres.";
  }
  if (!Number.isFinite(scenario.antennaHeightM) || scenario.antennaHeightM < 0) {
    return "Antenna height must be zero or a positive number of metres.";
  }
  if (
    !Number.isFinite(scenario.maxSolarInterruptionHours) ||
    scenario.maxSolarInterruptionHours < 0
  ) {
    return "The solar interruption limit must be zero or a positive number of hours.";
  }
  if (
    !Number.isFinite(scenario.maxEarthInterruptionHours) ||
    scenario.maxEarthInterruptionHours < 0
  ) {
    return "The Earth interruption limit must be zero or a positive number of hours.";
  }
  if (scenario.siteId === "custom") {
    const site = scenario.customSite;
    if (
      !site ||
      !Number.isFinite(site.eastLongitudeDeg) ||
      !Number.isFinite(site.latitudeDeg) ||
      !Number.isFinite(site.surfaceHeightM)
    ) {
      return "Enter a longitude and a latitude inside the supported area.";
    }
    if (site.eastLongitudeDeg < -180 || site.eastLongitudeDeg > 360) {
      return "Longitude must be between −180 and 360 degrees.";
    }
    if (site.latitudeDeg < -90 || site.latitudeDeg > 90) {
      return "Latitude must be between −90 and 90 degrees.";
    }
  }
  return null;
}
