import { isIsoDate } from "../../../../../terrestrial/regime";

export const dynamic = "force-dynamic";

const WIDTH = 2048;
const HEIGHT = 1024;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { storedAt: number; body: Uint8Array }>();

/**
 * NASA GIBS VIIRS true-color snapshot for one day.
 * Clouds and storms are in the picture. A future day has no satellite photo yet.
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isIsoDate(date)) {
    return new Response("Use a date like 2026-11-14.", { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) {
    return new Response("No satellite picture for a future day.", { status: 404 });
  }

  const hit = cache.get(date);
  if (hit && Date.now() - hit.storedAt < CACHE_MS) {
    return jpeg(hit.body);
  }

  const url =
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi" +
    "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
    "&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor" +
    "&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180" +
    `&WIDTH=${WIDTH}&HEIGHT=${HEIGHT}&TIME=${date}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return new Response("NASA picture unavailable.", { status: 502 });
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
      return new Response("NASA picture unavailable.", { status: 502 });
    }
    cache.set(date, { storedAt: Date.now(), body });
    while (cache.size > 6) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return jpeg(body);
  } catch {
    return new Response("NASA picture unavailable.", { status: 502 });
  }
}

function jpeg(body: Uint8Array): Response {
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
