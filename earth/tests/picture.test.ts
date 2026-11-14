import { describe, expect, it } from "vitest";
import { buildDaylightMosaic, daylightUrl } from "../data/earthPicture";

describe("daylight earth picture", () => {
  it("builds only the fixed NASA picture address", () => {
    expect(daylightUrl("MODIS_Terra_CorrectedReflectance_TrueColor", "2026-11-14", 8, 4)).toBe(
      "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=8&HEIGHT=4&TIME=2026-11-14",
    );
  });

  it("joins the sunlit passes and leaves the night side open", () => {
    const width = 8;
    const height = 1;
    const first = blank(width, height);
    paint(first, 0, 200, 40, 40);
    paint(first, 3, 40, 80, 200);
    const later = blank(width, height);
    paint(later, 0, 1, 1, 1);
    paint(later, 1, 20, 180, 60);

    const mosaic = buildDaylightMosaic([first, later], width, height, { maxGap: 3, feather: 0 });

    expect(channel(mosaic, 0, 0)).toBe(200);
    expect(channel(mosaic, 1, 1)).toBe(180);
    expect(channel(mosaic, 2, 1)).toBeGreaterThan(100);
    expect(alpha(mosaic, 2)).toBe(255);
    expect(alpha(mosaic, 4)).toBe(0);
    expect(alpha(mosaic, 7)).toBe(0);
  });

  it("softens the edge where the daylight picture ends", () => {
    const width = 8;
    const height = 1;
    const frame = blank(width, height);
    for (let x = 0; x < 6; x += 1) paint(frame, x, 180, 180, 180);
    const mosaic = buildDaylightMosaic([frame], width, height, { maxGap: 1, feather: 2 });
    expect(alpha(mosaic, 3)).toBe(255);
    expect(alpha(mosaic, 5)).toBeLessThan(255);
    expect(alpha(mosaic, 5)).toBeGreaterThan(0);
    expect(alpha(mosaic, 6)).toBe(0);
  });
});

function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

function paint(frame: Uint8Array, x: number, red: number, green: number, blue: number): void {
  const at = x * 4;
  frame[at] = red;
  frame[at + 1] = green;
  frame[at + 2] = blue;
  frame[at + 3] = 255;
}

function channel(rgba: Uint8Array, x: number, channelIndex: number): number {
  return rgba[x * 4 + channelIndex] ?? 0;
}

function alpha(rgba: Uint8Array, x: number): number {
  return rgba[x * 4 + 3] ?? 0;
}
