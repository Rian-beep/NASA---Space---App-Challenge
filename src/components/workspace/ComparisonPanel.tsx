"use client";

import type { ReactNode } from "react";
import type { LunarSite, ScenarioInput, ScenarioResult, ScenarioSnapshot } from "@/lib/science/types";
import { EARTH_PANEL_TEXT, OVERLAP_TEXT, SUN_PANEL_TEXT } from "./copy";
import {
  formatDegrees,
  formatHours,
  formatPercent,
  formatSignedHours,
  siteLabel,
} from "./format";
import { CheckIcon, EarthMark, MissingIcon, SunMark, WarningIcon } from "./icons";
import { StatusMark } from "./StatusMark";

export function ComparisonPanel({
  sites,
  scenarios,
  results,
  activeScenarioId,
  snapshot,
  onSelectScenario,
}: {
  sites: LunarSite[];
  scenarios: ScenarioInput[];
  results: Record<string, ScenarioResult>;
  activeScenarioId: string;
  snapshot: ScenarioSnapshot | null;
  onSelectScenario: (id: string) => void;
}) {
  const active = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0];
  const result = active ? results[active.id] : undefined;

  return (
    <section className="flex flex-col gap-5" aria-label="Comparison">
      <div>
        <h2 className="text-base font-semibold text-stone-950">Comparison</h2>
        {scenarios.length > 1 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {scenarios.map((scenario) => {
              const item = results[scenario.id];
              const selected = scenario.id === active?.id;
              return (
                <li key={scenario.id}>
                  <button
                    type="button"
                    onClick={() => onSelectScenario(scenario.id)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "w-full border border-stone-400 bg-stone-100 px-3 py-2 text-left"
                        : "w-full border border-stone-300 bg-white px-3 py-2 text-left hover:bg-stone-50"
                    }
                  >
                    <span className="block text-sm font-medium text-stone-950">
                      {scenario.name}
                      {scenario.isBaseline ? " · baseline" : ""}
                    </span>
                    {item ? (
                      <span className="mt-1 block text-sm">
                        <StatusMark status={item.status} />
                      </span>
                    ) : (
                      <span className="mt-1 block text-sm text-stone-700">Waiting for this case.</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {active && result ? (
        <ActiveResult
          scenario={active}
          result={result}
          sites={sites}
          snapshot={snapshot}
        />
      ) : (
        <p className="text-sm leading-6 text-stone-700">Updating this case…</p>
      )}
    </section>
  );
}

function ActiveResult({
  scenario,
  result,
  sites,
  snapshot,
}: {
  scenario: ScenarioInput;
  result: ScenarioResult;
  sites: LunarSite[];
  snapshot: ScenarioSnapshot | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <StatusMark status={result.status} />
        <p className="text-lg leading-snug text-stone-950">{result.statement}</p>
        <p className="text-sm leading-6 text-stone-700">
          {siteLabel(scenario, sites)} · panel {scenario.solarPanelHeightM} m · antenna {scenario.antennaHeightM} m
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {result.limitChecks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm leading-6 text-stone-900">
            {check.status === "exceeds_limits" ? (
              <WarningIcon />
            ) : check.status === "within_limits" ? (
              <CheckIcon />
            ) : (
              <MissingIcon />
            )}
            <span>{check.detail}</span>
          </li>
        ))}
      </ul>

      <BodyPanel
        title="Sunlight"
        mark={<SunMark />}
        note={SUN_PANEL_TEXT}
        heightNote={`Computed for a solar panel ${scenario.solarPanelHeightM} m above the ground.`}
        accessHours={result.sun.accessDurationHours}
        accessPercent={result.sun.accessPercent}
        interruptionHours={result.sun.longestInterruptionHours}
        truncated={result.sun.longestInterruptionTruncated}
        nowVisible={snapshot?.sunVisible ?? null}
        azimuth={snapshot?.sunAzimuthDeg ?? null}
        elevation={snapshot?.sunElevationDeg ?? null}
        horizon={snapshot?.sunHorizonDeg ?? null}
      />
      <BodyPanel
        title="Earth"
        mark={<EarthMark />}
        note={EARTH_PANEL_TEXT}
        heightNote={`Computed for an antenna ${scenario.antennaHeightM} m above the ground.`}
        accessHours={result.earth.accessDurationHours}
        accessPercent={result.earth.accessPercent}
        interruptionHours={result.earth.longestInterruptionHours}
        truncated={result.earth.longestInterruptionTruncated}
        nowVisible={snapshot?.earthVisible ?? null}
        azimuth={snapshot?.earthAzimuthDeg ?? null}
        elevation={snapshot?.earthElevationDeg ?? null}
        horizon={snapshot?.earthHorizonDeg ?? null}
      />

      <section className="flex flex-col gap-2 border-t border-stone-300 pt-4">
        <h3 className="text-sm font-semibold text-stone-950">Overlap</h3>
        <p className="text-sm leading-6 text-stone-700">{OVERLAP_TEXT}</p>
        <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-stone-700">Overlap</dt>
          <dd className="tabular-nums text-stone-950">
            {formatHours(result.overlapHours)} ({formatPercent(result.overlapPercent)})
          </dd>
        </dl>
      </section>

      {scenario.isBaseline ? (
        <p className="text-sm leading-6 text-stone-700">This is the baseline.</p>
      ) : result.deltaFromBaseline ? (
        <section className="flex flex-col gap-2 border-t border-stone-300 pt-4">
          <h3 className="text-sm font-semibold text-stone-950">What changed from the baseline</h3>
          <p className="text-sm leading-6 text-stone-900">{result.deltaFromBaseline.summary}</p>
          <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-stone-700">Sunlight gap</dt>
            <dd className="tabular-nums text-stone-950">
              {formatSignedHours(result.deltaFromBaseline.solarInterruptionDeltaHours)}
            </dd>
            <dt className="text-stone-700">Earth-view gap</dt>
            <dd className="tabular-nums text-stone-950">
              {formatSignedHours(result.deltaFromBaseline.earthInterruptionDeltaHours)}
            </dd>
            <dt className="text-stone-700">Overlap</dt>
            <dd className="tabular-nums text-stone-950">
              {formatSignedHours(result.deltaFromBaseline.overlapDeltaHours)}
            </dd>
          </dl>
          <p className="text-sm leading-6 text-stone-700">
            A positive gap change means a longer gap than the first plan. A positive overlap change means more time with both in view.
          </p>
        </section>
      ) : (
        <p className="text-sm leading-6 text-stone-700">
          No comparison with the baseline has been returned for this case.
        </p>
      )}
    </div>
  );
}

function BodyPanel({
  title,
  mark,
  note,
  heightNote,
  accessHours,
  accessPercent,
  interruptionHours,
  truncated,
  nowVisible,
  azimuth,
  elevation,
  horizon,
}: {
  title: string;
  mark: ReactNode;
  note: string;
  heightNote: string;
  accessHours: number | null;
  accessPercent: number | null;
  interruptionHours: number | null;
  truncated: boolean;
  nowVisible: boolean | null;
  azimuth: number | null;
  elevation: number | null;
  horizon: number | null;
}) {
  const now =
    nowVisible === null ? "Not available at the selected time" : nowVisible ? "In view now" : "Hidden now";
  return (
    <section className="flex flex-col gap-2 border-t border-stone-300 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
        {mark}
        <span>{title}</span>
      </h3>
      <p className="text-sm leading-6 text-stone-700">{note}</p>
      <p className="text-sm leading-6 text-stone-700">{heightNote}</p>
      <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-stone-700">At the selected time</dt>
        <dd className="text-stone-950">{now}</dd>
        <dt className="text-stone-700">Direction from north</dt>
        <dd className="tabular-nums text-stone-950">{formatDegrees(azimuth)}</dd>
        <dt className="text-stone-700">Height in the sky</dt>
        <dd className="tabular-nums text-stone-950">{formatDegrees(elevation)}</dd>
        <dt className="text-stone-700">Ground line</dt>
        <dd className="tabular-nums text-stone-950">{formatDegrees(horizon)}</dd>
        <dt className="text-stone-700">In view during the stay</dt>
        <dd className="tabular-nums text-stone-950">
          {formatHours(accessHours)} ({formatPercent(accessPercent)})
        </dd>
        <dt className="text-stone-700">Longest gap</dt>
        <dd className="tabular-nums text-stone-950">{formatHours(interruptionHours)}</dd>
      </dl>
      {truncated ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>This gap continues past the hours we watched, so we do not know its full length.</span>
        </p>
      ) : null}
    </section>
  );
}
