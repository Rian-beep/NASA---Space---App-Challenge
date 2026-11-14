import { describe, expect, it } from "vitest";
import { dateClimateSentence, normalFor, rainRiskFromDateNormal, type DateNormal } from "../data/climate";

const wet: DateNormal = {
  years: 30,
  temperatureC: 10,
  precipitationMm: 6,
  wetYears: 20,
  windSpeedMs: 13,
  cloudCoverPercent: 80,
};

describe("date climate", () => {
  it("raises the risk when the date is often wet or the average rain is high", () => {
    expect(rainRiskFromDateNormal(null)).toBe("unknown");
    expect(rainRiskFromDateNormal({ ...wet, precipitationMm: null })).toBe("unknown");
    expect(rainRiskFromDateNormal(wet)).toBe("high");
    expect(rainRiskFromDateNormal({ ...wet, precipitationMm: 0.2, wetYears: 5 })).toBe("low");
    expect(rainRiskFromDateNormal({ ...wet, precipitationMm: 1, wetYears: 3 })).toBe("elevated");
    expect(rainRiskFromDateNormal({ ...wet, precipitationMm: 0.4, wetYears: 6 })).toBe("elevated");
  });

  it("reads the NASA years for 20 July at Goldstone and names the past pattern", () => {
    const normal = normalFor("goldstone", "2027-07-20");
    expect(normal?.years).toBe(30);
    expect(normal?.temperatureC).toBe(30);
    expect(normal?.wetYears).toBe(3);
    expect(rainRiskFromDateNormal(normal)).toBe("low");
    const sentence = dateClimateSentence("Goldstone", "2027-07-20", normal!, "low");
    expect(sentence).toContain("Usual for 20 July");
    expect(sentence).toContain("not a promise for one future day");
    expect(sentence.toLowerCase()).not.toContain("will rain");
    const windy = dateClimateSentence("Goldstone", "2027-07-20", wet, "high");
    expect(windy).toContain("a gust can push the dish off the Moon");
  });

  it("keeps 29 February to the leap years", () => {
    expect(normalFor("madrid", "2028-02-29")?.years).toBe(8);
    expect(normalFor("canberra", "2027-07-20")?.temperatureC).toBeLessThan(10);
  });
});
