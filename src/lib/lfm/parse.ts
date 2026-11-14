import {
  LFM_CHECKPOINT,
  LFM_EXTENT_NOTE,
  LFM_LIMITATIONS,
  LFM_MODEL_ID,
  LFM_SOURCE_URLS,
  type LfmSiteContext,
} from "./types";

const MISSING_STATEMENT =
  "No lunar foundation model output is stored for this site. No prospectivity number is available.";

const REJECTED_STATEMENT =
  "A stored prospectivity value was rejected because it was not a finite number in the closed interval from 0 to 1. No prospectivity number is available.";

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function asStringList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return [...fallback];
  }
  return value;
}

export function insufficientLfmContext(
  siteId: string,
  statement: string = MISSING_STATEMENT,
): LfmSiteContext {
  return {
    status: "insufficient_data",
    modelId: LFM_MODEL_ID,
    checkpoint: LFM_CHECKPOINT,
    license: "Apache-2.0",
    task: "polar_ice_prospectivity_regression",
    siteId,
    value: null,
    patchMean: null,
    resolutionM: 240,
    extentNote: LFM_EXTENT_NOTE,
    retrievedAtUtc: null,
    sourceUrls: [...LFM_SOURCE_URLS],
    limitations: [...LFM_LIMITATIONS],
    statement,
  };
}

function parseOne(key: string, entry: unknown): LfmSiteContext {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return insufficientLfmContext(
      key,
      "The stored lunar foundation context for this site is unreadable. No prospectivity number is available.",
    );
  }

  const raw = entry as Record<string, unknown>;
  const siteId = typeof raw.siteId === "string" && raw.siteId.length > 0 ? raw.siteId : key;
  const status = raw.status;
  const knownStatus =
    status === "ready" || status === "insufficient_data" || status === "outside_extent"
      ? status
      : "insufficient_data";
  const valueOk = raw.value === null || isUnitInterval(raw.value);
  const patchOk =
    raw.patchMean === null || raw.patchMean === undefined || isUnitInterval(raw.patchMean);
  const readyHasValue = knownStatus !== "ready" || isUnitInterval(raw.value);

  const shared = {
    modelId: typeof raw.modelId === "string" && raw.modelId ? raw.modelId : LFM_MODEL_ID,
    checkpoint:
      typeof raw.checkpoint === "string" && raw.checkpoint ? raw.checkpoint : LFM_CHECKPOINT,
    license: "Apache-2.0" as const,
    task: "polar_ice_prospectivity_regression" as const,
    siteId,
    resolutionM: 240 as const,
    extentNote:
      typeof raw.extentNote === "string" && raw.extentNote ? raw.extentNote : LFM_EXTENT_NOTE,
    retrievedAtUtc: typeof raw.retrievedAtUtc === "string" ? raw.retrievedAtUtc : null,
    sourceUrls: asStringList(raw.sourceUrls, LFM_SOURCE_URLS),
    limitations: asStringList(raw.limitations, LFM_LIMITATIONS),
  };

  if (!valueOk || !patchOk || !readyHasValue) {
    return {
      ...shared,
      status: "insufficient_data",
      value: null,
      patchMean: null,
      statement: REJECTED_STATEMENT,
    };
  }

  const statement =
    typeof raw.statement === "string" && raw.statement
      ? raw.statement
      : knownStatus === "ready"
        ? "Polar ice-prospectivity model output is attached for this site. It is not measured ice."
        : MISSING_STATEMENT;

  if (knownStatus !== "ready" || !isUnitInterval(raw.value)) {
    return {
      ...shared,
      status: knownStatus === "ready" ? "insufficient_data" : knownStatus,
      value: null,
      patchMean: null,
      statement,
    };
  }

  const value = raw.value;
  const patchMean = raw.patchMean;
  return {
    ...shared,
    status: "ready",
    value,
    patchMean: isUnitInterval(patchMean) ? patchMean : null,
    statement,
  };
}

/** Validate a fixture object. Out-of-range numbers are dropped, never clamped. */
export function parseLfmContexts(raw: unknown): Record<string, LfmSiteContext> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const contexts: Record<string, LfmSiteContext> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const context = parseOne(key, entry);
    contexts[context.siteId] = context;
  }
  return contexts;
}

