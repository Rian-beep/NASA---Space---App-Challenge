import { describe, expect, it } from "vitest";
import { classFromFlux, flareSentence, parseRecentFlares, parseXrayFlux, readSun } from "../../terrestrial/flares";

const NOW = Date.parse("2026-11-14T13:10:00Z");

describe("solar flares", () => {
  it("names the GOES class from the X-ray flux", () => {
    expect(classFromFlux(2.4e-6)).toEqual({ label: "C2.4", scale: "C" });
    expect(classFromFlux(3e-5).scale).toBe("M");
    expect(classFromFlux(2e-4).scale).toBe("X");
    expect(classFromFlux(5e-8).scale).toBe("A");
  });

  it("keeps the latest long-wave flux and the strongest recent flares", () => {
    const flux = [
      { time_tag: "2026-11-14T13:00:00Z", energy: "0.05-0.4nm", flux: 1 },
      { time_tag: "2026-11-14T13:00:00Z", energy: "0.1-0.8nm", flux: 1.2e-6 },
      { time_tag: "2026-11-14T13:05:00Z", energy: "0.1-0.8nm", flux: 4.4e-6 },
    ];
    expect(parseXrayFlux(flux, NOW).flux).toBe(4.4e-6);

    const flares = parseRecentFlares(
      [
        { begin_time: "2026-11-14T06:02:00Z", max_time: "2026-11-14T06:06:00Z", end_time: "2026-11-14T06:08:00Z", max_class: "C4.4" },
        { begin_time: "2026-11-14T12:00:00Z", max_time: "2026-11-14T12:10:00Z", end_time: "2026-11-14T13:20:00Z", max_class: "M2.1" },
      ],
      NOW,
    );
    expect(flares[0].maxClass).toBe("M2.1");
    expect(flares[0].ongoing).toBe(true);
    expect(flares[1].ongoing).toBe(false);

    const reading = readSun(flux, [
      { begin_time: "2026-11-14T06:02:00Z", max_time: "2026-11-14T06:06:00Z", end_time: "2026-11-14T06:08:00Z", max_class: "C4.4" },
    ], NOW);
    expect(reading.currentClass).toBe("C4.4");
    expect(reading.sentence).toContain("small solar flare");
    expect(flareSentence("X")).toContain("does not say the dish call will fail");
  });
});
