/**
 * Map placement for LunarMap.
 *
 * Local mode is a south-polar stereographic projection, then rotated so that
 * geographic north at the dataset centre points up and east points right.
 * Longitude of the centre is a circular mean. The sphere radius is 1,737.4 km,
 * for the scale bar only — not the terrain dataset's own body radius.
 *
 * Preview mode places sites linearly in longitude and latitude across the
 * image bounds. That assumes the bitmap's edges are those bounds, north up
 * and east to the right.
 */

import { clamp, niceLength } from "./format";

export const MOON_RADIUS_M = 1_737_400;

/** Inset so polar-grid labels stay inside the frame. Not used on a georeferenced image. */
export const GRID_INSET = 0.08;

export interface Frame {
  minEastM: number;
  maxEastM: number;
  minNorthM: number;
  maxNorthM: number;
}

export interface GeoBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface LonLat {
  eastLongitudeDeg: number;
  latitudeDeg: number;
}

export function datasetCentre(sites: LonLat[]): { lonDeg: number; latDeg: number } {
  if (sites.length === 0) return { lonDeg: 0, latDeg: -90 };
  const latDeg = sites.reduce((sum, site) => sum + site.latitudeDeg, 0) / sites.length;
  let cosSum = 0;
  let sinSum = 0;
  for (const site of sites) {
    const radians = (site.eastLongitudeDeg * Math.PI) / 180;
    cosSum += Math.cos(radians);
    sinSum += Math.sin(radians);
  }
  if (cosSum === 0 && sinSum === 0) {
    return { lonDeg: sites[0].eastLongitudeDeg, latDeg };
  }
  return { lonDeg: (Math.atan2(sinSum, cosSum) * 180) / Math.PI, latDeg };
}

function stereographicSouth(
  lonDeg: number,
  latDeg: number,
  radiusM: number,
): { x: number; y: number } {
  const lat = Math.max(-90, Math.min(90, latDeg));
  const colatitude = ((90 + lat) * Math.PI) / 180;
  const longitude = (lonDeg * Math.PI) / 180;
  const rho = 2 * radiusM * Math.tan(colatitude / 2);
  return { x: rho * Math.sin(longitude), y: rho * Math.cos(longitude) };
}

export function localEnu(
  lonDeg: number,
  latDeg: number,
  originLonDeg: number,
  originLatDeg: number,
  radiusM = MOON_RADIUS_M,
): { eastM: number; northM: number } {
  const origin = stereographicSouth(originLonDeg, originLatDeg, radiusM);
  const point = stereographicSouth(lonDeg, latDeg, radiusM);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const lon0 = (originLonDeg * Math.PI) / 180;
  return {
    eastM: dx * Math.cos(lon0) - dy * Math.sin(lon0),
    northM: dx * Math.sin(lon0) + dy * Math.cos(lon0),
  };
}

export function frameEnu(
  points: { eastM: number; northM: number }[],
  minSpanM: number,
  padFraction: number,
): Frame {
  if (points.length === 0) {
    const half = (minSpanM / 2) * (1 + padFraction);
    return { minEastM: -half, maxEastM: half, minNorthM: -half, maxNorthM: half };
  }
  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  for (const point of points) {
    minEast = Math.min(minEast, point.eastM);
    maxEast = Math.max(maxEast, point.eastM);
    minNorth = Math.min(minNorth, point.northM);
    maxNorth = Math.max(maxNorth, point.northM);
  }
  const centreEast = (minEast + maxEast) / 2;
  const centreNorth = (minNorth + maxNorth) / 2;
  const span = Math.max(maxEast - minEast, maxNorth - minNorth, minSpanM);
  const half = (span / 2) * (1 + padFraction);
  return {
    minEastM: centreEast - half,
    maxEastM: centreEast + half,
    minNorthM: centreNorth - half,
    maxNorthM: centreNorth + half,
  };
}

export function enuFraction(
  point: { eastM: number; northM: number },
  frame: Frame,
): { x: number; y: number } {
  const width = frame.maxEastM - frame.minEastM;
  const height = frame.maxNorthM - frame.minNorthM;
  return {
    x: width === 0 ? 0.5 : (point.eastM - frame.minEastM) / width,
    y: height === 0 ? 0.5 : (frame.maxNorthM - point.northM) / height,
  };
}

export function applyInset(
  fraction: { x: number; y: number },
  inset = GRID_INSET,
): { x: number; y: number } {
  const span = 1 - inset * 2;
  return { x: inset + fraction.x * span, y: inset + fraction.y * span };
}

