import { describe, expect, it } from "vitest";
import { kpSpaceWeather, maxKpOn } from "../data/kp";

describe("historical Kp", () => {
  it("keeps Apollo 11 under the storm line and flags a Kp of 5", () => {
    expect(maxKpOn("1969-07-20")).toBeCloseTo(1.333, 3);
    const quiet = kpSpaceWeather("1969-07-20");
    expect(quiet.storm).toBe(false);
    expect(quiet.sentence).toContain("1.3");
    expect(quiet.sentence).toContain("does not say the call failed");

    expect(maxKpOn("1958-12-31")).toBeNull();
    expect(kpSpaceWeather("2026-11-14").available).toBe(false);
  });
});