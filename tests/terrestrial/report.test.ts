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

function monthTable(month: string, value: number): Record<string, number> {
  const keys = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return Object.fromEntries(keys.map((key) => [key, key === month ? value : -999]));
}

function powerPayload(month: string, values: {
  precipitationMm: number;
  temperatureC: number;
  windSpeedMs: number;
  cloudCoverPercent: number;
}): unknown {
  return {
    properties: {
      parameter: {
        PRECTOTCORR: monthTable(month, values.precipitationMm),
        T2M: monthTable(month, values.temperatureC),
        WS10M: monthTable(month, values.windSpeedMs),
        CLOUD_AMT: monthTable(month, values.cloudCoverPercent),
      },
    },
  };
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

function powerUrl(latitude: number, longitude: number): string {
  return (
    "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    "?parameters=PRECTOTCORR,T2M,WS10M,CLOUD_AMT&community=RE" +
    `&longitude=${longitude}&latitude=${latitude}&format=JSON`
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

  it("falls back to POWER when Open-Meteo returns an empty daily object, even if SWPC fails", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("api.open-meteo.com")) return jsonResponse({ daily: {} });
      if (url.includes("power.larc.nasa.gov")) {
        return jsonResponse(
          powerPayload("NOV", {
            precipitationMm: 2.5,
            temperatureC: 7,
            windSpeedMs: 13,
            cloudCoverPercent: 80,
          }),
        );
      }
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
    expect(report.moon).toHaveLength(3);
    expect(urls.filter((url) => url.includes("power.larc.nasa.gov"))).toHaveLength(3);
    for (const station of STATIONS) {
      const row = report.weather.find((item) => item.stationId === station.id);
      expect(row?.regime).toBe("typical-for-this-date");
      expect(row?.sourceName).toBe("NASA POWER");
      expect(row?.sourceUrl).toBe(powerUrl(station.latitudeDeg, station.eastLongitudeDeg));
      expect(row?.precipitationMm).toBe(2.5);
      expect(row?.precipitationChancePercent).toBeNull();
      expect(row?.windSpeedMs).toBe(13);
      expect(row?.temperatureC).toBe(7);
      expect(row?.cloudCoverPercent).toBe(80);
      expect(row?.rainRisk).toBe("elevated");
      expect(row?.sentence).toContain("Typical for this month");
      expect(row?.sentence.toLowerCase()).not.toContain("will rain");
      expect(row?.sentence).toContain("a gust can push the dish off the Moon");
    }
    expect(report.space.available).toBe(false);
    expect(report.space.maxKp).toBeNull();
    expect(report.space.sentence).toBe(
      "No published solar-storm forecast reaches this date. Storms are only forecast a few days ahead.",
    );
  });

  it("asks NASA POWER for a day outside the injected window and does not call Open-Meteo", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("api.open-meteo.com")) throw new Error("forecast was not the regime");
      if (url.includes("power.larc.nasa.gov")) {
        return jsonResponse(
          powerPayload("OCT", {
            precipitationMm: 0.2,
            temperatureC: 16,
            windSpeedMs: 3,
            cloudCoverPercent: 20,
          }),
        );
      }
      if (url.includes("services.swpc.noaa.gov")) return jsonResponse([]);
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: "2026-10-20",
      today: TODAY,
      fetchImpl,
      credentials: null,
    });

    expect(urls.some((url) => url.includes("api.open-meteo.com"))).toBe(false);
    expect(report.weather.every((row) => row.regime === "typical-for-this-date")).toBe(true);
    expect(report.weather.every((row) => row.precipitationMm === 0.2)).toBe(true);
    expect(report.weather.every((row) => row.rainRisk === "low")).toBe(true);
    expect(report.space.available).toBe(false);
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
