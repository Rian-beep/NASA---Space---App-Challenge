import { describe, expect, it } from "vitest";
import { STATIONS } from "../data/stations";
import { meteomaticsAuthorization, meteomaticsUrl, parseMeteomaticsDay } from "../data/meteomatics";
import { buildEarthReport } from "../data/report";

const DATE = "2026-11-20";
const LOGIN = { username: "dish-user", password: "dish-pass" };

function series(parameter: string, values: Array<number | null>): unknown {
  return {
    parameter,
    coordinates: [
      {
        lat: 35.4,
        lon: -116.9,
        dates: values.map((value, hour) => ({
          date: `${DATE}T${String(hour).padStart(2, "0")}:00:00Z`,
          value,
        })),
      },
    ],
  };
}

describe("parseMeteomaticsDay", () => {
  it("adds the hourly rain and keeps the strongest wind", () => {
    const day = parseMeteomaticsDay({
      status: "OK",
      data: [
        series("t_2m:C", [10, 20]),
        series("precip_1h:mm", [6, null, 5]),
        series("wind_speed_10m:ms", [4, 14]),
        series("effective_cloud_cover:p", [40, 60]),
      ],
    });
    expect(day.temperatureC).toBe(15);
    expect(day.precipitationMm).toBe(11);
    expect(day.windSpeedMs).toBe(14);
    expect(day.cloudCoverPercent).toBe(50);
    expect(day.precipitationChancePercent).toBeNull();
  });

  it("returns nulls when Meteomatics rejects the query", () => {
    expect(parseMeteomaticsDay({ status: "error", data: [] }).precipitationMm).toBeNull();
    expect(parseMeteomaticsDay(null).temperatureC).toBeNull();
  });
});

describe("Meteomatics above the dishes", () => {
  it("uses the dish login before the public forecast, and leaves the password out of the report", async () => {
    const headers: Array<Record<string, string>> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const sent = new Headers(init?.headers);
      headers.push({
        url,
        authorization: sent.get("authorization") ?? "",
      });
      if (url.includes("api.meteomatics.com")) {
        return new Response(
          JSON.stringify({
            status: "OK",
            data: [
              series("t_2m:C", [8]),
              series("precip_1h:mm", [0.2]),
              series("wind_speed_10m:ms", [3]),
              series("effective_cloud_cover:p", [25]),
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("services.swpc.noaa.gov")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: DATE,
      today: "2026-11-14",
      fetchImpl,
      credentials: LOGIN,
    });

    expect(report.weather.every((row) => row.sourceName === "Meteomatics")).toBe(true);
    expect(report.weather.every((row) => row.regime === "forecast")).toBe(true);
    expect(report.weather.every((row) => row.rainRisk === "low")).toBe(true);
    expect(headers.filter((item) => item.url.includes("api.meteomatics.com"))).toHaveLength(3);
    for (const station of STATIONS) {
      const row = report.weather.find((item) => item.stationId === station.id);
      expect(row?.sourceUrl).toBe(meteomaticsUrl(station.latitudeDeg, station.eastLongitudeDeg, DATE));
      expect(row?.sourceUrl).not.toContain(LOGIN.password);
      expect(row?.sourceUrl).not.toContain(LOGIN.username);
    }
    const authorization = headers.find((item) => item.url.includes("api.meteomatics.com"))?.authorization;
    expect(authorization).toBe(meteomaticsAuthorization(LOGIN.username, LOGIN.password));
  });

  it("falls back when the dish login is refused", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.meteomatics.com")) return new Response("no", { status: 401 });
      if (url.includes("power.larc.nasa.gov")) {
        return new Response(
          JSON.stringify({
            properties: {
              parameter: {
                PRECTOTCORR: { DEC: 0.1 },
                T2M: { DEC: 4 },
                WS10M: { DEC: 2 },
                CLOUD_AMT: { DEC: 15 },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("services.swpc.noaa.gov")) return new Response("[]", { status: 200 });
      throw new Error(`unexpected ${url}`);
    };

    const report = await buildEarthReport({
      date: DATE,
      today: "2026-11-14",
      fetchImpl,
      credentials: LOGIN,
    });
    expect(report.weather.every((row) => row.sourceName === "NASA POWER date climate")).toBe(true);
    expect(report.weather.every((row) => row.sentence.includes("not a promise for one future day"))).toBe(true);
  });
});
