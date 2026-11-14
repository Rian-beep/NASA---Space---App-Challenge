"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMissionDate, landedMissions } from "@/lib/sites/missions";
import { STATIONS } from "../../../terrestrial/stations";
import { earthFace, lunarView } from "../../../terrestrial/facing";
import { LUNAR_PLACES } from "../../../terrestrial/lunarPlaces";
import type { EarthDayReport, HourWeather, RainRisk, StationWeather } from "../../../terrestrial/types";
import type { EarthStationPin } from "./EarthGlobe";

const EarthView = dynamic(() => import("./EarthGlobe").then((mod) => mod.EarthGlobe), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#07080d]" aria-hidden="true" />,
});

type EarthStageProps = {
  date: string;
  onDate: (date: string) => void;
  loading: boolean;
  error: string | null;
  report: EarthDayReport | null;
};

const PRACTICE_DAY = "2026-12-05";

const RISK_WORD: Record<RainRisk, string> = {
  low: "Low",
  elevated: "Elevated",
  high: "High",
  unknown: "Unknown",
};

const MISSION_DAYS = landedMissions();

export function EarthStage({ date, onDate, loading, error, report }: EarthStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>("goldstone");
  const [placeId, setPlaceId] = useState(LUNAR_PLACES[1].id);
  const [hour, setHour] = useState(() => new Date().getUTCHours());
  const [missionId, setMissionId] = useState("");
  const place = LUNAR_PLACES.find((item) => item.id === placeId) ?? LUNAR_PLACES[0];
  const instant = `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const face = useMemo(() => {
    try {
      return earthFace(instant);
    } catch {
      return null;
    }
  }, [instant]);
  const view = useMemo(() => {
    try {
      return lunarView(place.id, place.latitudeDeg, place.eastLongitudeDeg, instant);
    } catch {
      return null;
    }
  }, [place, instant]);
  const stations = useMemo(() => pinsFor(report, hour), [report, hour]);
  const satelliteUrl =
    report && date <= report.today && date >= "2018-01-01" ? `/api/earth/picture?date=${date}` : null;
  const live = isLiveHour(report, date, hour);
  const missionsOnDay = MISSION_DAYS.filter((mission) => mission.dateUtc === date);

  function showLive() {
    const now = new Date();
    setMissionId("");
    onDate(now.toISOString().slice(0, 10));
    setHour(now.getUTCHours());
  }

  function pickMission(id: string) {
    setMissionId(id);
    const mission = MISSION_DAYS.find((item) => item.id === id);
    if (mission) onDate(mission.dateUtc);
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#07080d] text-stone-100 [color-scheme:dark] lg:h-screen lg:min-h-0 lg:flex-row-reverse lg:overflow-hidden">
      <div className="relative h-[14rem] w-full shrink-0 lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-1">
        <EarthView
          stations={stations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          aim={
            face
              ? {
                  latitudeDeg: face.latitudeDeg,
                  eastLongitudeDeg: face.eastLongitudeDeg,
                  label: "Faces the Moon",
                }
              : null
          }
          satelliteUrl={satelliteUrl}
        />
      </div>
      <section
        aria-label="Earth dishes"
        className="flex w-full min-w-0 flex-col gap-3 border-t border-[#2c313c] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-full lg:min-h-0 lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:p-4"
      >
        <header className="min-w-0 bg-[#10131a] p-3">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-100">Earth dishes</h1>
          <p className="mt-1 text-pretty text-sm leading-6 text-stone-100">
            {live
              ? "Live weather this hour above the three NASA dishes, on the side of Earth turned toward the Moon."
              : "The side of Earth turned toward the Moon, and the weather above the three NASA dishes."}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className="text-sm text-stone-100 underline decoration-stone-500 underline-offset-2">
              Moon view
            </Link>
            <Link href="/sun" className="text-sm text-stone-100 underline decoration-stone-500 underline-offset-2">
              Sun and flares
            </Link>
          </p>
        </header>

        <div className="min-w-0 bg-[#10131a] p-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">Past mission</span>
            <select
              value={missionId}
              onChange={(event) => pickMission(event.target.value)}
              className="w-full min-w-0 border border-stone-500 bg-[#07080d] px-2 py-1.5 text-base text-stone-100"
            >
              <option value="">Choose a mission day</option>
              {MISSION_DAYS.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {formatMissionDate(mission.dateUtc)} · {mission.name}
                </option>
              ))}
            </select>
          </label>
          {missionsOnDay.length > 0 ? (
            <p className="mt-2 text-pretty text-sm leading-6 text-stone-100">
              {missionsOnDay.map((mission) => mission.name).join(", ")}. The dishes show the recorded weather for
              that day, and the Kp line is the storm index for that date. The Sun page lists flares for the last 7
              days. Older mission days use this Kp index.
            </p>
          ) : null}
          <label className="mt-3 flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">Day</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setMissionId("");
                onDate(event.target.value);
              }}
              className="w-full min-w-0 border border-stone-500 bg-[#07080d] px-2 py-1.5 text-base text-stone-100 caret-stone-100"
            />
          </label>
          <label className="mt-3 flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">Hour, UTC</span>
            <input
              type="range"
              min={0}
              max={23}
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
            />
            <span>
              {String(hour).padStart(2, "0")}:00 UTC{live ? " · Live" : ""}
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={showLive}
              className="border border-stone-500 px-2 py-1.5 text-sm text-stone-100"
            >
              Live now
            </button>
            <button
              type="button"
              onClick={() => {
                setMissionId("");
                onDate(PRACTICE_DAY);
              }}
              className="border border-stone-500 px-2 py-1.5 text-sm text-stone-100"
            >
              Practice day
            </button>
          </div>
          <label className="mt-3 flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">Place on the Moon</span>
            <select
              value={place.id}
              onChange={(event) => setPlaceId(event.target.value)}
              className="w-full min-w-0 border border-stone-500 bg-[#07080d] px-2 py-1.5 text-base text-stone-100"
            >
              {LUNAR_PLACES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {face ? (
            <p className="mt-3 text-pretty text-sm leading-6 text-stone-100">
              At this hour the Moon is overhead near {formatLat(face.latitudeDeg)},{" "}
              {formatLon(face.eastLongitudeDeg)}. That is the middle of the side you would see from the Moon.
              Earth&apos;s spin moves it. The place you pick on the Moon barely moves that middle, because the Moon
              is small next to the distance to Earth.
            </p>
          ) : null}
          {view ? (
            <p className="mt-2 text-pretty text-sm leading-6 text-stone-100">
              From {place.name}, the centre of Earth is {view.earthAboveHorizon ? "above" : "below"} the Moon&apos;s
              own horizon, before hills.
            </p>
          ) : null}
          {loading && !report ? (
            <p className="mt-3 text-sm leading-6 text-stone-100" role="status">
              Reading weather…
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 break-words text-sm leading-6 text-stone-100" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {report ? (
          <ReportPanel report={report} hour={hour} live={live} selectedId={selectedId} onSelect={setSelectedId} />
        ) : null}

        <footer className="min-w-0 text-pretty text-xs leading-5 text-stone-100">
          <p>
            NASA Blue Marble covers the whole globe. On a day that already happened, the sunlit part is a NASA
            VIIRS satellite picture from that day. The satellite does not photograph the whole Earth at once, so
            the rest stays Blue Marble.
          </p>
          <p>
            {sourceLine(report)} A future date beyond the forecast uses NASA daily records for that month and day,
            1991–2020. A past day uses the recorded weather. Kp on a past day is from GFZ. Recent solar storms are
            from NOAA.
          </p>
        </footer>
      </section>
    </div>
  );
}

function ReportPanel({
  report,
  hour,
  live,
  selectedId,
  onSelect,
}: {
  report: EarthDayReport;
  hour: number;
  live: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const regime = regimeWords(report, live);

  return (
    <div className="flex min-w-0 flex-col gap-3 bg-[#10131a] p-3">
      {regime ? <p className="text-sm font-medium text-stone-100">{regime}</p> : null}
      <ul className="flex min-w-0 flex-col gap-2" aria-label="Listening sites">
        {STATIONS.map((station) => {
          const weather = report.weather.find((item) => item.stationId === station.id);
          const moon = report.moon.find((item) => item.stationId === station.id);
          const risk = weather?.rainRisk ?? "unknown";
          const selected = station.id === selectedId;
          return (
            <li key={station.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(station.id)}
                className={`block w-full min-w-0 break-words px-2 py-2 text-left ${
                  selected ? "bg-stone-100 text-stone-950" : "text-stone-100 hover:bg-[#1c2230]"
                }`}
              >
                <span className="block text-sm font-medium">{station.name}</span>
                <span className={`block text-xs leading-5 ${selected ? "text-stone-700" : "text-stone-300"}`}>
                  {station.place} · {station.dish}
                </span>
                <span className="mt-1 block text-sm leading-6">Rain risk {RISK_WORD[risk]}</span>
                <span className="block text-sm leading-6">{moonWords(moon?.moonUp)}</span>
                {hourLine(weather?.hours, hour) ? (
                  <span className="mt-1 block text-pretty text-sm leading-6">{hourLine(weather?.hours, hour)}</span>
                ) : null}
                {weather?.sentence ? (
                  <span className="mt-1 block text-pretty text-sm leading-6">{weather.sentence}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-pretty text-sm leading-6 text-stone-100">{report.space.sentence}</p>
      <p className="text-pretty text-sm leading-6 text-stone-100">{report.caveat}</p>
    </div>
  );
}

function pinsFor(report: EarthDayReport | null, hour: number): EarthStationPin[] {
  return STATIONS.map((station) => {
    const weather = report?.weather.find((item) => item.stationId === station.id);
    const sample = weather?.hours?.find((item) => new Date(item.timeUtc).getUTCHours() === hour);
    return {
      id: station.id,
      name: station.name,
      latitudeDeg: station.latitudeDeg,
      eastLongitudeDeg: station.eastLongitudeDeg,
      rainRisk: weather?.rainRisk ?? "unknown",
      groundStorm: sample?.groundStorm ?? false,
    };
  });
}

function isLiveHour(report: EarthDayReport | null, date: string, hour: number): boolean {
  if (!report || date !== report.today || hour !== new Date().getUTCHours()) return false;
  return report.weather.some((item) => item.regime === "forecast");
}

function regimeWords(report: EarthDayReport, live: boolean): string | null {
  const words: string[] = [];
  for (const item of report.weather) {
    const word = wordFor(item, live);
    if (!words.includes(word)) words.push(word);
  }
  return words.length > 0 ? words.join(" · ") : null;
}

function wordFor(item: StationWeather, live: boolean): string {
  if (item.regime === "forecast") return live ? "Live this hour" : "Forecast";
  if (item.regime === "history") return "Recorded on this day";
  if (item.sourceName === "NASA POWER date climate") return "Usual for this date";
  return "Typical for this month";
}

function moonWords(moonUp: boolean | null | undefined): string {
  if (moonUp === true) return "Moon up";
  if (moonUp === false) return "Moon down";
  return "Moon height unknown";
}

function hourLine(hours: HourWeather[] | undefined, hour: number): string | null {
  const sample = hours?.find((item) => new Date(item.timeUtc).getUTCHours() === hour);
  return sample?.sentence ?? null;
}

function sourceLine(report: EarthDayReport | null): string {
  if (!report || report.weather.length === 0) {
    return "Dish weather uses Meteomatics when a login is set. Otherwise Open-Meteo and NASA POWER.";
  }
  const names = [...new Set(report.weather.map((item) => item.sourceName))];
  return `${names.join(", ")} for the weather above each dish.`;
}

function formatLat(degrees: number): string {
  const side = degrees >= 0 ? "N" : "S";
  return `${Math.abs(degrees).toFixed(1)}° ${side}`;
}

function formatLon(degrees: number): string {
  const side = degrees >= 0 ? "E" : "W";
  return `${Math.abs(degrees).toFixed(1)}° ${side}`;
}
