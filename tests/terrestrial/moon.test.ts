import { describe, expect, it } from "vitest";
import { moonAtStation } from "../../terrestrial/moon";
import { STATIONS } from "../../terrestrial/stations";

describe("moonAtStation", () => {
  it("returns a finite Goldstone elevation at noon UTC on 5 December 2026", () => {
    const goldstone = STATIONS.find((station) => station.id === "goldstone");
    expect(goldstone).toBeTruthy();
    const moon = moonAtStation(goldstone!, "2026-12-05T12:00:00.000Z");
    expect(moon.stationId).toBe("goldstone");
    expect(moon.timeUtc).toBe("2026-12-05T12:00:00.000Z");
    expect(moon.sourceName).toBe("Astronomy Engine sky calculation");
    expect(typeof moon.elevationDeg).toBe("number");
    expect(moon.elevationDeg).toBeGreaterThanOrEqual(-90);
    expect(moon.elevationDeg).toBeLessThanOrEqual(90);
    expect(Number.isFinite(moon.elevationDeg)).toBe(true);
    expect(moon.moonUp).toBe((moon.elevationDeg ?? 0) > 0);
  });

  it("returns nulls for a time that cannot be read", () => {
    const moon = moonAtStation(STATIONS[0], "not-a-time");
    expect(moon.elevationDeg).toBeNull();
    expect(moon.moonUp).toBeNull();
    expect(moon.timeUtc).toBe("not-a-time");
  });
});
