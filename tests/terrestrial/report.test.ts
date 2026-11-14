import { describe, expect, it } from "vitest";
import { STATIONS } from "../../terrestrial/stations";
import { buildEarthReport } from "../../terrestrial/report";
import { EARTH_CAVEAT } from "../../terrestrial/types";

const TODAY = "2026-11-01";
const FORECAST_DATE = "2026-11-10";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function forecastPayload(date: string): unknown {
  return {
    daily: {
      time: [date],
      precipitation_sum: [12],
      precipitation_probability_max: [80],
      cloud_cover_mean: [60],
      wind_speed_10m_max: [18],
      temperature_2m_mean: [11.5],
    },
  };
}

function swpcPayload(date: string): unknown {
  return [
    ["time_tag", "kp"],
    [`${date} 00:00:00`, "2.00"],
  ];
}

function openMeteoUrl(latitude: number, longitude: number): string {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude}&longitude=${longitude}` +
    "&daily=precipitation_sum,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,temperature_2m_mean" +
    "&timezone=UTC&forecast_days=16&wind_speed_unit=kmh"
  );
}

describe("buildEarthReport", () => {
  it("uses the Open-Meteo forecast when the injected today is inside the window", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (url.includes("api.open-meteo.com")) return jsonResponse(forecastPayload(FORECAST_DATE));
      if (url.includes("services.swpc.noaa.gov")) return jsonResponse(swpcPayload(FORECAST_DATE));
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: FORECAST_DATE,
      today: TODAY,
      fetchImpl,
      credentials: null,
    });
    await buildEarthReport({ date: FORECAST_DATE, today: TODAY, fetchImpl, credentials: null });

    expect(report.date).toBe(FORECAST_DATE);
    expect(report.today).toBe(TODAY);
    expect(report.caveat).toBe(EARTH_CAVEAT);
    expect(report.weather.map((row) => row.stationId)).toEqual(STATIONS.map((station) => station.id));
    expect(report.moon.map((row) => row.stationId)).toEqual(STATIONS.map((station) => station.id));
    expect(urls.filter((url) => url.includes("api.open-meteo.com"))).toHaveLength(6);

    for (const station of STATIONS) {
      const row = report.weather.find((item) => item.stationId === station.id);
      expect(row?.regime).toBe("forecast");
      expect(row?.sourceName).toBe("Open-Meteo forecast");
      expect(row?.sourceUrl).toBe(openMeteoUrl(station.latitudeDeg, station.eastLongitudeDeg));
      expect(row?.precipitationMm).toBe(12);
      expect(row?.precipitationChancePercent).toBe(80);
      expect(row?.cloudCoverPercent).toBe(60);
      expect(row?.windSpeedMs).toBe(5);
      expect(row?.temperatureC).toBe(11.5);
      expect(row?.rainRisk).toBe("high");
      expect(row?.sentence).toContain("Forecast for this day");
      expect(row?.sentence.toLowerCase()).not.toContain("will rain");
    }

    expect(report.space.available).toBe(true);
    expect(report.space.storm).toBe(false);
    expect(report.space.sentence).toBe("No solar storm in the published forecast for this date.");
    for (const moon of report.moon) {
      expect(moon.timeUtc).toBe(`${FORECAST_DATE}T12:00:00.000Z`);
      expect(moon.elevationDeg).not.toBeNull();
    }
  });

  it("uses the date pattern when the forecast is empty, even if the storm forecast fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.open-meteo.com")) return jsonResponse({ daily: {} });
      if (url.includes("services.swpc.noaa.gov")) throw new Error("swpc down");
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: FORECAST_DATE,
      today: TODAY,
      fetchImpl,
      credentials: null,
    });

    expect(report.weather).toHaveLength(3);
    for (const station of STATIONS) {
      const row = report.weather.find((item) => item.stationId === station.id);
      expect(row?.regime).toBe("typical-for-this-date");
      expect(row?.sourceName).toBe("NASA POWER date climate");
      expect(row?.sentence).toContain("Usual for 10 November");
      expect(row?.sentence).toContain("not a promise for one future day");
      expect(row?.sentence.toLowerCase()).not.toContain("will rain");
    }
    expect(report.space.available).toBe(false);
    expect(report.space.sentence).toBe(
      "No published solar-storm forecast reaches this date. Storms are only forecast a few days ahead.",
    );
  });

  it("uses the past pattern for a far date and does not call the forecast", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("services.swpc.noaa.gov")) return jsonResponse([]);
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: "2027-07-20",
      today: TODAY,
      fetchImpl,
      credentials: null,
    });

    expect(urls.some((url) => url.includes("api.open-meteo.com") || url.includes("power.larc.nasa.gov"))).toBe(false);
    const goldstone = report.weather.find((row) => row.stationId === "goldstone");
    expect(goldstone?.regime).toBe("typical-for-this-date");
    expect(goldstone?.sourceName).toBe("NASA POWER date climate");
    expect(goldstone?.temperatureC).toBe(30);
    expect(goldstone?.rainRisk).toBe("low");
    expect(goldstone?.sentence).toContain("Usual for 20 July");
    expect(goldstone?.sentence).toContain("wet in 3 of those years");
    expect(report.space.available).toBe(false);
  });

  it("reads the recorded archive day and the stored Kp for Apollo 11", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("archive-api.open-meteo.com")) {
        return jsonResponse({
          daily: {
            time: ["1969-07-20"],
            temperature_2m_mean: [30.7],
            precipitation_sum: [0],
            wind_speed_10m_max: [4.22],
            cloud_cover_mean: [28],
          },
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: "1969-07-20",
      today: TODAY,
      fetchImpl,
      credentials: null,
    });

    expect(urls.every((url) => url.includes("archive-api.open-meteo.com"))).toBe(true);
    expect(urls).toHaveLength(3);
    const goldstone = report.weather.find((row) => row.stationId === "goldstone");
    expect(goldstone?.regime).toBe("history");
    expect(goldstone?.sourceName).toBe("Open-Meteo archive");
    expect(goldstone?.temperatureC).toBe(30.7);
    expect(goldstone?.windSpeedMs).toBe(4.22);
    expect(goldstone?.rainRisk).toBe("low");
    expect(goldstone?.sentence).toContain("Recorded on this day");
    expect(goldstone?.sentence.toLowerCase()).not.toContain("will rain");
    expect(report.space.sourceName).toBe("GFZ Kp index");
    expect(report.space.maxKp).toBeCloseTo(1.333, 3);
    expect(report.space.storm).toBe(false);
    expect(report.space.sentence).toContain("does not say the call failed");
  });

  it("rejects a date that is not a real day before any request", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not run");
    };
    await expect(
      buildEarthReport({ date: "2026-02-31", today: TODAY, fetchImpl, credentials: null }),
    ).rejects.toThrow(/invalid date/i);
  });
});
