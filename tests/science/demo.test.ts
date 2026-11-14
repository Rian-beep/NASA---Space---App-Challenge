import { describe, expect, it } from "vitest";
import { cacheKey, getDemoBundle } from "@/lib/science";

describe("offline demo bundle", () => {
  it("returns three example sites and does not throw", () => {
    expect(() => getDemoBundle()).not.toThrow();
    const bundle = getDemoBundle();
    expect(bundle.sites).toHaveLength(3);
    expect(bundle.sites.map((site) => site.id)).toEqual(["example-a", "example-b", "example-c"]);
    for (const site of bundle.sites) {
      expect(site.kind).toBe("example_analysis");
      expect(site.summary).toMatch(/NOT an officially designated landing site/);
    }
    expect(bundle.scenarios).toHaveLength(2);
    expect(bundle.baselineScenarioId).toBe("baseline");
    expect(bundle.terrain.heights).toHaveLength(bundle.terrain.rows * bundle.terrain.cols);
    expect(bundle.terrain.bodyRadiusM).toBe(1_737_400);
    expect(Object.keys(bundle.ephemerides).length).toBeGreaterThan(0);
    const sun = Object.values(bundle.ephemerides).find((series) => series.target === "sun");
    expect(sun?.source).toBe("demo_cache");
    expect(sun?.samples.length).toBeGreaterThan(24);
    const baseline = bundle.scenarios.find((scenario) => scenario.id === bundle.baselineScenarioId);
    expect(baseline).toBeTruthy();
    const stop = new Date(Date.parse(baseline!.arrivalUtc) + baseline!.durationHours * 3_600_000)
      .toISOString()
      .replace(".000Z", "Z");
    const key = cacheKey(baseline!.siteId, "sun", baseline!.arrivalUtc, stop, 1);
    expect(bundle.ephemerides[key]?.samples).toHaveLength(169);
    expect(bundle.ephemerides[key]?.request.COMMAND).toBe("10");
  });
});
