"use client";

import { useEffect, useId, useState } from "react";
import type { AudienceMode, LunarSite, ScenarioInput, ScenarioResult } from "@/lib/science/types";
import { EXAMPLE_SITE_NOTE } from "./copy";
import {
  MISSIONS,
  formatMissionDate,
  isImpact,
  missionPrograms,
  outcomePhrase,
  scenarioPatchForMission,
} from "@/lib/sites/missions";
import {
  cx,
  datetimeLocalValueToIso,
  formatHours,
  isoToDatetimeLocalValue,
  siteLabel,
} from "./format";
import { StatusMark } from "./StatusMark";

type InputsProps = {
  mode: AudienceMode;
  sites: LunarSite[];
  scenarios: ScenarioInput[];
  active: ScenarioInput;
  results: Record<string, ScenarioResult>;
  maxScenarios: number;
  exploreDelayHours: number;
  planDelayHours: number;
  demoDelay: { name: string; arrivalUtc: string } | null;
  demoDelayAdded: boolean;
  onSelectScenario: (id: string) => void;
  onChangeActive: (patch: Partial<ScenarioInput>) => void;
  onExploreArrival: (arrivalUtc: string) => void;
  onExploreDelayHours: (hours: number) => void;
  onPlanDelayHours: (hours: number) => void;
  onApplyDelay: () => void;
  onUseDemoDelay: () => void;
  onDuplicate: () => void;
  onRemove: (id: string) => void;
  onRestore: () => void;
};

export function Inputs(props: InputsProps) {
  const { mode, active, sites } = props;
  const place = sites.find((site) => site.id === active.siteId) ?? null;
  const atLimit = props.scenarios.length >= props.maxScenarios;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => event.preventDefault()}
    >
      {mode !== "explore" ? (
        <CaseList {...props} atLimit={atLimit} />
      ) : null}

      <PlaceFields
        mode={mode}
        sites={sites}
        scenario={active}
        placeSummary={place?.summary ?? null}
        onChange={props.onChangeActive}
      />

      {mode === "explore" ? (
        <ExploreTime
          scenario={active}
          delayHours={props.exploreDelayHours}
          onArrival={props.onExploreArrival}
          onDelay={props.onExploreDelayHours}
        />
      ) : (
        <PlanTime scenario={active} onChange={props.onChangeActive} />
      )}

      {mode === "explore" ? (
        <p className="text-sm leading-6 text-stone-700">
          We watch {active.durationHours} hours from arrival. The solar panel is{" "}
          {active.solarPanelHeightM} m tall and the antenna is {active.antennaHeightM} m tall.
          Change those in Plan.
        </p>
      ) : (
        <>
          <EquipmentFields scenario={active} onChange={props.onChangeActive} />
          <LimitFields scenario={active} onChange={props.onChangeActive} />
          <DelayFields
            planDelayHours={props.planDelayHours}
            onPlanDelayHours={props.onPlanDelayHours}
            onApplyDelay={props.onApplyDelay}
            onUseDemoDelay={props.onUseDemoDelay}
            demoDelay={props.demoDelay}
            demoDelayAdded={props.demoDelayAdded}
            atLimit={atLimit}
            maxScenarios={props.maxScenarios}
          />
          <div className="flex flex-col gap-2">
            <button type="button" className="lw-button self-start" onClick={props.onRestore}>
              Restore the demonstration baseline
            </button>
            <p className="text-sm leading-6 text-stone-700">This clears the other cases and returns the baseline inputs.</p>
          </div>
        </>
      )}
    </form>
  );
}

