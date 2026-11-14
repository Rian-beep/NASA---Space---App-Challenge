"use client";

import { useId } from "react";
import { formatUtcLabel, parseUtc, toIsoUtc } from "./format";
import { focusClass, measureClass, modeText, panelClass, StatusNote } from "./marks";
import { windowBounds } from "./timelineScale";

export interface TimeScrubberProps {
  startUtc: string;
  endUtc: string;
  valueUtc: string;
  onChange: (isoUtc: string) => void;
}

const HOUR_MS = 3_600_000;

export function TimeScrubber({ startUtc, endUtc, valueUtc, onChange }: TimeScrubberProps) {
  const id = useId();
  const valueId = useId();
  const type = modeText(false);
  const bounds = windowBounds(startUtc, endUtc);
  const valueMs = parseUtc(valueUtc);

  if (!bounds) {
    return (
      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className={`${type.title} font-semibold tracking-tight`}>Time you are looking at</h2>
        <div className="mt-3 text-sm">
          <StatusNote>Insufficient data. The start and end times are not a valid UTC window.</StatusNote>
        </div>
      </section>
    );
  }

  const span = bounds.endMs - bounds.startMs;
  const stepMs = span >= HOUR_MS ? HOUR_MS : Math.max(60_000, Math.round(span / 24));
  const stepLabel =
    stepMs === HOUR_MS
      ? "1 h steps"
      : stepMs < 120_000
        ? "1 min steps"
        : `${Math.round(stepMs / 60_000)} min steps`;
  const clamped =
    valueMs == null
      ? bounds.startMs
      : Math.min(bounds.endMs, Math.max(bounds.startMs, valueMs));

  return (
    <section className={`${panelClass} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <label htmlFor={id} className="text-base font-semibold tracking-tight">
          Time you are looking at
        </label>
        <p id={valueId} className={`${measureClass} text-base`}>
          {formatUtcLabel(valueUtc)}
        </p>
      </div>
      <input
        id={id}
        type="range"
        min={bounds.startMs}
        max={bounds.endMs}
        step={stepMs}
        value={clamped}
        aria-valuemin={bounds.startMs}
        aria-valuemax={bounds.endMs}
        aria-valuenow={clamped}
        aria-valuetext={formatUtcLabel(toIsoUtc(clamped))}
        aria-describedby={valueId}
        onChange={(event) => onChange(toIsoUtc(Number(event.target.value)))}
        className={`${focusClass} mt-4 h-11 w-full cursor-pointer accent-stone-900`}
      />
      <div className="mt-3 flex items-start justify-between gap-4 text-sm text-stone-700">
        <span className={`${measureClass} max-w-[40%]`}>{formatUtcLabel(startUtc)}</span>
        <span className="shrink-0">{stepLabel}</span>
        <span className={`${measureClass} max-w-[40%] text-right`}>{formatUtcLabel(endUtc)}</span>
      </div>
    </section>
  );
}
