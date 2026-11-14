import { describe, expect, it } from "vitest";
import { parseSwpcForecast } from "../../terrestrial/swpc";

const SOURCE = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

const payload = [
  ["Time_Tag", "Kp", "observed", "noaa_scale"],
  ["2026-12-05 00:00:00", "4.33", "predicted", null],
  ["2026-12-05 03:00:00", "6.00", "predicted", "G2"],
  ["2026-12-05 06:00:00", "n/a", "predicted", null],
  ["2026-12-06 00:00:00", 2.67, "predicted", null],
];

describe("parseSwpcForecast", () => {
  it("reads a storm day, a quiet day, and a date the file does not reach", () => {
    const storm = parseSwpcForecast(payload, "2026-12-05");
    expect(storm.available).toBe(true);
    expect(storm.maxKp).toBe(6);
    expect(storm.storm).toBe(true);
    expect(storm.sourceName).toBe("NOAA Space Weather Prediction Center");
    expect(storm.sourceUrl).toBe(SOURCE);
    expect(storm.sentence).toBe(
      "A solar storm is in the published forecast. It can make the signal flicker as it passes through the air above the dish.",
    );
    expect(storm.sentence.toLowerCase()).not.toContain("lost");

    const quiet = parseSwpcForecast(payload, "2026-12-06");
    expect(quiet.available).toBe(true);
    expect(quiet.maxKp).toBe(2.67);
    expect(quiet.storm).toBe(false);
    expect(quiet.sentence).toBe("No solar storm in the published forecast for this date.");

    const absent = parseSwpcForecast(payload, "2026-12-20");
    expect(absent.available).toBe(false);
    expect(absent.maxKp).toBeNull();
    expect(absent.storm).toBe(false);
    expect(absent.sentence).toBe(
      "No published solar-storm forecast reaches this date. Storms are only forecast a few days ahead.",
    );
  });

  it("does not throw when the file is not a headered table", () => {
    const broken = parseSwpcForecast({ error: "down" }, "2026-12-05");
    expect(broken.available).toBe(false);
    expect(broken.sourceUrl).toBe(SOURCE);
  });
});
