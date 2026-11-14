import {
  Body,
  EquatorFromVector,
  GeoVector,
  Libration,
  MakeTime,
  RotateVector,
  Rotation_EQJ_EQD,
  SiderealTime,
} from "astronomy-engine";

export interface EarthFace {
  timeUtc: string;
  /** Place on Earth where the Moon is straight overhead. */
  latitudeDeg: number;
  eastLongitudeDeg: number;
}

export interface LunarView {
  placeId: string;
  /** True when the centre of Earth is above the Moon's own horizon, before hills. */
  earthAboveHorizon: boolean;
  /** Degrees between this place and the spot on the Moon that points at Earth's centre. */
  separationDeg: number;
}

/** The side of Earth turned toward the Moon at this instant. */
export function earthFace(isoUtc: string): EarthFace {
  const time = MakeTime(new Date(isoUtc));
  const equatorial = RotateVector(Rotation_EQJ_EQD(time), GeoVector(Body.Moon, time, false));
  const sky = EquatorFromVector(equatorial);
  const rightAscensionDeg = sky.ra * 15;
  const greenwichDeg = SiderealTime(time) * 15;
  return {
    timeUtc: new Date(isoUtc).toISOString(),
    latitudeDeg: sky.dec,
    eastLongitudeDeg: wrapLongitude(rightAscensionDeg - greenwichDeg),
  };
}

/**
 * Whether a place on the Moon can see Earth's centre, ignoring hills.
 * The libration angles are the small shift of the Earth-facing spot away from the middle of the near side.
 */
export function lunarView(
  placeId: string,
  latitudeDeg: number,
  eastLongitudeDeg: number,
  isoUtc: string,
): LunarView {
  const time = MakeTime(new Date(isoUtc));
  const libration = Libration(time);
  const separationDeg = angularDistanceDeg(
    latitudeDeg,
    eastLongitudeDeg,
    libration.elat,
    libration.elon,
  );
  return {
    placeId,
    earthAboveHorizon: separationDeg < 90,
    separationDeg,
  };
}

export function angularDistanceDeg(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latA = (latitudeA * Math.PI) / 180;
  const latB = (latitudeB * Math.PI) / 180;
  const lon = ((longitudeB - longitudeA) * Math.PI) / 180;
  const cosine =
    Math.sin(latA) * Math.sin(latB) + Math.cos(latA) * Math.cos(latB) * Math.cos(lon);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

function wrapLongitude(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}
