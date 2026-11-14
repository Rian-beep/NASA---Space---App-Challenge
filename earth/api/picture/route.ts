import { decode } from "jpeg-js";
import { DAYLIGHT_LAYERS, buildDaylightMosaic, daylightUrl, encodeRgbaPng } from "../../data/earthPicture";
import { isIsoDate } from "../../data/regime";

export const dynamic = "force-dynamic";

const WIDTH = 2048;
const HEIGHT = 1024;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { storedAt: number; body: Uint8Array }>();

/**
 * The sunlit Earth for one day, joined from NASA's daylight satellite passes.
 * A future day has no satellite photo yet. The night side is left open.
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
  if (hit && Date.now() - hit.storedAt < CACHE_MS) return png(hit.body);

  try {
    const frames = await Promise.all(DAYLIGHT_LAYERS.map((layer) => readLayer(layer, date)));
    const present = frames.filter((frame): frame is Uint8Array => frame !== null);
    if (present.length === 0) return new Response("NASA picture unavailable.", { status: 502 });
    const body = encodeRgbaPng(buildDaylightMosaic(present, WIDTH, HEIGHT), WIDTH, HEIGHT);
    cache.set(date, { storedAt: Date.now(), body });
    while (cache.size > 6) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return png(body);
  } catch {
    return new Response("NASA picture unavailable.", { status: 502 });
  }
}

async function readLayer(layer: (typeof DAYLIGHT_LAYERS)[number], date: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(daylightUrl(layer, date, WIDTH, HEIGHT), { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
    const image = decode(body, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true });
    if (image.width !== WIDTH || image.height !== HEIGHT) return null;
    return image.data;
  } catch {
    return null;
  }
}

function png(body: Uint8Array): Response {
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
