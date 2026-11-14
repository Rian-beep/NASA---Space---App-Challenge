/** NOAA GOES X-ray flare readings. No key. */

export type FlareScale = "A" | "B" | "C" | "M" | "X" | "unknown";

export interface SolarFlare {
  beginUtc: string;
  maxUtc: string;
  endUtc: string | null;
  maxClass: string;
  scale: FlareScale;
  ongoing: boolean;
}

export interface SunReading {
  currentClass: string | null;
  currentScale: FlareScale;
  flux: number | null;
  recent: SolarFlare[];
  sentence: string;
}

const SCALE_RANK: Record<FlareScale, number> = {
  unknown: 0,
  A: 1,
  B: 2,
  C: 3,
  M: 4,
  X: 5,
};

/** GOES 0.1–0.8 nm flux in watts per square metre, as a class such as C2.4. */
export function classFromFlux(flux: number): { label: string; scale: FlareScale } {
  if (!Number.isFinite(flux) || flux <= 0) return { label: "unknown", scale: "unknown" };
  const bands: Array<[FlareScale, number]> = [
    ["X", 1e-4],
    ["M", 1e-5],
    ["C", 1e-6],
    ["B", 1e-7],
    ["A", 1e-8],
  ];
  for (const [scale, floor] of bands) {
    if (flux >= floor) return { label: `${scale}${(flux / floor).toFixed(1)}`, scale };
  }
  return { label: `A${(flux / 1e-8).toFixed(1)}`, scale: "A" };
}

export function scaleOfClass(label: string): FlareScale {
  const letter = label.trim().charAt(0).toUpperCase();
  if (letter === "A" || letter === "B" || letter === "C" || letter === "M" || letter === "X") return letter;
  return "unknown";
}

export function flareSentence(scale: FlareScale): string {
  if (scale === "X" || scale === "M") {
    return "A strong solar flare is in the latest reading. On the sunlit side of Earth it can make a radio signal flicker or drop as it passes through the air. This does not say the dish call will fail.";
  }
  if (scale === "C") {
    return "A small solar flare is in the latest reading. It rarely changes the link from a dish to the Moon.";
  }
  if (scale === "unknown") {
    return "The latest solar X-ray reading did not come through.";
  }
  return "The Sun is quiet in the latest X-ray reading. No strong flare is showing.";
}

export function parseXrayFlux(payload: unknown, nowMs = Date.now()): { flux: number | null; timeUtc: string | null } {
  if (!Array.isArray(payload)) return { flux: null, timeUtc: null };
  let best: { flux: number; timeUtc: string; timeMs: number } | null = null;
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const energy = (row as { energy?: unknown }).energy;
    if (energy !== "0.1-0.8nm") continue;
    const flux = (row as { flux?: unknown }).flux;
    const timeUtc = (row as { time_tag?: unknown }).time_tag;
    if (typeof flux !== "number" || !Number.isFinite(flux) || typeof timeUtc !== "string") continue;
    const timeMs = Date.parse(timeUtc);
    if (!Number.isFinite(timeMs) || timeMs > nowMs + 5 * 60_000) continue;
    if (!best || timeMs > best.timeMs) best = { flux, timeUtc, timeMs };
  }
  return best ? { flux: best.flux, timeUtc: best.timeUtc } : { flux: null, timeUtc: null };
}

export function parseRecentFlares(payload: unknown, nowMs = Date.now()): SolarFlare[] {
  if (!Array.isArray(payload)) return [];
  const flares: SolarFlare[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const maxClass = (row as { max_class?: unknown }).max_class;
    const begin = (row as { begin_time?: unknown }).begin_time;
    const max = (row as { max_time?: unknown }).max_time;
    const end = (row as { end_time?: unknown }).end_time;
    if (typeof maxClass !== "string" || typeof begin !== "string" || typeof max !== "string") continue;
    const endUtc = typeof end === "string" && end.length > 0 ? end : null;
    const endMs = endUtc ? Date.parse(endUtc) : NaN;
    flares.push({
      beginUtc: toIso(begin),
      maxUtc: toIso(max),
      endUtc: endUtc ? toIso(endUtc) : null,
      maxClass,
      scale: scaleOfClass(maxClass),
      ongoing: !Number.isFinite(endMs) || endMs >= nowMs - 15 * 60_000,
    });
  }
  return flares
    .sort((a, b) => SCALE_RANK[b.scale] - SCALE_RANK[a.scale] || b.maxUtc.localeCompare(a.maxUtc))
    .slice(0, 6);
}

export function readSun(fluxPayload: unknown, flarePayload: unknown, nowMs = Date.now()): SunReading {
  const parsed = parseXrayFlux(fluxPayload, nowMs);
  const current = classFromFlux(parsed.flux ?? NaN);
  const recent = parseRecentFlares(flarePayload, nowMs);
  const ongoing = recent.find((flare) => flare.ongoing);
  const scale = ongoing ? rankHigher(current.scale, ongoing.scale) : current.scale;
  return {
    currentClass: current.scale === "unknown" ? null : current.label,
    currentScale: scale,
    flux: parsed.flux,
    recent,
    sentence: flareSentence(scale),
  };
}

function rankHigher(a: FlareScale, b: FlareScale | undefined): FlareScale {
  if (!b) return a;
  return SCALE_RANK[b] > SCALE_RANK[a] ? b : a;
}

function toIso(value: string): string {
  const parsed = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString();
}
