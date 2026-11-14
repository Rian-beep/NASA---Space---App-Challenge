import { describe, expect, it } from "vitest";
import { historySentence, parseArchiveDay, parsePowerDay, powerDailyCovers } from "../../terrestrial/archive";

describe("recorded days", () => {
  it("reads a NASA daily point and leaves the wind in metres per second", () => {
    expect(powerDailyCovers("1981-01-01")).toBe(true);
    expect(powerDailyCovers("1969-07-20")).toBe(false);
    const day = parsePowerDay(
      {
        properties: {
          parameter: {
            T2M: { "20240222": 10.96 },
            PRECTOTCORR: { "20240222": 0 },
            WS10M: { "20240222": 1.76 },
            CLOUD_AMT: { "20240222": -999 },
          },
        },
      },
      "2024-02-22",
    );
    expect(day).toEqual({
      precipitationMm: 0,
      precipitationChancePercent: null,
      cloudCoverPercent: null,
      windSpeedMs: 1.76,
      temperatureC: 10.96,
    });
    expect(parsePowerDay({ messages: ["no"] }, "2024-02-22").temperatureC).toBeNull();
  });

  it("reads an archive day without converting wind again", () => {
    const day = parseArchiveDay(
      {
        daily: {
          time: ["1969-07-20"],
          temperature_2m_mean: [30.7],
          precipitation_sum: [0],
          wind_speed_10m_max: [4.22],
          cloud_cover_mean: [28],
        },
      },
      "1969-07-20",
    );
    expect(day.windSpeedMs).toBe(4.22);
    expect(day.temperatureC).toBe(30.7);
    const sentence = historySentence({
      name: "Goldstone",
      rainRisk: "low",
      temperatureC: 30.7,
      precipitationMm: 0,
      windSpeedMs: 4.22,
    });
    expect(sentence).toContain("Recorded on this day at Goldstone");
    expect(sentence).toContain("31°C");
    expect(sentence.toLowerCase()).not.toContain("failed");
  });
});
