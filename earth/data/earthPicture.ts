import { crc32, deflateSync } from "node:zlib";

/** Daylight pictures that together cover the sunlit Earth. Fixed NASA layer names. */
export const DAYLIGHT_LAYERS = [
  "MODIS_Terra_CorrectedReflectance_TrueColor",
  "MODIS_Aqua_CorrectedReflectance_TrueColor",
  "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
] as const;

const HOST = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/** One NASA world picture for a calendar day. The date is already checked. */
export function daylightUrl(layer: (typeof DAYLIGHT_LAYERS)[number], date: string, width: number, height: number): string {
  return (
    `${HOST}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${layer}&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180` +
    `&WIDTH=${width}&HEIGHT=${height}&TIME=${date}`
  );
}

/**
 * Stack the day's daylight pictures. Empty black gaps between passes are closed.
 * The night side stays transparent so the base globe can show through.
 */
export function buildDaylightMosaic(
  frames: readonly Uint8Array[],
  width: number,
  height: number,
  options?: { maxGap?: number; feather?: number },
): Uint8Array {
  const maxGap = options?.maxGap ?? 24;
  const feather = options?.feather ?? 16;
  const count = width * height;
  const rgb = new Uint8Array(count * 3);
  const filled = new Uint8Array(count);

  for (const frame of frames) {
    if (frame.length !== count * 4) continue;
    for (let i = 0; i < count; i += 1) {
      if (filled[i]) continue;
      const at = i * 4;
      const red = frame[at] ?? 0;
      const green = frame[at + 1] ?? 0;
      const blue = frame[at + 2] ?? 0;
      if (red <= 8 && green <= 8 && blue <= 8) continue;
      const out = i * 3;
      rgb[out] = red;
      rgb[out + 1] = green;
      rgb[out + 2] = blue;
      filled[i] = 1;
    }
  }

  closeGaps(rgb, filled, width, height, maxGap);
  return withFeather(rgb, filled, width, height, feather);
}

export function encodeRgbaPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("Earth picture unavailable");
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

function closeGaps(rgb: Uint8Array, filled: Uint8Array, width: number, height: number, maxGap: number): void {
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      if (filled[row + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && !filled[row + x]) x += 1;
      const end = x;
      if (start > 0 && end < width && end - start <= maxGap) {
        blend(rgb, filled, row, start - 1, end, start, end);
      }
    }
    let prefix = 0;
    while (prefix < width && !filled[row + prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < width && !filled[row + width - 1 - suffix]) suffix += 1;
    if (prefix > 0 && suffix > 0 && prefix + suffix <= maxGap && prefix + suffix < width) {
      blendWrap(rgb, filled, row, width, prefix, suffix);
    }
  }
}

function blend(
  rgb: Uint8Array,
  filled: Uint8Array,
  row: number,
  left: number,
  right: number,
  start: number,
  end: number,
): void {
  const gap = end - start;
  for (let step = 0; step < gap; step += 1) {
    const mix = (step + 1) / (gap + 1);
    paint(rgb, filled, row + start + step, row + left, row + right, mix);
  }
}

function blendWrap(
  rgb: Uint8Array,
  filled: Uint8Array,
  row: number,
  width: number,
  prefix: number,
  suffix: number,
): void {
  const gap = prefix + suffix;
  const left = row + width - suffix - 1;
  const right = row + prefix;
  for (let step = 0; step < gap; step += 1) {
    const mix = (step + 1) / (gap + 1);
    const index = step < suffix ? width - suffix + step : step - suffix;
    paint(rgb, filled, row + index, left, right, mix);
  }
}

function paint(
  rgb: Uint8Array,
  filled: Uint8Array,
  index: number,
  left: number,
  right: number,
  mix: number,
): void {
  const at = index * 3;
  const from = left * 3;
  const to = right * 3;
  rgb[at] = Math.round((rgb[from] ?? 0) + ((rgb[to] ?? 0) - (rgb[from] ?? 0)) * mix);
  rgb[at + 1] = Math.round((rgb[from + 1] ?? 0) + ((rgb[to + 1] ?? 0) - (rgb[from + 1] ?? 0)) * mix);
  rgb[at + 2] = Math.round((rgb[from + 2] ?? 0) + ((rgb[to + 2] ?? 0) - (rgb[from + 2] ?? 0)) * mix);
  filled[index] = 1;
}

function withFeather(
  rgb: Uint8Array,
  filled: Uint8Array,
  width: number,
  height: number,
  feather: number,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!filled[index]) continue;
      let dist = Math.max(feather, 1);
      for (let step = 1; step <= feather; step += 1) {
        const left = filled[y * width + ((x - step + width) % width)] ?? 0;
        const right = filled[y * width + ((x + step) % width)] ?? 0;
        const up = y - step >= 0 ? (filled[(y - step) * width + x] ?? 0) : 1;
        const down = y + step < height ? (filled[(y + step) * width + x] ?? 0) : 1;
        if (!left || !right || !up || !down) {
          dist = step;
          break;
        }
      }
      const at = index * 3;
      const pixel = index * 4;
      out[pixel] = rgb[at] ?? 0;
      out[pixel + 1] = rgb[at + 1] ?? 0;
      out[pixel + 2] = rgb[at + 2] ?? 0;
      out[pixel + 3] = feather <= 0 ? 255 : Math.round((dist / feather) * 255);
    }
  }
  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}
