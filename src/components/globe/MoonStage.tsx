"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  MISSION_SOURCE_URL,
  MISSIONS,
  MOON_IMAGE_CREDIT,
  formatMissionDate,
  isImpact,
  missionById,
  missionPrograms,
  outcomePhrase,
  type MissionSite,
} from "@/lib/sites/missions";
import { formatLatitude, formatLongitude } from "./geo";
import type { GlobeMarker } from "./MoonGlobe";

const MoonView = dynamic(() => import("./MoonGlobe").then((mod) => mod.MoonGlobe), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#07080d]" aria-hidden="true" />,
});

type MoonStageProps = {
  markers: GlobeMarker[];
  selectedId: string;
  practiceIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onPickCoordinates: (latitudeDeg: number, eastLongitudeDeg: number) => void;
};

export function MoonStage({
  markers,
  selectedId,
  practiceIds,
  onSelect,
  onPickCoordinates,
}: MoonStageProps) {
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("all");
  const [showImpacts, setShowImpacts] = useState(false);
  const programs = useMemo(() => missionPrograms(), []);
  const mission = missionById(selectedId);
  const picked = markers.find((marker) => marker.id === selectedId) ?? null;
  const practice = practiceIds.has(selectedId);
  const listed = useMemo(
    () => filterMissions(query, program, showImpacts),
    [program, query, showImpacts],
  );
  const practiceListed = useMemo(() => {
    if (program !== "all" && program !== "practice") return [];
    const needle = query.trim().toLowerCase();
    return markers.filter((marker) => {
      if (marker.tone !== "practice") return false;
      if (!needle) return true;
      return marker.name.toLowerCase().includes(needle);
    });
  }, [markers, program, query]);

  return (
    <div className="flex h-svh max-h-svh w-full flex-col overflow-hidden bg-[#07080d] lg:h-screen lg:max-h-screen lg:flex-row-reverse">
      <div className="relative h-[34svh] w-full shrink-0 overflow-hidden lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-1">
        <MoonView
          markers={markers}
          selectedId={selectedId}
          showImpacts={showImpacts}
          onSelect={onSelect}
          onPickCoordinates={onPickCoordinates}
        />
      </div>
      <section
        aria-label="Find a place"
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-[#2c313c] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-full lg:w-[22rem] lg:flex-none lg:border-r lg:border-t-0 lg:p-4"
      >
        <header className="shrink-0 bg-[#10131a] p-3">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-50">Lunar Window</h1>
          <p className="mt-1 text-pretty text-sm leading-6 text-stone-200">
            Turn the Moon, pick a past mission, or click the ground to set your own coordinates. Not a flight check, and not an approval to land.
          </p>
        </header>
        <SelectedCard mission={mission} picked={picked} practice={practice} />
        <form
          className="flex min-h-0 flex-1 flex-col gap-2 bg-[#10131a] p-3 text-stone-100"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex shrink-0 flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Find a mission</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Apollo, Chang’e, south…"
                className="w-full border border-stone-500 bg-[#07080d] px-2 py-1.5 text-stone-50 placeholder:text-stone-400"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex min-w-0 items-center gap-2">
                <span className="sr-only">Which missions</span>
                <select
                  value={program}
                  onChange={(event) => setProgram(event.target.value)}
                  className="max-w-full border border-stone-500 bg-[#07080d] px-2 py-1 text-stone-50"
                >
                  <option value="all">All landings</option>
                  <option value="practice">Practice spots</option>
                  {programs.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showImpacts}
                  onChange={(event) => setShowImpacts(event.target.checked)}
                />
                Show impacts
              </label>
            </div>
          </div>
          <ul
            className="min-h-[6rem] min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:#78716c_transparent]"
            aria-label="Places on the Moon"
          >
            {practiceListed.map((marker) => (
              <li key={marker.id}>
                <PlaceButton
                  pressed={marker.id === selectedId}
                  title={marker.name}
                  detail="Practice spot. Not an official landing site."
                  onClick={() => onSelect(marker.id)}
                />
              </li>
            ))}
            {listed.map((item) => (
              <li key={item.id}>
                <PlaceButton
                  pressed={item.id === selectedId}
                  title={item.name}
                  detail={`${outcomePhrase(item.outcome)} · ${formatMissionDate(item.dateUtc)} · ${item.country}`}
                  onClick={() => onSelect(item.id)}
                />
              </li>
            ))}
            {practiceListed.length + listed.length === 0 ? (
              <li className="px-1 py-2 text-sm text-stone-300">No mission matches that search.</li>
            ) : null}
          </ul>
          <p className="shrink-0 text-pretty text-xs leading-5 text-stone-300">
            <a className="underline decoration-stone-500 underline-offset-2" href={MISSION_SOURCE_URL}>
              NASA spacecraft list
            </a>
            . {MOON_IMAGE_CREDIT} Drag to turn. Scroll to move closer. Click empty ground for your own coordinates.
          </p>
        </form>
      </section>
    </div>
  );
}

function SelectedCard({
  mission,
  picked,
  practice,
}: {
  mission: MissionSite | undefined;
  picked: GlobeMarker | null;
  practice: boolean;
}) {
  const name = mission?.name ?? picked?.name ?? "The Moon";
  const lat = mission?.latitudeDeg ?? picked?.latitudeDeg;
  const lon = mission?.eastLongitudeDeg ?? picked?.eastLongitudeDeg;
  return (
    <div className="min-w-0 shrink-0 bg-[#10131a] p-3 text-stone-100">
      <p className="text-lg font-semibold leading-snug">{name}</p>
      {mission ? (
        <p className="mt-1 text-sm leading-6 text-stone-200">
          {outcomePhrase(mission.outcome)}
          {mission.place ? ` · ${mission.place}` : ""} · {formatMissionDate(mission.dateUtc)} · {mission.country}
        </p>
      ) : practice ? (
        <p className="mt-1 text-sm leading-6 text-stone-200">
          Practice spot near the south pole. Not an official landing site. The sunlight check can run here.
        </p>
      ) : picked?.tone === "picked" ? (
        <p className="mt-1 text-sm leading-6 text-stone-200">Coordinates you picked on the Moon. Not an official landing site.</p>
      ) : (
        <p className="mt-1 text-sm leading-6 text-stone-200">Select a pin, or click the ground.</p>
      )}
      {lat !== undefined && lon !== undefined ? (
        <p className="mt-1 text-sm tabular-nums text-stone-100">
          {formatLatitude(lat)} · {formatLongitude(lon)}
        </p>
      ) : null}
      {mission?.caveat ? <p className="mt-1 text-sm leading-6 text-stone-200">{mission.caveat}</p> : null}
      {mission && isImpact(mission.outcome) ? (
        <p className="mt-1 text-sm leading-6 text-stone-200">This is an impact, not a landing.</p>
      ) : null}
      {!practice ? (
        <p className="mt-2 text-sm leading-6 text-stone-200">
          The sunlight and Earth check is saved only for the three practice spots. Height for mission pins is 0 m because this list does not include a height.
        </p>
      ) : null}
    </div>
  );
}

function PlaceButton({
  pressed,
  title,
  detail,
  onClick,
}: {
  pressed: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`block w-full px-1 py-1.5 text-left ${pressed ? "bg-stone-100 text-stone-950" : "text-stone-100 hover:bg-[#1c2230]"}`}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className={`block text-xs leading-5 ${pressed ? "text-stone-700" : "text-stone-300"}`}>{detail}</span>
    </button>
  );
}

function filterMissions(query: string, program: string, showImpacts: boolean): MissionSite[] {
  const needle = query.trim().toLowerCase();
  return MISSIONS.filter((mission) => {
    if (program === "practice") return false;
    if (program !== "all" && mission.program !== program) return false;
    const haystack = `${mission.name} ${mission.program} ${mission.country} ${mission.place}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    if (isImpact(mission.outcome) && !showImpacts && !needle) return false;
    return true;
  });
}
