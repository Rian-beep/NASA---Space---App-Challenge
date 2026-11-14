import type { RainRisk, WeatherRegime } from "./types";

function present(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** First match wins. A null side is ignored; unknown only when both sides are missing. */
export function rainRiskFromForecast(input: {
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
}): RainRisk {
  const chance = present(input.precipitationChancePercent)
    ? input.precipitationChancePercent
    : null;
  const mm = present(input.precipitationMm) ? input.precipitationMm : null;
  if (chance === null && mm === null) return "unknown";
  if ((chance !== null && chance >= 70) || (mm !== null && mm >= 10)) return "high";
  if ((chance !== null && chance >= 40) || (mm !== null && mm >= 1)) return "elevated";
  return "low";
}

/** Heavy rain or a strong gust in one hour. Thresholds are planning labels. */
export function groundStorm(input: {
  precipitationMm: number | null;
  windSpeedMs: number | null;
  gustSpeedMs: number | null;
}): boolean {
  const rain = present(input.precipitationMm) ? input.precipitationMm : 0;
  const gust = present(input.gustSpeedMs)
    ? input.gustSpeedMs
    : present(input.windSpeedMs)
      ? input.windSpeedMs
      : 0;
  return rain >= 2.5 || gust >= 17;
}

export function hourSentence(input: {
  name: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  groundStorm: boolean;
}): string {
  const temp = present(input.temperatureC) ? `${Math.round(input.temperatureC)}°C` : "temperature unknown";
  const rain = present(input.precipitationMm)
    ? `${input.precipitationMm.toFixed(1)} mm of rain`
    : "rain unknown";
  const wind = present(input.windSpeedMs) ? `wind ${Math.round(input.windSpeedMs)} m/s` : "wind unknown";
  const storm = input.groundStorm
    ? "A ground storm is in this hour: heavy rain or a strong gust."
    : "No ground storm in this hour.";
  return `This hour at ${input.name}: ${temp}, ${rain}, ${wind}. ${storm}`;
}

/** NASA POWER average millimetres per day. Null means we do not know. */
export function rainRiskFromTypical(precipitationMmPerDay: number | null): RainRisk {
  if (!present(precipitationMmPerDay)) return "unknown";
  if (precipitationMmPerDay >= 5) return "high";
  if (precipitationMmPerDay >= 1) return "elevated";
  return "low";
}

/**
 * One or two plain sentences. Typical weather describes the month.
 * It does not say rain will happen, and it does not judge the radio call.
 */
export function weatherSentence(input: {
  name: string;
  regime: WeatherRegime;
  rainRisk: RainRisk;
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
}): string {
  const lead =
    input.regime === "forecast"
      ? `Forecast for this day at ${input.name}`
      : `Typical for this month at ${input.name}`;
  const risk =
    input.rainRisk === "unknown" ? "rain risk is unknown" : `rain risk is ${input.rainRisk}`;
  const sentences = [`${lead}: ${risk}.`];
  if (present(input.windSpeedMs) && input.windSpeedMs >= 12) {
    sentences.push("The wind is high enough that a gust can push the dish off the Moon.");
  }
  return sentences.join(" ");
}