function CaseList({
  scenarios,
  active,
  results,
  maxScenarios,
  atLimit,
  onSelectScenario,
  onDuplicate,
  onRemove,
}: InputsProps & { atLimit: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">Cases</legend>
      <ul className="flex flex-col gap-2">
        {scenarios.map((scenario) => {
          const selected = scenario.id === active.id;
          const result = results[scenario.id];
          return (
            <li key={scenario.id} className={cx("border border-stone-300 p-2", selected && "bg-stone-100")}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectScenario(scenario.id)}
                  className="text-left text-sm font-medium text-stone-950"
                >
                  {scenario.name}
                  {scenario.isBaseline ? " (baseline)" : ""}
                </button>
                {!scenario.isBaseline ? (
                  <button
                    type="button"
                    className="text-sm text-stone-700 underline decoration-stone-400 underline-offset-2"
                    aria-label={`Remove ${scenario.name}`}
                    onClick={() => onRemove(scenario.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {result ? (
                <div className="mt-1 text-sm">
                  <StatusMark status={result.status} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button type="button" className="lw-button self-start" onClick={onDuplicate} disabled={atLimit}>
        Duplicate case
      </button>
      {atLimit ? (
        <p className="text-sm leading-6 text-stone-700">
          {maxScenarios} cases are the maximum. Remove one to add another.
        </p>
      ) : null}
    </fieldset>
  );
}

function PlaceFields({
  mode,
  sites,
  scenario,
  placeSummary,
  onChange,
}: {
  mode: AudienceMode;
  sites: LunarSite[];
  scenario: ScenarioInput;
  placeSummary: string | null;
  onChange: (patch: Partial<ScenarioInput>) => void;
}) {
  const selectId = useId();
  const custom = scenario.siteId === "custom";
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">
        {mode === "explore" ? "Example place" : "Place"}
      </legend>
      <p className="text-sm leading-6 text-stone-700">{EXAMPLE_SITE_NOTE}</p>
      <label className="flex flex-col gap-1 text-sm" htmlFor={selectId}>
        <span className="font-medium text-stone-900">Place</span>
        <select
          id={selectId}
          className="lw-control"
          value={custom ? "custom" : scenario.siteId}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "custom") {
              onChange({
                siteId: "custom",
                name: scenario.customSite?.name || "Custom location",
                customSite: scenario.customSite ?? {
                  name: "Custom location",
                  eastLongitudeDeg: Number.NaN,
                  latitudeDeg: Number.NaN,
                  surfaceHeightM: 0,
                },
              });
              return;
            }
            const mission = MISSIONS.find((item) => item.id === value);
            if (mission) {
              onChange(scenarioPatchForMission(mission));
              return;
            }
            const place = sites.find((site) => site.id === value);
            onChange({ siteId: value, name: place?.name ?? scenario.name, customSite: undefined });
          }}
        >
          <optgroup label="Practice spots">
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </optgroup>
          {missionPrograms().map((program) => (
            <optgroup key={program} label={program}>
              {MISSIONS.filter((mission) => mission.program === program).map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.name}
                  {isImpact(mission.outcome) ? " (impact)" : ""} — {outcomePhrase(mission.outcome)}, {formatMissionDate(mission.dateUtc)}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="custom">Coordinates I enter</option>
        </select>
      </label>
      {placeSummary ? <p className="text-sm leading-6 text-stone-700">{placeSummary}</p> : null}
      {custom ? <CustomCoordinates scenario={scenario} onChange={onChange} /> : null}
      {!custom && scenario.siteId ? <CoordinateReadout scenario={scenario} sites={sites} /> : null}
    </fieldset>
  );
}

function CoordinateReadout({ scenario, sites }: { scenario: ScenarioInput; sites: LunarSite[] }) {
  const site = sites.find((item) => item.id === scenario.siteId);
  const point = site ?? scenario.customSite;
  if (!point || !Number.isFinite(point.eastLongitudeDeg) || !Number.isFinite(point.latitudeDeg)) return null;
  const height = "surfaceHeightM" in point ? point.surfaceHeightM : 0;
  return (
    <p className="text-sm leading-6 text-stone-700 tabular-nums">
      {siteLabel(scenario, sites)} · {point.eastLongitudeDeg}° east longitude · {point.latitudeDeg}° latitude ·{" "}
      {height} m surface height
    </p>
  );
}

function CustomCoordinates({
  scenario,
  onChange,
}: {
  scenario: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}) {
  const current = scenario.customSite;
  const commit = (patch: Partial<NonNullable<ScenarioInput["customSite"]>>) => {
    onChange({
      siteId: "custom",
      customSite: {
        name: current?.name || "Custom location",
        eastLongitudeDeg: current?.eastLongitudeDeg ?? Number.NaN,
        latitudeDeg: current?.latitudeDeg ?? Number.NaN,
        surfaceHeightM: current?.surfaceHeightM ?? 0,
        ...patch,
      },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Name for these coordinates"
        value={current?.name ?? ""}
        onCommit={(name) => commit({ name })}
      />
      <NumberField
        label="East longitude (degrees, positive east)"
        value={current?.eastLongitudeDeg}
        onCommit={(eastLongitudeDeg) => commit({ eastLongitudeDeg })}
      />
      <NumberField
        label="Latitude (degrees, negative in the south)"
        value={current?.latitudeDeg}
        onCommit={(latitudeDeg) => commit({ latitudeDeg })}
      />
      <NumberField
        label="Surface height (m)"
        value={current?.surfaceHeightM}
        allowEmpty={false}
        onCommit={(surfaceHeightM) => commit({ surfaceHeightM })}
      />
      <p className="text-sm leading-6 text-stone-700">
        Locations outside the terrain coverage return Insufficient data.
      </p>
    </div>
  );
}

function ExploreTime({
  scenario,
  delayHours,
  onArrival,
  onDelay,
}: {
  scenario: ScenarioInput;
  delayHours: number;
  onArrival: (arrivalUtc: string) => void;
  onDelay: (hours: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">When do we arrive?</legend>
      <ArrivalField arrivalUtc={scenario.arrivalUtc} onCommit={onArrival} />
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-stone-900">What if we landed later?</span>
        <input
          type="range"
          min={0}
          max={Math.max(48, Math.ceil(delayHours))}
          step={1}
          value={Math.max(0, delayHours)}
          onChange={(event) => onDelay(Number(event.target.value))}
        />
        <span className="tabular-nums text-stone-700">
          {formatHours(delayHours)} later than the arrival this control started from
        </span>
      </label>
    </fieldset>
  );
}

function PlanTime({
  scenario,
  onChange,
}: {
  scenario: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}) {
  const nameId = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">Time</legend>
      <label className="flex flex-col gap-1 text-sm" htmlFor={nameId}>
        <span className="font-medium text-stone-900">Case name</span>
        <input
          id={nameId}
          className="lw-control"
          value={scenario.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <ArrivalField arrivalUtc={scenario.arrivalUtc} onCommit={(arrivalUtc) => onChange({ arrivalUtc })} />
      <NumberField
        label="Duration (hours)"
        value={scenario.durationHours}
        onCommit={(durationHours) => onChange({ durationHours })}
      />
    </fieldset>
  );
}

function EquipmentFields({
  scenario,
  onChange,
}: {
  scenario: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">Heights above the ground</legend>
      <NumberField
        label="Solar-panel height (m)"
        value={scenario.solarPanelHeightM}
        onCommit={(solarPanelHeightM) => onChange({ solarPanelHeightM })}
      />
      <NumberField
        label="Antenna height (m)"
        value={scenario.antennaHeightM}
        onCommit={(antennaHeightM) => onChange({ antennaHeightM })}
      />
    </fieldset>
  );
}

function LimitFields({
  scenario,
  onChange,
}: {
  scenario: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">Limits you accept</legend>
      <NumberField
        label="Longest sunlight gap you will accept (hours)"
        value={scenario.maxSolarInterruptionHours}
        onCommit={(maxSolarInterruptionHours) => onChange({ maxSolarInterruptionHours })}
        hint="This only checks that gap. It does not model a battery."
      />
      <NumberField
        label="Longest Earth-view gap you will accept (hours)"
        value={scenario.maxEarthInterruptionHours}
        onCommit={(maxEarthInterruptionHours) => onChange({ maxEarthInterruptionHours })}
        hint="This is whether Earth is above the ground line, not a promise of a radio link."
      />
    </fieldset>
  );
}

function DelayFields({
  planDelayHours,
  onPlanDelayHours,
  onApplyDelay,
  onUseDemoDelay,
  demoDelay,
  demoDelayAdded,
  atLimit,
  maxScenarios,
}: {
  planDelayHours: number;
  onPlanDelayHours: (hours: number) => void;
  onApplyDelay: () => void;
  onUseDemoDelay: () => void;
  demoDelay: { name: string; arrivalUtc: string } | null;
  demoDelayAdded: boolean;
  atLimit: boolean;
  maxScenarios: number;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-stone-950">Landing delay</legend>
      <NumberField
        label="Delay to add when duplicating (hours)"
        value={planDelayHours}
        onCommit={onPlanDelayHours}
      />
      <button type="button" className="lw-button self-start" onClick={onApplyDelay} disabled={atLimit}>
        Duplicate with this landing delay
      </button>
      {demoDelay ? (
        <button
          type="button"
          className="lw-button self-start"
          onClick={onUseDemoDelay}
          disabled={demoDelayAdded || atLimit}
        >
          Use the demonstration’s later landing
        </button>
      ) : null}
      {atLimit ? (
        <p className="text-sm leading-6 text-stone-700">
          Remove a case before adding another. {maxScenarios} is the maximum.
        </p>
      ) : null}
    </fieldset>
  );
}

function ArrivalField({
  arrivalUtc,
  onCommit,
}: {
  arrivalUtc: string;
  onCommit: (arrivalUtc: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(isoToDatetimeLocalValue(arrivalUtc));
  useEffect(() => {
    setText(isoToDatetimeLocalValue(arrivalUtc));
  }, [arrivalUtc]);
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={id}>
      <span className="font-medium text-stone-900">Arrival (UTC)</span>
      <input
        id={id}
        className="lw-control"
        type="datetime-local"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const iso = datetimeLocalValueToIso(next);
          if (iso) onCommit(iso);
        }}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  hint,
  allowEmpty = false,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  hint?: string;
  allowEmpty?: boolean;
}) {
  const id = useId();
  const hintId = useId();
  const [text, setText] = useState(formatNumber(value));
  useEffect(() => {
    setText(formatNumber(value));
  }, [value]);
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={id}>
      <span className="font-medium text-stone-900">{label}</span>
      <input
        id={id}
        className="lw-control tabular-nums"
        inputMode="decimal"
        value={text}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (allowEmpty && next.trim() === "") return;
          const parsed = Number(next);
          if (next.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed);
        }}
      />
      {hint ? (
        <span id={hintId} className="leading-6 text-stone-700">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={id}>
      <span className="font-medium text-stone-900">{label}</span>
      <input
        id={id}
        className="lw-control"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onCommit(event.target.value);
        }}
      />
    </label>
  );
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "";
  return String(value);
}
