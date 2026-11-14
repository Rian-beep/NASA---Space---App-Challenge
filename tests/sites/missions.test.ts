import { describe, expect, it } from "vitest";
import { MISSIONS, missionById, outcomePhrase } from "@/lib/sites/missions";
import { latLonToVector, vectorToLatLon } from "@/components/globe/geo";

describe("mission catalog", () => {
  it("keeps every NASA coordinate inside the Moon and unique", () => {
    const ids = new Set<string>();
    expect(MISSIONS.length).toBeGreaterThan(60);
    for (const mission of MISSIONS) {
      expect(ids.has(mission.id)).toBe(false);
      ids.add(mission.id);
      expect(mission.latitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(mission.latitudeDeg).toBeLessThanOrEqual(90);
      expect(mission.eastLongitudeDeg).toBeGreaterThan(-180);
      expect(mission.eastLongitudeDeg).toBeLessThanOrEqual(180);
      expect(mission.dateUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(outcomePhrase(mission.outcome).length).toBeGreaterThan(0);
    }
  });

  it("matches published Apollo, Chang'e 6, and Chandrayaan-3 coordinates", () => {
    const apollo11 = missionById("apollo-11");
    const apollo12 = missionById("apollo-12");
    const change6 = missionById("chang-e-6");
    const chandrayaan3 = missionById("chandrayaan-3");
    expect(apollo11).toMatchObject({ latitudeDeg: 0.67416, eastLongitudeDeg: 23.47314, outcome: "crewed_landing" });
    expect(apollo12?.eastLongitudeDeg).toBeCloseTo(-23.4219, 4);
    expect(change6?.eastLongitudeDeg).toBeCloseTo(-153.9852, 4);
    expect(change6?.latitudeDeg).toBeCloseTo(-41.6385, 4);
    expect(chandrayaan3).toMatchObject({ latitudeDeg: -69.3741, eastLongitudeDeg: 32.32 });
  });

  it("counts six crewed Apollo landings and leaves unknown sites out", () => {
    const crewed = MISSIONS.filter((mission) => mission.outcome === "crewed_landing");
    expect(crewed.map((mission) => mission.name).sort()).toEqual([
      "Apollo 11",
      "Apollo 12",
      "Apollo 14",
      "Apollo 15",
      "Apollo 16",
      "Apollo 17",
    ]);
    expect(MISSIONS.some((mission) => /unknown/i.test(mission.name))).toBe(false);
  });
});

describe("globe coordinates", () => {
  it("round-trips a landing site through the globe", () => {
    const apollo11 = missionById("apollo-11");
    expect(apollo11).toBeTruthy();
    const [x, y, z] = latLonToVector(apollo11!.latitudeDeg, apollo11!.eastLongitudeDeg, 1);
    const back = vectorToLatLon(x, y, z);
    expect(back.latitudeDeg).toBeCloseTo(apollo11!.latitudeDeg, 5);
    expect(back.eastLongitudeDeg).toBeCloseTo(apollo11!.eastLongitudeDeg, 5);
    expect(y).toBeGreaterThan(0);
  });
});