export function ringRadiiMetres(frame: Frame): number[] {
  const maxRadius = Math.hypot(
    Math.max(Math.abs(frame.minEastM), Math.abs(frame.maxEastM)),
    Math.max(Math.abs(frame.minNorthM), Math.abs(frame.maxNorthM)),
  );
  const step = niceLength(maxRadius / 4);
  const rings: number[] = [];
  for (let radius = step; radius < maxRadius * 0.98; radius += step) {
    rings.push(radius);
    if (rings.length > 8) break;
  }
  return rings;
}

/** Intersection of a bearing ray from the origin with the frame. Bearing is degrees clockwise from north. */
export function rayExit(
  frame: Frame,
  bearingDeg: number,
): { eastM: number; northM: number } | null {
  const bearing = (bearingDeg * Math.PI) / 180;
  const east = Math.sin(bearing);
  const north = Math.cos(bearing);
  let limit = Infinity;
  if (east > 1e-12) limit = Math.min(limit, frame.maxEastM / east);
  if (east < -1e-12) limit = Math.min(limit, frame.minEastM / east);
  if (north > 1e-12) limit = Math.min(limit, frame.maxNorthM / north);
  if (north < -1e-12) limit = Math.min(limit, frame.minNorthM / north);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return { eastM: limit * east, northM: limit * north };
}

export function scaleBarMetres(spanM: number): number {
  return niceLength(spanM * 0.22);
}

export function previewSpanOk(bounds: GeoBounds): boolean {
  return (
    Number.isFinite(bounds.minLon) &&
    Number.isFinite(bounds.maxLon) &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLat) &&
    bounds.maxLon > bounds.minLon &&
    bounds.maxLat > bounds.minLat
  );
}

/** Shift longitude by 360° until it is as close as possible to the middle of the bounds. */
export function longitudeIntoRange(lon: number, minLon: number, maxLon: number): number {
  if (
    !(maxLon > minLon) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLon)
  ) {
    return lon;
  }
  const mid = (minLon + maxLon) / 2;
  let shifted = lon;
  for (let step = 0; step < 8; step += 1) {
    if (shifted - mid > 180) shifted -= 360;
    else if (mid - shifted > 180) shifted += 360;
    else break;
  }
  return shifted;
}

/** Site bounding box in view fractions, after the polar-grid inset. */
export function siteExtentFraction(
  points: { eastM: number; northM: number }[],
  view: Frame,
  minSpanM: number,
): { x: number; y: number; w: number; h: number } | null {
  if (points.length === 0) return null;
  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  for (const point of points) {
    minEast = Math.min(minEast, point.eastM);
    maxEast = Math.max(maxEast, point.eastM);
    minNorth = Math.min(minNorth, point.northM);
    maxNorth = Math.max(maxNorth, point.northM);
  }
  const centreEast = (minEast + maxEast) / 2;
  const centreNorth = (minNorth + maxNorth) / 2;
  const halfEast = Math.max((maxEast - minEast) / 2, minSpanM / 2);
  const halfNorth = Math.max((maxNorth - minNorth) / 2, minSpanM / 2);
  const northWest = applyInset(
    enuFraction({ eastM: centreEast - halfEast, northM: centreNorth + halfNorth }, view),
  );
  const southEast = applyInset(
    enuFraction({ eastM: centreEast + halfEast, northM: centreNorth - halfNorth }, view),
  );
  return {
    x: northWest.x,
    y: northWest.y,
    w: Math.max(0, southEast.x - northWest.x),
    h: Math.max(0, southEast.y - northWest.y),
  };
}

export function placeOnPreview(
  lon: number,
  lat: number,
  bounds: GeoBounds,
): { x: number; y: number; outside: boolean } | null {
  if (!previewSpanOk(bounds)) return null;
  const lonIn = longitudeIntoRange(lon, bounds.minLon, bounds.maxLon);
  const x = (lonIn - bounds.minLon) / (bounds.maxLon - bounds.minLon);
  const y = (bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat);
  return { x, y, outside: x < 0 || x > 1 || y < 0 || y > 1 };
}

/** East-west ground length of a longitude span at a latitude, on the scale-bar sphere. */
export function eastWestMetres(spanLonDeg: number, latDeg: number, radiusM = MOON_RADIUS_M): number {
  const metresPerDegree = (2 * Math.PI * radiusM) / 360;
  return spanLonDeg * metresPerDegree * Math.cos((latDeg * Math.PI) / 180);
}

export function niceDegreeStep(spanDeg: number): number {
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45];
  const target = Math.max(spanDeg, 0) / 4;
  let choice = steps[0];
  for (const step of steps) {
    if (step <= target) choice = step;
  }
  return choice;
}

export function visualFraction(fraction: number): number {
  return clamp(fraction, 0, 1);
}
