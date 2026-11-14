import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { solarSurfacePng } from "../data/sunMap";
import { carringtonFitsUrl, carringtonMapUrl, carringtonRotations } from "../data/sunSurface";

const PAGE = `
{"AIA0171":{"fits":["CR1000.fits"]},"AIA0193":{"fits":["CR2311.fits","CR2310.fits","CR2309.fits"]}}
`;

describe("carrington surface map", () => {
  it("reads the newest full-surface maps first", () => {
    expect(carringtonRotations(PAGE)).toEqual(["CR2311", "CR2310", "CR2309"]);
    expect(carringtonRotations("no maps")).toEqual([]);
  });

  it("only builds the fixed NASA path", () => {
    expect(carringtonMapUrl("CR2311")).toBe(
      "https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0193/CR2311.png",
    );
    expect(() => carringtonMapUrl("../secret")).toThrow();
    expect(carringtonFitsUrl("CR2311")).toBe(
      "https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0193/CR2311.fits",
    );
    expect(() => carringtonFitsUrl("../secret")).toThrow();
  });

  it("paints a full-resolution map with the bright gas lighter than the dim gas", () => {
    const png = solarSurfacePng(syntheticFits(4, 2, [20, 20, 20, 20, 800, Number.NaN, 800, 800]));
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(4);
    expect(view.getUint32(20)).toBe(2);
    const raw = inflatePng(png);
    const north = raw[1] ?? 0;
    const south = raw[1 + 4 * 3] ?? 0;
    expect(north).toBeGreaterThan(180);
    expect(north).toBeGreaterThan(south + 40);
  });
});

function syntheticFits(width: number, height: number, values: number[]): Uint8Array {
  const cards = [
    "SIMPLE  =                    T",
    "BITPIX  =                  -64",
    "NAXIS   =                    2",
    `NAXIS1  = ${String(width).padStart(20)}`,
    `NAXIS2  = ${String(height).padStart(20)}`,
    "END",
  ];
  let header = cards.map((card) => card.padEnd(80, " ")).join("");
  while (header.length % 2880 !== 0) header += " ".repeat(80);
  const body = new Uint8Array(width * height * 8);
  const view = new DataView(body.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, false));
  const out = new Uint8Array(header.length + body.length);
  out.set(new TextEncoder().encode(header), 0);
  out.set(body, header.length);
  return out;
}

function inflatePng(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset + 8 < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(png[offset + 4] ?? 0, png[offset + 5] ?? 0, png[offset + 6] ?? 0, png[offset + 7] ?? 0);
    if (type === "IDAT") return inflateSync(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  throw new Error("missing image");
}
