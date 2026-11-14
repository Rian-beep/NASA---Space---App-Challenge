import { describe, expect, it } from "vitest";
import { angularDistanceDeg, earthFace, lunarView } from "../../terrestrial/facing";
import { placesOnTheMoon } from "../../terrestrial/lunarPlaces";
import { moonAtStation } from "../../terrestrial/moon";
import { STATIONS } from "../../terrestrial/stations";

const NOON = "2026-12-05T12:00:00.000Z";

describe("earthFace", () => {
  it("puts dishes that see the Moon on the facing half of Earth", () => {
    const face = earthFace(NOON);
    expect(face.latitudeDeg).toBeGreaterThan(-90);
    expect(face.latitudeDeg).toBeLessThan(90);
    expect(face.eastLongitudeDeg).toBeGreaterThan(-180);
    expect(face.eastLongitudeDeg).toBeLessThanOrEqual(180);

    for (const station of STATIONS) {
      const moon = moonAtStation(station, NOON);
      const distance = angularDistanceDeg(
        station.latitudeDeg,
        station.eastLongitudeDeg,
        face.latitudeDeg,
        face.eastLongitudeDeg,
      );
      expect(moon.elevationDeg).not.toBeNull();
      if ((moon.elevationDeg ?? 0) > 10) expect(distance).toBeLessThan(90);
      if ((moon.elevationDeg ?? 0) < -10) expect(distance).toBeGreaterThan(90);
    }
  });

  it("keeps a past landing at its own coordinates", () => {
    const apollo = placesOnTheMoon([
      { id: "apollo-11", name: "Apollo 11", latitudeDeg: 0.67416, eastLongitudeDeg: 23.47314 },
    ]).find((place) => place.id === "apollo-11");
    expect(apollo?.latitudeDeg).toBeCloseTo(0.67416, 4);
    expect(apollo?.eastLongitudeDeg).toBeCloseTo(23.47314, 4);
    expect(Math.abs(apollo?.latitudeDeg ?? 90)).toBeLessThan(10);
  });

  it("looks at Earth from Apollo 11, not from the south-pole practice spot", () => {
    const apollo = lunarView("apollo-11", 0.67416, 23.47314, "1969-07-20T20:00:00.000Z");
    const south = lunarView("shackleton", -89.802353, -154.290046, "1969-07-20T20:00:00.000Z");
    expect(apollo.earthAboveHorizon).toBe(true);
    expect(apollo.separationDeg).toBeLessThan(45);
    expect(south.separationDeg - apollo.separationDeg).toBeGreaterThan(40);
  });

  it("sees Earth from the near side and not from the far side", () => {
    const near = lunarView("near", 0, 0, NOON);
    const far = lunarView("far", 0, 180, NOON);
    expect(near.earthAboveHorizon).toBe(true);
    expect(near.separationDeg).toBeLessThan(20);
    expect(far.earthAboveHorizon).toBe(false);
    expect(far.separationDeg).toBeGreaterThan(160);
  });
});
