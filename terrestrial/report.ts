import { meteomaticsAuthorization, meteomaticsUrl, parseMeteomaticsDay, parseMeteomaticsHours } from "./meteomatics";
import { moonAtStation } from "./moon";
import { parseOpenMeteoDay } from "./openMeteo";
import { parsePowerMonth } from "./power";
import { rainRiskFromForecast, rainRiskFromTypical, weatherSentence, groundStorm, hourSentence } from "./rain";
import { isIsoDate, regimeForDate } from "./regime";
import { STATIONS } from "./stations";
import { parseSwpcForecast } from "./swpc";
import {
  EARTH_CAVEAT,
  type EarthDayReport,
  type SpaceWeather,
  type Station,
  type StationWeather,
  type HourWeather,
  type WeatherRegime,
} from "./types";

const SWPC_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 32;

type DayValues = {
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  cloudCoverPercent: number | null;
  windSpeedMs: number | null;
  temperatureC: number | null;
};

type CacheEntry = {
  storedAt: number;
  report: EarthDayReport;
};

type MeteomaticsLogin = {
  username: string;
  password: string;
};

function resolveLogin(credentials: MeteomaticsLogin | null | undefined): MeteomaticsLogin | null {
  if (credentials === null) return null;
  if (credentials && credentials.username.trim() && credentials.password.trim()) {
    return { username: credentials.username.trim(), password: credentials.password.trim() };
  }
  const username = process.env.METEOMATICS_USERNAME?.trim() ?? "";
  const password = process.env.METEOMATICS_PASSWORD?.trim() ?? "";
  if (!username || !password) return null;
  return { username, password };
}

const reportCache = new Map<string, CacheEntry>();

