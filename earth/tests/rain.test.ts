import { describe, expect, it } from "vitest";
import { rainRiskFromForecast, rainRiskFromTypical, weatherSentence } from "../data/rain";

const sentenceBase = {
  name: "Goldstone",
  precipitationMm: 2,
  precipitationChancePercent: null as number | null,
  cloudCoverPercent: 40,
  windSpeedMs: 3,
};

describe("rainRiskFromForecast", () => {
  it("follows the first matching threshold and ignores a null side", () => {
    expect(rainRiskFromForecast({ precipitationMm: null, precipitationChancePercent: null })).toBe(
      "unknown",
    );
    expect(rainRiskFromForecast({ precipitationMm: 10, precipitationChancePercent: null })).toBe(
      "high",
    );
    expect(rainRiskFromForecast({ precipitationMm: null, precipitationChancePercent: 70 })).toBe(
      "high",
    );
    expect(rainRiskFromForecast({ precipitationMm: 9.9, precipitationChancePercent: 69 })).toBe(
      "elevated",
    );
    expect(rainRiskFromForecast({ precipitationMm: 1, precipitationChancePercent: null })).toBe(
      "elevated",
    );
    expect(rainRiskFromForecast({ precipitationMm: null, precipitationChancePercent: 40 })).toBe(
      "elevated",
    );
    expect(rainRiskFromForecast({ precipitationMm: 0.9, precipitationChancePercent: 39 })).toBe(
      "low",
    );
    expect(rainRiskFromForecast({ precipitationMm: 0, precipitationChancePercent: null })).toBe(
      "low",
    );
    expect(rainRiskFromForecast({ precipitationMm: null, precipitationChancePercent: 0 })).toBe(
      "low",
    );
  });
});

describe("rainRiskFromTypical", () => {
  it("labels the monthly average and treats null as unknown", () => {
    expect(rainRiskFromTypical(null)).toBe("unknown");
    expect(rainRiskFromTypical(5)).toBe("high");
    expect(rainRiskFromTypical(4.9)).toBe("elevated");
    expect(rainRiskFromTypical(1)).toBe("elevated");
    expect(rainRiskFromTypical(0.9)).toBe("low");
  });
});

describe("weatherSentence", () => {
  it("calls a monthly normal typical and does not say it will rain", () => {
    const sentence = weatherSentence({
      ...sentenceBase,
      regime: "typical-for-this-date",
      rainRisk: "elevated",
    });
    expect(sentence).toContain("Typical for this month");
    expect(sentence.toLowerCase()).not.toContain("will rain");
    expect(sentence.toLowerCase()).not.toContain("wind");
  });

  it("names the forecast and mentions wind only at 12 m/s", () => {
    const calm = weatherSentence({
      ...sentenceBase,
      regime: "forecast",
      rainRisk: "low",
      windSpeedMs: 11.9,
    });
    expect(calm).toContain("Forecast for this day");
    expect(calm.toLowerCase()).not.toContain("wind");

    const windy = weatherSentence({
      ...sentenceBase,
      regime: "forecast",
      rainRisk: "high",
      windSpeedMs: 12,
    });
    expect(windy.toLowerCase()).toContain("wind");
    expect(windy).toContain("a gust can push the dish off the Moon");
    expect(windy.toLowerCase()).not.toContain("will rain");
  });
});
