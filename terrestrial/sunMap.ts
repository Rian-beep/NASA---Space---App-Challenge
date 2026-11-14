import { crc32, deflateSync } from "node:zlib";

const MAX_PIXELS = 8192 * 4096;

const STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 18, 2, 0],
  [0.08, 40, 6, 0],
  [0.16, 64, 16, 1],
  [0.28, 96, 36, 5],
  [0.42, 126, 63, 15],
  [0.55, 148, 86, 28],
  [0.68, 168, 112, 49],
  [0.8, 190, 140, 78],
  [0.9, 210, 170, 115],
  [1, 244, 228, 200],
];

const GOLD = goldRamp();

/** Turn a NASA AIA synoptic FITS file into a north-up equirectangular PNG. */
export function solarSurfacePng(fits: Uint8Array): Uint8Array {
  const image = readFitsImage(fits);
  fillGaps(image.values, image.width, image.height);
  const rgb = toneMappedRgb(image.values, image.width, image.height);
  return encodeRgbPng(rgb, image.width, image.height);
}

export function readFitsImage(fits: Uint8Array): { width: number; height: number; values: Float64Array } {
  const header = readHeader(fits);
  const bitpix = integerCard(header.cards, "BITPIX");
  const naxis = integerCard(header.cards, "NAXIS");
  const width = integerCard(header.cards, "NAXIS1");
  const height = integerCard(header.cards, "NAXIS2");
  if (naxis !== 2 || (bitpix !== -64 && bitpix !== -32)) {
    throw new Error("Sun surface unavailable");
  }
  if (width < 2 || height < 2 || width * height > MAX_PIXELS) {
    throw new Error("Sun surface unavailable");
  }
  const bytesPer = bitpix === -64 ? 8 : 4;
  if (header.dataStart + width * height * bytesPer > fits.byteLength) {
    throw new Error("Sun surface unavailable");
  }
  const view = new DataView(fits.buffer, fits.byteOffset, fits.byteLength);
  const values = new Float64Array(width * height);
  for (let i = 0; i < values.length; i += 1) {
    const at = header.dataStart + i * bytesPer;
    values[i] = bitpix === -64 ? view.getFloat64(at, false) : view.getFloat32(at, false);
  }
  return { width, height, values };
}

/** Replace missing samples with the nearest measured value in the same longitude. */
export function fillGaps(values: Float64Array, width: number, height: number): void {
  for (let x = 0; x < width; x += 1) {
    let seen = Number.NaN;
    for (let y = 0; y < height; y += 1) {
      const i = y * width + x;
      const value = values[i] ?? Number.NaN;
      if (Number.isFinite(value)) seen = value;
      else if (Number.isFinite(seen)) values[i] = seen;
    }
    seen = Number.NaN;
    for (let y = height - 1; y >= 0; y -= 1) {
      const i = y * width + x;
      const value = values[i] ?? Number.NaN;
      if (Number.isFinite(value)) seen = value;
      else if (Number.isFinite(seen)) values[i] = seen;
    }
  }
}

/** Gold picture of the map. The first row is the north edge. */
export function toneMappedRgb(values: Float64Array, width: number, height: number): Uint8Array {
  const [low, high] = logRange(values);
  const span = high - low || 1;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const value = values[sourceRow * width + x] ?? 0;
      const log = Number.isFinite(value) && value > 0 ? Math.log10(value) : low;
      const stretched = Math.min(1, Math.max(0, (log - low) / span));
      const index = Math.round(stretched ** 0.85 * 255) * 3;
      const at = (y * width + x) * 3;
      rgb[at] = GOLD[index] ?? 0;
      rgb[at + 1] = GOLD[index + 1] ?? 0;
      rgb[at + 2] = GOLD[index + 2] ?? 0;
    }
  }
  return rgb;
}

export function encodeRgbPng(rgb: Uint8Array, width: number, height: number): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error("Sun surface unavailable");
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 3 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

function logRange(values: Float64Array): [number, number] {
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(values.length / 24000));
  for (let i = 0; i < values.length; i += stride) {
    const value = values[i] ?? 0;
    if (value > 0 && Number.isFinite(value)) sample.push(Math.log10(value));
  }
  if (sample.length < 2) throw new Error("Sun surface unavailable");
  sample.sort((a, b) => a - b);
  const low = sampleAt(sample, 0.01);
  const high = sampleAt(sample, 0.995);
  return high > low ? [low, high] : [low, low + 1];
}

function sampleAt(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const start = sorted[low] ?? 0;
  const end = sorted[high] ?? start;
  return start + (end - start) * (index - low);
}

function readHeader(fits: Uint8Array): { dataStart: number; cards: Map<string, string> } {
  const cards = new Map<string, string>();
  const text = new TextDecoder("latin1").decode(fits.subarray(0, Math.min(fits.length, 2880 * 8)));
  for (let block = 0; block * 2880 < text.length; block += 1) {
    for (let card = 0; card < 36; card += 1) {
      const at = block * 2880 + card * 80;
      const line = text.slice(at, at + 80);
      if (line.startsWith("END")) return { dataStart: (block + 1) * 2880, cards };
      const name = line.slice(0, 8).trim();
      if (name && line[8] === "=") cards.set(name, cardValue(line.slice(9)));
    }
  }
  throw new Error("Sun surface unavailable");
}

function cardValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    return end > 1 ? trimmed.slice(1, end) : trimmed;
  }
  const slash = trimmed.indexOf("/");
  return (slash >= 0 ? trimmed.slice(0, slash) : trimmed).trim();
}

function integerCard(cards: Map<string, string>, name: string): number {
  const value = Number(cards.get(name));
  if (!Number.isInteger(value)) throw new Error("Sun surface unavailable");
  return value;
}

function goldRamp(): Uint8Array {
  const ramp = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let start = STOPS[0] ?? [0, 0, 0, 0];
    let end = STOPS[STOPS.length - 1] ?? start;
    for (let stop = 1; stop < STOPS.length; stop += 1) {
      const next = STOPS[stop];
      if (next && t <= next[0]) {
        start = STOPS[stop - 1] ?? start;
        end = next;
        break;
      }
    }
    const span = (end[0] ?? 1) - (start[0] ?? 0) || 1;
    const mix = Math.min(1, Math.max(0, (t - (start[0] ?? 0)) / span));
    ramp[i * 3] = Math.round((start[1] ?? 0) + ((end[1] ?? 0) - (start[1] ?? 0)) * mix);
    ramp[i * 3 + 1] = Math.round((start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * mix);
    ramp[i * 3 + 2] = Math.round((start[3] ?? 0) + ((end[3] ?? 0) - (start[3] ?? 0)) * mix);
  }
  return ramp;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}
