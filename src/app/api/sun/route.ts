import { readSun } from "../../../../terrestrial/flares";

export const dynamic = "force-dynamic";

const FLARES_URL = "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json";
const XRAYS_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json";
const CACHE_MS = 5 * 60 * 1000;

const hits: number[] = [];
let cache: { storedAt: number; body: SunResponse } | null = null;

interface SunResponse {
  currentClass: string | null;
  currentScale: string;
  flux: number | null;
  recent: unknown[];
  sentence: string;
  retrievedAtUtc: string;
  sourceName: string;
  sourceUrl: string;
  caveat: string;
}

function tooManyRequests(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 30) return true;
  hits.push(now);
  return false;
}

export async function GET() {
  if (tooManyRequests()) {
    return Response.json(
      { error: "Too many Sun reads. Wait a minute and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (cache && Date.now() - cache.storedAt < CACHE_MS) {
    return Response.json(cache.body, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  try {
    const [fluxResponse, flareResponse] = await Promise.all([
      fetch(XRAYS_URL, { signal: AbortSignal.timeout(12_000) }),
      fetch(FLARES_URL, { signal: AbortSignal.timeout(12_000) }),
    ]);
    if (!fluxResponse.ok || !flareResponse.ok) {
      return Response.json({ error: "The Sun read failed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const reading = readSun(await fluxResponse.json(), await flareResponse.json());
    const body: SunResponse = {
      ...reading,
      retrievedAtUtc: new Date().toISOString(),
      sourceName: "NOAA SWPC GOES X-ray",
      sourceUrl: FLARES_URL,
      caveat:
        "A flare can disturb radio as the signal passes through the air above a dish. This is not a promise the call works or fails.",
    };
    cache = { storedAt: Date.now(), body };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "The Sun read failed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
