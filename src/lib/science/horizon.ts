/**
 * Terrain horizon on the Moon, in body-fixed geometry.
 *
 * Coordinate frame, verified from the PGDA product 90 GeoTIFF
 * LDEM_80S_80MPP_ADJ (BigTIFF, float32, 80 m, nodata NaN,
 * GTRasterTypeGeoKey = RasterPixelIsArea) on 2026-11-14:
 *
 *   CRS WKT: "Moon (2015) - Sphere / Ocentric / South Polar"
 *   SPHEROID radius 1737400 m (IAU Moon 2015 / MOON_ME, the DE421 lunar frame)
 *   PROJECTION Polar_Stereographic
 *   latitude_of_origin = -90, central_meridian = 0, scale factor = 1
 *   false easting = 0, false northing = 0
 *   PROJ string: +proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400
 *
 * Transforming geographic points through that CRS gives the axis directions.
 * They are not "+X toward 0 longitude":
 *   +X (column direction) points toward east longitude 90°
 *   +Y (up the image; row 0 is the maximum Y) points toward east longitude 0°
 *   -Y points toward east longitude 180°
 *   -X points toward east longitude 270° (also written -90°)
 *   ρ = 2 R tan(θ/2), θ = angular distance from the south pole
 *   x = ρ sin(λ), y = ρ cos(λ), λ = east longitude
 *
 * Pixel (0,0) of an AnalysisDataset is the centre of the upper-left pixel:
 *   x = originX + col * pixelSizeM
 *   y = originY - row * pixelSizeM
 *
 * Azimuth is local geodetic east-north-up in the MOON_ME frame
 * (N = 0, E = 90, S = 180, W = 270), not the stereographic X/Y axes.
 * At the south pole every direction away from the pole is north along some
 * meridian, so east and north are built from the observer's own longitude
 * and the 3-D basis below, which stays defined as latitude approaches -90°.
 *
 * Elevation of a terrain point above the local horizontal:
 *   asin(clamp(dot(normalize(T - O), normalize(O)), -1, 1))
 * The observer is at radius R + surfaceHeight + equipment height.
 * A terrain point is at radius R + z. Missing elevations stay null.
 * They are never replaced with a flat (0°) horizon.
 *
 * The geometric limb elevation -acos(R / (R + h_obs)) is used only when the
 * ray has no terrain and the search radius reaches the limb distance.
 * An observer inside the reference sphere (crater floor, h_obs <= 0) has no
 * exterior tangent; that fallback is then unavailable.
 */

import type { AnalysisDataset, HorizonSample, LunarSite, TerrainHorizon } from "./types";
import {
  BODY_RADIUS_M,
  HORIZON_AZIMUTH_STEP_DEG,
  HORIZON_SEARCH_RADIUS_M,
} from "./constants";

type Vec3 = [number, number, number];

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function deg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n === 0) {
    throw new Error("Cannot normalise a zero vector.");
  }
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function geodeticToBodyFixed(eastLongitudeDeg: number, latitudeDeg: number, radiusM: number): Vec3 {
  const lon = rad(eastLongitudeDeg);
  const lat = rad(latitudeDeg);
  const cosLat = Math.cos(lat);
  return [
    radiusM * cosLat * Math.cos(lon),
    radiusM * cosLat * Math.sin(lon),
    radiusM * Math.sin(lat),
  ];
}

/** Local east and north. Up is the geodetic radial, normalize(position). */
export function localEastNorth(eastLongitudeDeg: number, latitudeDeg: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const lon = rad(eastLongitudeDeg);
  const lat = rad(latitudeDeg);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

/**
 * South-polar stereographic metres matching the product 90 axis test:
 * +X toward 90°E, +Y toward 0°E.
 */
export function stereographicMetres(
  eastLongitudeDeg: number,
  latitudeDeg: number,
): { x: number; y: number } {
  const lat = rad(latitudeDeg);
  const lon = rad(eastLongitudeDeg);
  const thetaFromSouthPole = Math.PI / 2 + lat;
  const rho = 2 * BODY_RADIUS_M * Math.tan(thetaFromSouthPole / 2);
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) };
}

export function geodeticFromStereographic(
  x: number,
  y: number,
): { eastLongitudeDeg: number; latitudeDeg: number } {
  const rho = Math.hypot(x, y);
  const lon = Math.atan2(x, y);
  const thetaFromSouthPole = 2 * Math.atan(rho / (2 * BODY_RADIUS_M));
  const lat = thetaFromSouthPole - Math.PI / 2;
  return { eastLongitudeDeg: deg(lon), latitudeDeg: deg(lat) };
}

