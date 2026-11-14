import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LunarDataError,
  altitudeKilometres,
  buildHorizonsParams,
  cacheKey,
  formatSiteCoord,
  interpolateAzimuth,
  parseHorizonsJson,
  unwrapAzimuthDegrees,
} from "@/lib/science/ephemeris";
import type { EphemerisSample } from "@/lib/science/types";

const meta = {
  target: "sun" as const,
  siteId: "example-a",
  request: { COMMAND: "10", CENTER: "coord@301" },
  retrievedAtUtc: "2026-11-14T10:05:00Z",
  source: "horizons_cache" as const,
};

describe("Horizons parser", () => {
  it("accepts the saved authentic Sun JSON and keeps its samples", () => {
    const payload = JSON.parse(
      readFileSync("data/raw/horizons/example-a_sun.json", "utf8"),
    ) as { signature: { version: string }; result: string };
    const series = parseHorizonsJson(payload, meta);
    expect(series.apiVersion).toBe("1.2");
    expect(series.samples.length).toBeGreaterThan(2000);
    const table = payload.result.split("$$SOE")[1].split("$$EOE")[0];
    const first = table.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
    expect(first).toBeTruthy();
    const cells = first!.split(",");
    expect(series.samples[0].azimuthDeg).toBeCloseTo(Number(cells[3]), 6);
    expect(series.samples[0].elevationDeg).toBeCloseTo(Number(cells[4]), 6);
    expect(series.samples[0].timeUtc).toBe("2026-11-01T00:00:00Z");
    const elevations = series.samples.map((sample) => sample.elevationDeg);
    const unique = new Set(elevations.map((value) => value.toFixed(3)));
    expect(unique.size).toBeGreaterThan(10);
  });

  it("rejects an error payload instead of inventing a series", () => {
    expect(() =>
      parseHorizonsJson(
        { signature: { version: "1.2" }, error: "unknown target", result: null },
        meta,
      ),
    ).toThrow(LunarDataError);
    expect(() =>
      parseHorizonsJson(
        {
          signature: { version: "1.2" },
          result:
            " Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),\n$$SOE\n2026-Dec-01 00:00,*,i, n.a., 1.0,\n$$EOE\n",
        },
        meta,
      ),
    ).toThrow(/No sample was invented/);
    expect(() =>
      parseHorizonsJson(
        { signature: { version: "1.2" }, result: "no table here" },
        meta,
      ),
    ).toThrow(/No samples were invented/);
  });
});

describe("Horizons request", () => {
  it("uses Sun 10 and Earth 399, coord@301, geodetic, and airless", () => {
    const shared = {
      eastLongitudeDeg: -154.29,
      latitudeDeg: -89.802353,
      surfaceHeightM: 1703.407,
      startUtc: "2026-12-01T00:00:00Z",
      stopUtc: "2026-12-08T00:00:00Z",
    };
    const sun = buildHorizonsParams({ ...shared, target: "sun" });
    const earth = buildHorizonsParams({ ...shared, target: "earth" });
    expect(sun.COMMAND).toBe("10");
    expect(earth.COMMAND).toBe("399");
    expect(earth.COMMAND).not.toBe("3");
    for (const params of [sun, earth]) {
      expect(params.CENTER).toBe("coord@301");
      expect(params.COORD_TYPE).toBe("GEODETIC");
      expect(params.APPARENT).toBe("AIRLESS");
      expect(params.MAKE_EPHEM).toBe("YES");
      expect(params.EPHEM_TYPE).toBe("OBSERVER");
      expect(params.OBJ_DATA).toBe("NO");
      expect(params.QUANTITIES).toBe("4");
      expect(params.CSV_FORMAT).toBe("YES");
      expect(params.TIME_TYPE).toBe("UT");
      expect(params.STEP_SIZE).toBe("1 h");
    }
  });

  it("converts surface height from metres to kilometres and keeps east longitude", () => {
    expect(altitudeKilometres(2500)).toBeCloseTo(2.5, 10);
    expect(altitudeKilometres(-2317.702)).toBeCloseTo(-2.317702, 10);
    expect(formatSiteCoord(-154.29, -89.8, 1703.407)).toBe("-154.29,-89.8,1.703407");
    expect(formatSiteCoord(122.195734, -89.789561, -2317.702)).toBe(
      "122.195734,-89.789561,-2.317702",
    );
    const params = buildHorizonsParams({
      target: "earth",
      eastLongitudeDeg: 122.195734,
      latitudeDeg: -89.789561,
      surfaceHeightM: -2317.702,
      startUtc: "2026-12-01T00:00:00Z",
      stopUtc: "2026-12-08T00:00:00Z",
    });
    expect(params.SITE_COORD).toBe("122.195734,-89.789561,-2.317702");
  });
});

describe("azimuth interpolation", () => {
  it("unwraps the short way across north", () => {
    expect(unwrapAzimuthDegrees(350, 10)).toBeCloseTo(370, 8);
    expect(unwrapAzimuthDegrees(10, 350)).toBeCloseTo(-10, 8);
    expect(unwrapAzimuthDegrees(359, 1)).toBeCloseTo(361, 8);
  });

  it("interpolates azimuth across 0/360 and elevation linearly", () => {
    const samples: EphemerisSample[] = [
      { timeUtc: "2026-12-01T00:00:00Z", azimuthDeg: 350, elevationDeg: 1 },
      { timeUtc: "2026-12-01T02:00:00Z", azimuthDeg: 10, elevationDeg: 3 },
    ];
    const mid = interpolateAzimuth(samples, "2026-12-01T01:00:00Z");
    expect(mid.azimuthDeg).toBeCloseTo(0, 8);
    expect(mid.elevationDeg).toBeCloseTo(2, 8);
    expect(cacheKey("example-a", "sun", "2026-12-01T00:00:00.000Z", "2026-12-08T00:00:00Z", 1)).toBe(
      "example-a|sun|2026-12-01T00:00:00Z|2026-12-08T00:00:00Z|1",
    );
  });
});
