import { describe, expect, it } from "vitest";
import { angularDistanceDeg, earthFace, lunarView } from "../../terrestrial/facing";
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

  it("sees Earth from the near side and not from the far side", () => {
    const near = lunarView("near", 0, 0, NOON);
    const far = lunarView("far", 0, 180, NOON);
    expect(near.earthAboveHorizon).toBe(true);
    expect(near.separationDeg).toBeLessThan(20);
    expect(far.earthAboveHorizon).toBe(false);
    expect(far.separationDeg).toBeGreaterThan(160);
  });
});
