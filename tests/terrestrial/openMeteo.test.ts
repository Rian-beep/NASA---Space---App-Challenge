import { describe, expect, it } from "vitest";
import { parseOpenMeteoDay } from "../../terrestrial/openMeteo";

const payload = {
  daily: {
    time: ["2026-12-05", "2026-12-06"],
    precipitation_sum: [2, 0],
    precipitation_probability_max: [40, 10],
    cloud_cover_mean: [55, 20],
    wind_speed_10m_max: [18, 36],
    temperature_2m_mean: [8.5, 9],
  },
};

describe("parseOpenMeteoDay", () => {
  it("converts the daily wind from km/h to m/s", () => {
    const day = parseOpenMeteoDay(payload, "2026-12-05");
    expect(day).toEqual({
      precipitationMm: 2,
      precipitationChancePercent: 40,
      cloudCoverPercent: 55,
      windSpeedMs: 5,
      temperatureC: 8.5,
    });
    expect(parseOpenMeteoDay(payload, "2026-12-06").windSpeedMs).toBe(10);
  });

  it("returns nulls when the date is absent or the shape is wrong", () => {
    const missing = parseOpenMeteoDay(payload, "2026-12-07");
    expect(missing).toEqual({
      precipitationMm: null,
      precipitationChancePercent: null,
      cloudCoverPercent: null,
      windSpeedMs: null,
      temperatureC: null,
    });
    expect(parseOpenMeteoDay({ daily: {} }, "2026-12-05")).toEqual(missing);
    expect(() => parseOpenMeteoDay(null, "2026-12-05")).not.toThrow();
  });
});
