/** Places on the Moon used to ask which side of Earth is in view. */

export interface LunarPlace {
  id: string;
  name: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
}

export const LUNAR_PLACES: readonly LunarPlace[] = [
  {
    id: "near-side",
    name: "Middle of the near side",
    latitudeDeg: 0,
    eastLongitudeDeg: 0,
  },
  {
    id: "example-a",
    name: "Shackleton rim practice spot",
    latitudeDeg: -89.802353,
    eastLongitudeDeg: -154.290046,
  },
  {
    id: "example-b",
    name: "Near-side ridge practice spot",
    latitudeDeg: -89.712657,
    eastLongitudeDeg: 58.134022,
  },
  {
    id: "example-c",
    name: "Shackleton floor practice spot",
    latitudeDeg: -89.789561,
    eastLongitudeDeg: 122.195734,
  },
];