/**
 * Elevation of the line of sight above the local horizontal, degrees.
 * Positive is above the horizontal. This is the body-fixed expression
 * asin(dot(normalize(T-O), normalize(O))).
 */
export function elevationAboveHorizontalDeg(observer: Vec3, target: Vec3): number {
  const lineOfSight = normalize(sub(target, observer));
  const up = normalize(observer);
  return deg(Math.asin(clamp(dot(lineOfSight, up), -1, 1)));
}

/**
 * Geometric limb of the reference sphere, degrees, for an observer outside it.
 * Returns null when the observer is on or inside the sphere (no exterior tangent).
 */
export function geometricLimbElevationDeg(observerRadiusM: number): number | null {
  if (!(observerRadiusM > BODY_RADIUS_M)) return null;
  return -deg(Math.acos(clamp(BODY_RADIUS_M / observerRadiusM, -1, 1)));
}

/** Arc length on the reference sphere from the observer's nadir to the limb. */
export function geometricLimbDistanceM(observerRadiusM: number): number | null {
  if (!(observerRadiusM > BODY_RADIUS_M)) return null;
  return BODY_RADIUS_M * Math.acos(clamp(BODY_RADIUS_M / observerRadiusM, -1, 1));
}

/**
 * Initial azimuth from the observer to another geodetic point, degrees
 * clockwise from north. Used to test the south-polar basis.
 */
export function localAzimuthDeg(
  observerLonDeg: number,
  observerLatDeg: number,
  targetLonDeg: number,
  targetLatDeg: number,
): number {
  const observer = geodeticToBodyFixed(observerLonDeg, observerLatDeg, BODY_RADIUS_M);
  const target = geodeticToBodyFixed(targetLonDeg, targetLatDeg, BODY_RADIUS_M);
  const { east, north } = localEastNorth(observerLonDeg, observerLatDeg);
  const line = sub(target, observer);
  const eastComponent = dot(line, east);
  const northComponent = dot(line, north);
  let azimuth = deg(Math.atan2(eastComponent, northComponent));
  if (azimuth < 0) azimuth += 360;
  return azimuth;
}

function destination(
  eastLongitudeDeg: number,
  latitudeDeg: number,
  azimuthDeg: number,
  distanceM: number,
): { eastLongitudeDeg: number; latitudeDeg: number } {
  const { east, north, up } = localEastNorth(eastLongitudeDeg, latitudeDeg);
  const azimuth = rad(azimuthDeg);
  const horizontal: Vec3 = [
    north[0] * Math.cos(azimuth) + east[0] * Math.sin(azimuth),
    north[1] * Math.cos(azimuth) + east[1] * Math.sin(azimuth),
    north[2] * Math.cos(azimuth) + east[2] * Math.sin(azimuth),
  ];
  const delta = distanceM / BODY_RADIUS_M;
  const direction = normalize(
    add(scale(up, Math.cos(delta)), scale(horizontal, Math.sin(delta))),
  );
  const latitude = deg(Math.asin(clamp(direction[2], -1, 1)));
  const longitude = deg(Math.atan2(direction[1], direction[0]));
  return { eastLongitudeDeg: longitude, latitudeDeg: latitude };
}

type Sampled = number | "nodata" | "outside";

function sampleHeight(dataset: AnalysisDataset, x: number, y: number): Sampled {
  const col = Math.round((x - dataset.originX) / dataset.pixelSizeM);
  const row = Math.round((dataset.originY - y) / dataset.pixelSizeM);
  if (row < 0 || col < 0 || row >= dataset.rows || col >= dataset.cols) return "outside";
  const height = dataset.heights[row * dataset.cols + col];
  if (height === null || height === undefined || !Number.isFinite(height)) return "nodata";
  return height;
}

function rayDistances(minDistanceM: number, searchRadiusM: number, stepM: number): number[] {
  const distances: number[] = [];
  for (let distance = minDistanceM; distance < searchRadiusM; distance += stepM) {
    distances.push(distance);
  }
  distances.push(searchRadiusM);
  return distances;
}

interface RayResult {
  elevationDeg: number | null;
  distanceM: number | null;
  coverage: HorizonSample["coverage"];
}

