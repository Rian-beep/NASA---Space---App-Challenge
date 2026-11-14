"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { STATIONS } from "../../../terrestrial/stations";
import type { EarthDayReport, RainRisk, WeatherRegime } from "../../../terrestrial/types";
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

const RISK_WORD: Record<RainRisk, string> = {
  low: "Low",
  elevated: "Elevated",
  high: "High",
  unknown: "Unknown",
};

export function EarthStage({ date, onDate, loading, error, report }: EarthStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stations = useMemo(() => pinsFor(report), [report]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#07080d] text-stone-100 [color-scheme:dark] lg:h-screen lg:min-h-0 lg:flex-row-reverse lg:overflow-hidden">
      <div className="relative h-[14rem] w-full shrink-0 lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-1">
        <EarthView stations={stations} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <section
        aria-label="Earth dishes"
        className="flex w-full min-w-0 flex-col gap-3 border-t border-[#2c313c] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-full lg:min-h-0 lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:p-4"
      >
        <header className="min-w-0 bg-[#10131a] p-3">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-100">Earth dishes</h1>
          <p className="mt-1 text-pretty text-sm leading-6 text-stone-100">
            Weather at the three NASA listening sites, for the day you pick.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm text-stone-100 underline decoration-stone-500 underline-offset-2"
          >
            Moon view
          </Link>
        </header>

        <div className="min-w-0 bg-[#10131a] p-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">Day</span>
            <input
              type="date"
              value={date}
              onChange={(event) => onDate(event.target.value)}
              className="w-full min-w-0 border border-stone-500 bg-[#07080d] px-2 py-1.5 text-base text-stone-100 caret-stone-100"
            />
          </label>
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

        {report ? <ReportPanel report={report} selectedId={selectedId} onSelect={setSelectedId} /> : null}

        <footer className="min-w-0 text-pretty text-xs leading-5 text-stone-100">
          <p>NASA Blue Marble / Visible Earth. The cloud picture is not this date&apos;s forecast.</p>
          <p>Open-Meteo, NASA POWER, and NOAA.</p>
        </footer>
      </section>
    </div>
  );
}

function ReportPanel({
  report,
  selectedId,
  onSelect,
}: {
  report: EarthDayReport;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const regime = regimeWords(report);

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

function pinsFor(report: EarthDayReport | null): EarthStationPin[] {
  return STATIONS.map((station) => ({
    id: station.id,
    name: station.name,
    latitudeDeg: station.latitudeDeg,
    eastLongitudeDeg: station.eastLongitudeDeg,
    rainRisk: report?.weather.find((item) => item.stationId === station.id)?.rainRisk ?? "unknown",
  }));
}

function regimeWords(report: EarthDayReport): string | null {
  const words: string[] = [];
  const source = report.weather.length > 0 ? report.weather : [];
  for (const item of source) {
    const word = regimeWord(item.regime);
    if (!words.includes(word)) words.push(word);
  }
  return words.length > 0 ? words.join(" · ") : null;
}

function regimeWord(regime: WeatherRegime): string {
  return regime === "forecast" ? "Forecast" : "Typical for this month";
}

function moonWords(moonUp: boolean | null | undefined): string {
  if (moonUp === true) return "Moon up";
  if (moonUp === false) return "Moon down";
  return "Moon height unknown";
}
