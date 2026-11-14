import type { Station } from "./types";

/**
 * The three NASA Deep Space Network 70-meter dishes.
 * Rounded site positions for a sky check, not a surveyed antenna file.
 * Goldstone DSS-14, Madrid DSS-63, Canberra DSS-43.
 * https://www.nasa.gov/communicating-with-missions/dsn/
 */
export const STATIONS: readonly Station[] = [
  {
    id: "goldstone",
    name: "Goldstone",
    dish: "DSS-14",
    place: "California, USA",
    latitudeDeg: 35.4259,
    eastLongitudeDeg: -116.8895,
    elevationM: 1002,
  },
  {
    id: "madrid",
    name: "Madrid",
    dish: "DSS-63",
    place: "Spain",
    latitudeDeg: 40.4312,
    eastLongitudeDeg: -4.248,
    elevationM: 865,
  },
  {
    id: "canberra",
    name: "Canberra",
    dish: "DSS-43",
    place: "Australia",
    latitudeDeg: -35.4014,
    eastLongitudeDeg: 148.9813,
    elevationM: 692,
  },
];

export function stationById(id: string): Station | undefined {
  return STATIONS.find((station) => station.id === id);
}