function openMeteoUrl(station: Station): string {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${station.latitudeDeg}` +
    `&longitude=${station.eastLongitudeDeg}` +
    "&daily=precipitation_sum,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,temperature_2m_mean" +
    "&timezone=UTC&forecast_days=16&wind_speed_unit=kmh"
  );
}

function powerUrl(station: Station): string {
  return (
    "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    "?parameters=PRECTOTCORR,T2M,WS10M,CLOUD_AMT&community=RE" +
    `&longitude=${station.eastLongitudeDeg}` +
    `&latitude=${station.latitudeDeg}` +
    "&format=JSON"
  );
}

function requestInit(): RequestInit {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(12_000) };
  }
  return {};
}

async function fetchJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchFn(url, requestInit());
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

function blank(values: DayValues): boolean {
  return (
    values.precipitationMm === null &&
    values.precipitationChancePercent === null &&
    values.cloudCoverPercent === null &&
    values.windSpeedMs === null &&
    values.temperatureC === null
  );
}

function toWeather(
  station: Station,
  date: string,
  regime: WeatherRegime,
  sourceName: string,
  sourceUrl: string,
  values: DayValues,
  hours: HourWeather[] = [],
): StationWeather {
  const rainRisk =
    regime === "forecast"
      ? rainRiskFromForecast(values)
      : rainRiskFromTypical(values.precipitationMm);
  return {
    stationId: station.id,
    date,
    regime,
    sourceName,
    sourceUrl,
    precipitationMm: values.precipitationMm,
    precipitationChancePercent: values.precipitationChancePercent,
    cloudCoverPercent: values.cloudCoverPercent,
    windSpeedMs: values.windSpeedMs,
    temperatureC: values.temperatureC,
    rainRisk,
    sentence: weatherSentence({
      name: station.name,
      regime,
      rainRisk,
      precipitationMm: values.precipitationMm,
      precipitationChancePercent: values.precipitationChancePercent,
      cloudCoverPercent: values.cloudCoverPercent,
      windSpeedMs: values.windSpeedMs,
    }),
    hours,
  };
}

async function powerWeather(
  station: Station,
  date: string,
  fetchFn: typeof fetch,
): Promise<StationWeather> {
  const url = powerUrl(station);
  const month = Number(date.slice(5, 7)) - 1;
  try {
    const payload = await fetchJson(fetchFn, url);
    const parsed = parsePowerMonth(payload, month);
    return toWeather(station, date, "typical-for-this-date", "NASA POWER", url, {
      ...parsed,
      precipitationChancePercent: null,
    });
  } catch {
    return toWeather(station, date, "typical-for-this-date", "NASA POWER", url, {
      precipitationMm: null,
      precipitationChancePercent: null,
      cloudCoverPercent: null,
      windSpeedMs: null,
      temperatureC: null,
    });
  }
}

async function meteomaticsWeather(
  station: Station,
  date: string,
  fetchFn: typeof fetch,
  login: MeteomaticsLogin,
): Promise<StationWeather | null> {
  const url = meteomaticsUrl(station.latitudeDeg, station.eastLongitudeDeg, date);
  try {
    const response = await fetchFn(url, {
      ...requestInit(),
      headers: {
        Accept: "application/json",
        Authorization: meteomaticsAuthorization(login.username, login.password),
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const values = parseMeteomaticsDay(payload);
    if (blank(values)) return null;
    const hours = parseMeteomaticsHours(payload).map((hour) => {
      const storm = groundStorm(hour);
      return {
        ...hour,
        groundStorm: storm,
        sentence: hourSentence({
          name: station.name,
          temperatureC: hour.temperatureC,
          precipitationMm: hour.precipitationMm,
          windSpeedMs: hour.windSpeedMs,
          groundStorm: storm,
        }),
      };
    });
    return toWeather(station, date, "forecast", "Meteomatics", url, values, hours);
  } catch {
    return null;
  }
}

async function stationWeather(
  station: Station,
  date: string,
  regime: WeatherRegime,
  fetchFn: typeof fetch,
  login: MeteomaticsLogin | null,
): Promise<StationWeather> {
  if (login) {
    const direct = await meteomaticsWeather(station, date, fetchFn, login);
    if (direct) return direct;
  }
  if (regime === "forecast") {
    const url = openMeteoUrl(station);
    try {
      const payload = await fetchJson(fetchFn, url);
      const day = parseOpenMeteoDay(payload, date);
      if (!blank(day)) {
        return toWeather(station, date, "forecast", "Open-Meteo forecast", url, day);
      }
    } catch {
      // The published forecast did not answer. Fall through to the monthly typical.
    }
  }
  return powerWeather(station, date, fetchFn);
}

async function spaceWeather(date: string, fetchFn: typeof fetch): Promise<SpaceWeather> {
  try {
    const payload = await fetchJson(fetchFn, SWPC_URL);
    return parseSwpcForecast(payload, date);
  } catch {
    return parseSwpcForecast(null, date);
  }
}

function readCache(key: string): EarthDayReport | null {
  const hit = reportCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > CACHE_TTL_MS) {
    reportCache.delete(key);
    return null;
  }
  return structuredClone(hit.report);
}

function writeCache(key: string, report: EarthDayReport): void {
  if (reportCache.has(key)) reportCache.delete(key);
  reportCache.set(key, { storedAt: Date.now(), report: structuredClone(report) });
  while (reportCache.size > CACHE_MAX) {
    const oldest = reportCache.keys().next().value;
    if (oldest === undefined) break;
    reportCache.delete(oldest);
  }
}

/**
 * Weather, solar-storm line, and Moon height for the three dishes.
 * `today` is injected so the forecast window does not depend on the clock.
 * A caller-supplied fetch is not cached, so tests cannot poison each other.
 */
export async function buildEarthReport(input: {
  date: string;
  today: string;
  fetchImpl?: typeof fetch;
  /** Pass null in tests. Omit to read METEOMATICS_USERNAME and METEOMATICS_PASSWORD. */
  credentials?: MeteomaticsLogin | null;
}): Promise<EarthDayReport> {
  const { date, today, fetchImpl } = input;
  if (!isIsoDate(date) || !isIsoDate(today)) {
    throw new Error("Invalid date");
  }

  const login = resolveLogin(input.credentials);
  const cacheKey = `${date}|${today}|${login ? login.username : "public"}`;
  if (!fetchImpl) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  const regime = regimeForDate(date, today);
  const [weather, space] = await Promise.all([
    Promise.all(STATIONS.map((station) => stationWeather(station, date, regime, fetchFn, login))),
    spaceWeather(date, fetchFn),
  ]);
  const moonTime = `${date}T12:00:00.000Z`;
  const report: EarthDayReport = {
    date,
    today,
    weather,
    space,
    moon: STATIONS.map((station) => moonAtStation(station, moonTime)),
    caveat: EARTH_CAVEAT,
  };

  if (!fetchImpl) writeCache(cacheKey, report);
  return report;
}
