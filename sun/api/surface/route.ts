import { solarSurfacePng } from "../../data/sunMap";
import { carringtonFitsUrl, carringtonMapUrl, carringtonRotations } from "../../data/sunSurface";

export const dynamic = "force-dynamic";

const PAGE_URL = "https://sdo.gsfc.nasa.gov/data/synoptic/";
const CACHE_MS = 6 * 60 * 60 * 1000;

const hits: number[] = [];
let cache: { storedAt: number; body: Uint8Array } | null = null;

function tooManyRequests(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 30) return true;
  hits.push(now);
  return false;
}

function isPng(body: Uint8Array): boolean {
  return body.length > 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
}

export async function GET() {
  if (tooManyRequests()) {
    return new Response("Too many Sun maps. Wait a minute and try again.", {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (cache && Date.now() - cache.storedAt < CACHE_MS) return png(cache.body);

  try {
    const page = await fetch(PAGE_URL, { signal: AbortSignal.timeout(20_000) });
    if (!page.ok) return new Response("NASA surface map unavailable.", { status: 502 });
    const rotations = carringtonRotations(await page.text());
    const detailed = await readDetailedMap(rotations);
    if (detailed) {
      cache = { storedAt: Date.now(), body: detailed };
      return png(detailed);
    }
    for (const rotation of rotations) {
      const response = await fetch(carringtonMapUrl(rotation), { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) continue;
      const body = new Uint8Array(await response.arrayBuffer());
      if (!isPng(body)) continue;
      cache = { storedAt: Date.now(), body };
      return png(body);
    }
    return new Response("NASA surface map unavailable.", { status: 502 });
  } catch {
    return new Response("NASA surface map unavailable.", { status: 502 });
  }
}

async function readDetailedMap(rotations: string[]): Promise<Uint8Array | null> {
  for (const rotation of rotations) {
    try {
      const response = await fetch(carringtonFitsUrl(rotation), { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) continue;
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.length < 2880 || body[0] !== 0x53) continue;
      return solarSurfacePng(body);
    } catch {
      continue;
    }
  }
  return null;
}

function png(body: Uint8Array): Response {
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=21600",
    },
  });
}
