import { describe, expect, it } from "vitest";
import { HORIZON_SEARCH_RADIUS_M } from "@/lib/science/constants";
import {
  buildHorizon,
  elevationAboveHorizontalDeg,
  geodeticToBodyFixed,
  geometricLimbElevationDeg,
  localAzimuthDeg,
  stereographicMetres,
} from "@/lib/science/horizon";
import { BODY_RADIUS_M } from "@/lib/science/constants";
import type { AnalysisDataset, LunarSite } from "@/lib/science/types";

function gridAround(
  site: Pick<LunarSite, "eastLongitudeDeg" | "latitudeDeg">,
  pixelSizeM: number,
  radiusM: number,
  fill: number | null,
): AnalysisDataset {
  const centre = stereographicMetres(site.eastLongitudeDeg, site.latitudeDeg);
  const count = Math.ceil((radiusM * 2) / pixelSizeM) + 3;
  const originX = centre.x - ((count - 1) / 2) * pixelSizeM;
  const originY = centre.y + ((count - 1) / 2) * pixelSizeM;
  return {
    datasetId: "synthetic",
    productUrl: "https://pgda.gsfc.nasa.gov/products/90",
    citation: "Synthetic grid for a horizon unit test.",
    coordinateReference: "MOON_ME south-polar stereographic test grid",
    bodyRadiusM: BODY_RADIUS_M,
    sourcePixelSpacingM: pixelSizeM,
    analysisResolutionM: pixelSizeM,
    rows: count,
    cols: count,
    originX,
    originY,
    pixelSizeM,
    heights: Array<number | null>(count * count).fill(fill),
    retrievedAtUtc: "2026-11-14T00:00:00Z",
    horizonSearchRadiusM: HORIZON_SEARCH_RADIUS_M,
  };
}

describe("south-polar frame", () => {
  it("puts +Y toward longitude 0 and +X toward longitude 90 east", () => {
    const prime = stereographicMetres(0, -85);
    const east = stereographicMetres(90, -85);
    expect(Math.abs(prime.x)).toBeLessThan(1);
    expect(prime.y).toBeGreaterThan(100_000);
    expect(east.x).toBeGreaterThan(100_000);
    expect(Math.abs(east.y)).toBeLessThan(1);
  });

  it("measures north along the prime meridian and east along +X near the south pole", () => {
    const north = localAzimuthDeg(0, -89.95, 0, -89.9);
    const south = localAzimuthDeg(0, -89.95, 0, -89.99);
    const east = localAzimuthDeg(0, -89.95, 0.05, -89.95);
    expect(north).toBeLessThan(1);
    expect(south).toBeGreaterThan(179);
    expect(south).toBeLessThan(181);
    expect(east).toBeGreaterThan(89);
    expect(east).toBeLessThan(91);
  });
});

describe("analytical horizon", () => {
  const site: LunarSite = {
    id: "ridge-test",
    name: "Ridge test",
    kind: "custom",
    eastLongitudeDeg: 0,
    latitudeDeg: -89.9,
    surfaceHeightM: 0,
    summary: "Synthetic.",
  };

  function ridged(): AnalysisDataset {
    const dataset = gridAround(site, 250, HORIZON_SEARCH_RADIUS_M + 800, 0);
    for (let row = 0; row < dataset.rows; row += 1) {
      for (let col = 0; col < dataset.cols; col += 1) {
        const x = dataset.originX + col * dataset.pixelSizeM;
        const y = dataset.originY - row * dataset.pixelSizeM;
        const dx = x - stereographicMetres(site.eastLongitudeDeg, site.latitudeDeg).x;
        const dy = y - stereographicMetres(site.eastLongitudeDeg, site.latitudeDeg).y;
        const distance = Math.hypot(dx, dy);
        const azimuth = localAzimuthDeg(
          site.eastLongitudeDeg,
          site.latitudeDeg,
          ...(() => {
            const rho = Math.hypot(x, y);
            const lon = (Math.atan2(x, y) * 180) / Math.PI;
            const lat = ((2 * Math.atan(rho / (2 * BODY_RADIUS_M)) - Math.PI / 2) * 180) / Math.PI;
            return [lon, lat] as const;
          })(),
        );
        const aroundNorth = Math.min(azimuth, 360 - azimuth);
        if (distance > 1_000 && distance < 2_200 && aroundNorth < 12) {
          dataset.heights[row * dataset.cols + col] = 800;
        }
      }
    }
    return dataset;
  }

  it("lets a known ridge block one azimuth while the opposite side stays lower", () => {
    const horizon = buildHorizon(ridged(), site, 2);
    expect(horizon.coverage).toBe("complete");
    const north = horizon.samples.find((sample) => sample.azimuthDeg === 0);
    const south = horizon.samples.find((sample) => sample.azimuthDeg === 180);
    expect(north?.coverage).toBe("terrain");
    expect(south?.coverage).toBe("terrain");
    expect(north?.elevationDeg ?? -99).toBeGreaterThan((south?.elevationDeg ?? 99) + 10);

    const distanceM = north?.distanceM ?? 0;
    expect(distanceM).toBeGreaterThan(900);
    expect(distanceM).toBeLessThan(2_300);
    const observer = geodeticToBodyFixed(0, -89.9, BODY_RADIUS_M + 2);
    const ridgeLatitude = -89.9 + (distanceM / BODY_RADIUS_M) * (180 / Math.PI);
    const ridge = geodeticToBodyFixed(0, ridgeLatitude, BODY_RADIUS_M + 800);
    const analytical = elevationAboveHorizontalDeg(observer, ridge);
    expect(north?.elevationDeg ?? 0).toBeGreaterThan(15);
    expect(Math.abs((north?.elevationDeg ?? 0) - analytical)).toBeLessThan(3);
  });

  it("lowers the ridge elevation angle when the observer is raised", () => {
    const dataset = ridged();
    const low = buildHorizon(dataset, site, 2);
    const high = buildHorizon(dataset, site, 50);
    const lowNorth = low.samples.find((sample) => sample.azimuthDeg === 0)?.elevationDeg ?? 0;
    const highNorth = high.samples.find((sample) => sample.azimuthDeg === 0)?.elevationDeg ?? 0;
    expect(highNorth).toBeLessThan(lowNorth - 0.5);
    expect(high.heightAboveGroundM).toBe(50);
  });

  it("does not treat a crop that misses the search radius as flat", () => {
    const tiny = gridAround(site, 100, 400, 0);
    tiny.horizonSearchRadiusM = HORIZON_SEARCH_RADIUS_M;
    const horizon = buildHorizon(tiny, site, 2);
    expect(horizon.samples.every((sample) => sample.coverage === "missing")).toBe(true);
    expect(horizon.samples.every((sample) => sample.elevationDeg === null)).toBe(true);
    expect(horizon.coverage).toBe("insufficient");
  });

  it("uses the geometric limb only when terrain is absent out to the search radius", () => {
    const empty = gridAround(site, 250, HORIZON_SEARCH_RADIUS_M + 800, null);
    const horizon = buildHorizon(empty, site, 2);
    const limb = geometricLimbElevationDeg(BODY_RADIUS_M + 2);
    expect(limb).not.toBeNull();
    expect(horizon.samples[0].coverage).toBe("geometric_limb_only");
    expect(horizon.samples[0].elevationDeg).toBeCloseTo(limb as number, 6);
    expect(horizon.coverage).toBe("complete");
  });
});