function traceRay(
  dataset: AnalysisDataset,
  site: LunarSite,
  observer: Vec3,
  observerRadiusM: number,
  azimuthDeg: number,
  searchRadiusM: number,
  stepM: number,
  minDistanceM: number,
): RayResult {
  const limbElevation = geometricLimbElevationDeg(observerRadiusM);
  const limbDistance = geometricLimbDistanceM(observerRadiusM);
  let maxElevation = Number.NEGATIVE_INFINITY;
  let maxDistance: number | null = null;
  let sawFinite = false;
  let sawNodata = false;
  let stayedInside = true;
  for (const distance of rayDistances(minDistanceM, searchRadiusM, stepM)) {
    const place = destination(site.eastLongitudeDeg, site.latitudeDeg, azimuthDeg, distance);
    const xy = stereographicMetres(place.eastLongitudeDeg, place.latitudeDeg);
    const height = sampleHeight(dataset, xy.x, xy.y);
    if (height === "outside") {
      stayedInside = false;
      break;
    }
    if (height === "nodata") {
      sawNodata = true;
      continue;
    }
    sawFinite = true;
    const target = geodeticToBodyFixed(
      place.eastLongitudeDeg,
      place.latitudeDeg,
      BODY_RADIUS_M + height,
    );
    const elevation = elevationAboveHorizontalDeg(observer, target);
    if (elevation > maxElevation) {
      maxElevation = elevation;
      maxDistance = distance;
    }
  }
  if (stayedInside && sawFinite && !sawNodata && Number.isFinite(maxElevation)) {
    return { elevationDeg: maxElevation, distanceM: maxDistance, coverage: "terrain" };
  }
  const searchCoversLimb =
    limbDistance !== null && limbElevation !== null && searchRadiusM + 1e-6 >= limbDistance;
  if (stayedInside && !sawFinite && searchCoversLimb) {
    return {
      elevationDeg: limbElevation,
      distanceM: limbDistance,
      coverage: "geometric_limb_only",
    };
  }
  return { elevationDeg: null, distanceM: null, coverage: "missing" };
}

/**
 * Terrain mask at `heightAboveGroundM` above the site surface.
 * Raising the equipment height moves the observer radially outward and
 * lowers the elevation angle of the same ridge.
 */
export function buildHorizon(
  dataset: AnalysisDataset,
  site: LunarSite,
  heightAboveGroundM: number,
): TerrainHorizon {
  const searchRadiusM = dataset.horizonSearchRadiusM ?? HORIZON_SEARCH_RADIUS_M;
  const observerRadiusM = BODY_RADIUS_M + site.surfaceHeightM + heightAboveGroundM;
  const observer = geodeticToBodyFixed(site.eastLongitudeDeg, site.latitudeDeg, observerRadiusM);
  const stepM = Math.max(dataset.pixelSizeM / 2, 1);
  const minDistanceM = Math.max(dataset.pixelSizeM * 1.5, 1);
  const count = Math.round(360 / HORIZON_AZIMUTH_STEP_DEG);
  const samples: HorizonSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const azimuthDeg = index * HORIZON_AZIMUTH_STEP_DEG;
    const ray = traceRay(
      dataset,
      site,
      observer,
      observerRadiusM,
      azimuthDeg,
      searchRadiusM,
      stepM,
      minDistanceM,
    );
    samples.push({
      azimuthDeg,
      elevationDeg: ray.elevationDeg,
      distanceM: ray.distanceM,
      coverage: ray.coverage,
    });
  }
  const missing = samples.filter((sample) => sample.coverage === "missing").length;
  const coverage: TerrainHorizon["coverage"] =
    missing === 0 ? "complete" : missing > samples.length / 2 ? "insufficient" : "partial";
  return {
    siteId: site.id,
    heightAboveGroundM,
    azimuthStepDeg: HORIZON_AZIMUTH_STEP_DEG,
    samples,
    coverage,
    datasetId: dataset.datasetId,
    analysisResolutionM: dataset.analysisResolutionM,
  };
}

/** Linear elevation between adjacent mask samples. A gap stays null. */
export function horizonElevationAt(horizon: TerrainHorizon, azimuthDeg: number): number | null {
  const count = horizon.samples.length;
  if (count === 0) return null;
  const step = horizon.azimuthStepDeg;
  const wrapped = ((azimuthDeg % 360) + 360) % 360;
  const scaled = wrapped / step;
  const index = Math.floor(scaled) % count;
  const next = (index + 1) % count;
  const fraction = scaled - Math.floor(scaled);
  const left = horizon.samples[index];
  const right = horizon.samples[next];
  if (left.elevationDeg === null || right.elevationDeg === null) return null;
  if (fraction === 0) return left.elevationDeg;
  return left.elevationDeg + fraction * (right.elevationDeg - left.elevationDeg);
}
