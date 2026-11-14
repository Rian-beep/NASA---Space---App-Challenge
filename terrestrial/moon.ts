import { Body, Equator, Horizon, MakeTime, Observer } from "astronomy-engine";
import type { MoonAtStation, Station } from "./types";

const SOURCE_NAME = "Astronomy Engine sky calculation";

function unknown(station: Station, isoUtc: string): MoonAtStation {
  return {
    stationId: station.id,
    timeUtc: isoUtc,
    elevationDeg: null,
    moonUp: null,
    sourceName: SOURCE_NAME,
  };
}

/**
 * Geometric altitude of the Moon's centre at the dish.
 * Above the horizon means that altitude is greater than 0.
 * A bad instant returns nulls and does not throw.
 */
export function moonAtStation(station: Station, isoUtc: string): MoonAtStation {
  try {
    const observer = new Observer(
      station.latitudeDeg,
      station.eastLongitudeDeg,
      station.elevationM,
    );
    const time = MakeTime(new Date(isoUtc));
    const equator = Equator(Body.Moon, time, observer, true, true);
    const horizontal = Horizon(time, observer, equator.ra, equator.dec);
    const elevationDeg = horizontal.altitude;
    if (!Number.isFinite(elevationDeg)) return unknown(station, isoUtc);
    return {
      stationId: station.id,
      timeUtc: isoUtc,
      elevationDeg,
      moonUp: elevationDeg > 0,
      sourceName: SOURCE_NAME,
    };
  } catch {
    return unknown(station, isoUtc);
  }
}
