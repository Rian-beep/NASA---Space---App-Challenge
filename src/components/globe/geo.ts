/** Longitude 0 faces +Z. Latitude 0 is the equator. Positive longitude is east. */

export function latLonToVector(
  latitudeDeg: number,
  eastLongitudeDeg: number,
  radius: number,
): [number, number, number] {
  const lat = (latitudeDeg * Math.PI) / 180;
  const lon = (eastLongitudeDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  return [
    radius * cosLat * Math.sin(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.cos(lon),
  ];
}

export function vectorToLatLon(
  x: number,
  y: number,
  z: number,
): { latitudeDeg: number; eastLongitudeDeg: number } {
  const radius = Math.hypot(x, y, z);
  const latitudeDeg = (Math.asin(clamp(y / radius, -1, 1)) * 180) / Math.PI;
  let eastLongitudeDeg = (Math.atan2(x, z) * 180) / Math.PI;
  if (eastLongitudeDeg > 180) eastLongitudeDeg -= 360;
  if (eastLongitudeDeg <= -180) eastLongitudeDeg += 360;
  return { latitudeDeg, eastLongitudeDeg };
}

export function formatLatitude(degrees: number): string {
  const side = degrees >= 0 ? "N" : "S";
  return `${Math.abs(degrees).toFixed(2)}° ${side}`;
}

export function formatLongitude(degrees: number): string {
  const side = degrees >= 0 ? "E" : "W";
  return `${Math.abs(degrees).toFixed(2)}° ${side}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
