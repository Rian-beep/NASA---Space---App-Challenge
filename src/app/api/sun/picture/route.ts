export const dynamic = "force-dynamic";

/** NASA SDO AIA 193 latest full-disk image. Hot plasma and flares show as bright regions. */
const SDO_URL = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg";
const CACHE_MS = 10 * 60 * 1000;

const hits: number[] = [];
let cache: { storedAt: number; body: Uint8Array } | null = null;

function tooManyRequests(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 30) return true;
  hits.push(now);
  return false;
}

export async function GET() {
  if (tooManyRequests()) {
    return new Response("Too many Sun pictures. Wait a minute and try again.", {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (cache && Date.now() - cache.storedAt < CACHE_MS) return jpeg(cache.body);

  try {
    const response = await fetch(SDO_URL, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return new Response("NASA picture unavailable.", { status: 502 });
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
      return new Response("NASA picture unavailable.", { status: 502 });
    }
    cache = { storedAt: Date.now(), body };
    return jpeg(body);
  } catch {
    return new Response("NASA picture unavailable.", { status: 502 });
  }
}

function jpeg(body: Uint8Array): Response {
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=600",
    },
  });
}
