"use client";

import { useId } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { AudienceMode, BodyVisibility, TimeInterval } from "@/lib/science/types";
import { formatHours, formatPercent, formatUtcLabel, toIsoUtc } from "./format";
import {
  EARTH_INK,
  INK,
  PAPER,
  SUN_INK,
  StatusNote,
  focusClass,
  measureClass,
  modeText,
  panelClass,
} from "./marks";
import {
  clipInterval,
  fractionToIso,
  intersectAccess,
  intervalAtTime,
  intervalHoursInWindow,
  interruptionLabel,
  shiftIso,
  timeFraction,
  timeTicks,
  timelineLayout,
  windowBounds,
} from "./timelineScale";
import { useElementSize } from "./useElementSize";

export interface TimelinePanelProps {
  startUtc: string;
  endUtc: string;
  selectedUtc: string;
  sun: BodyVisibility | null;
  earth: BodyVisibility | null;
  overlapHours: number | null;
  onSelectTime: (isoUtc: string) => void;
  onSelectInterval?: (interval: TimeInterval, target: "sun" | "earth") => void;
  mode: AudienceMode;
}

const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const OVERLAP_INK = "#292524";

export function TimelinePanel({
  startUtc,
  endUtc,
  selectedUtc,
  sun,
  earth,
  overlapHours,
  onSelectTime,
  onSelectInterval,
  mode,
}: TimelinePanelProps) {
  const explore = mode === "explore";
  const type = modeText(explore);
  const gapPatternId = useId().replace(/:/g, "");
  const bounds = windowBounds(startUtc, endUtc);
  const [frameRef, box] = useElementSize();
  const layout = timelineLayout(box.width > 0 ? box.width : 720, explore);

  if (!bounds) {
    return (
      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className={`${type.title} font-semibold tracking-tight`}>
          Sunlight, a clear view of Earth, and both at once
        </h2>
        <div className={`mt-4 ${type.body}`}>
          <StatusNote>Insufficient data. The start and end times are not a valid UTC window.</StatusNote>
        </div>
      </section>
    );
  }

  const { startMs, endMs } = bounds;
  const selectedMs = parseSelected(selectedUtc);
  const playhead =
    selectedMs == null ? null : layout.plotX + timeFraction(selectedMs, startMs, endMs) * layout.plotW;
  const ticks = timeTicks(startMs, endMs);
  const overlap =
    overlapHours != null && sun && earth ? intersectAccess(sun.intervals, earth.intervals) : null;

  const seek = (fraction: number, rowIndex: number) => {
    const iso = fractionToIso(fraction, startMs, endMs);
    onSelectTime(iso);
    if (rowIndex === 0 && sun) {
      const hit = intervalAtTime(sun.intervals, iso);
      if (hit) onSelectInterval?.(hit, "sun");
    } else if (rowIndex === 1 && earth) {
      const hit = intervalAtTime(earth.intervals, iso);
      if (hit) onSelectInterval?.(hit, "earth");
    }
  };

  const onPlotClick = (event: MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    if (local.x < layout.plotX || local.x > layout.plotX + layout.plotW) return;
    const fraction = (local.x - layout.plotX) / layout.plotW;
    const rowIndex = layout.rows.findIndex(
      (row) => local.y >= row.barY && local.y <= row.barY + row.barH,
    );
    seek(fraction, rowIndex);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 6 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = shiftIso(selectedMs == null ? startUtc : selectedUtc, startUtc, endUtc, step);
      if (next) onSelectTime(next);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = shiftIso(selectedMs == null ? startUtc : selectedUtc, startUtc, endUtc, -step);
      if (next) onSelectTime(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      onSelectTime(startUtc);
    } else if (event.key === "End") {
      event.preventDefault();
      onSelectTime(endUtc);
    }
  };

  const rows: RowSpec[] = [
    { name: "Sunlight", body: sun, color: SUN_INK, target: "sun" },
    { name: "View of Earth", body: earth, color: EARTH_INK, target: "earth" },
    { name: "Both at once", body: null, color: OVERLAP_INK, target: null },
  ];

  return (
    <section className={`${panelClass} p-5 sm:p-6`}>
      <header className="max-w-[65ch] space-y-2">
        <h2 className={`${type.title} font-semibold tracking-tight`}>
          Sunlight, a clear view of Earth, and both at once
        </h2>
        <p className={`${measureClass} ${type.body} text-stone-700`}>
          {formatUtcLabel(startUtc)} to {formatUtcLabel(endUtc)}
        </p>
      </header>

      <div
        ref={frameRef}
        className={`mt-5 ${focusClass}`}
        role="slider"
        tabIndex={0}
        aria-label="Selected time"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round((endMs - startMs) / 3_600_000))}
        aria-valuenow={
          selectedMs == null ? 0 : Math.round((selectedMs - startMs) / 3_600_000)
        }
        aria-valuetext={formatUtcLabel(selectedUtc)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.currentTarget.focus()}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          height={layout.height}
          className="block cursor-pointer"
          aria-hidden="true"
          onClick={onPlotClick}
        >
          <defs>
            <pattern
              id={gapPatternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#a8a29e" strokeWidth="1.25" />
            </pattern>
          </defs>
          {rows.map((row, index) => {
            const band = layout.rows[index];
            const summary = rowSummary(row, overlapHours, explore);
            return (
              <g key={row.name}>
                <text x={12} y={band.barY - 8} fill={INK} fontSize={layout.font} fontWeight={600}>
                  {row.name}
                </text>
                <text
                  x={12}
                  y={band.barY + band.barH / 2 + layout.font * 0.35}
                  fill="#44403c"
                  fontSize={Math.max(11, layout.font - 2)}
                  style={{ fontFamily: MONO }}
                >
                  {summary}
                </text>
                <rect
                  x={layout.plotX}
                  y={band.barY}
                  width={layout.plotW}
                  height={band.barH}
                  fill="#ffffff"
                  stroke="#e7e5e4"
                />
                {row.target && row.body
                  ? row.body.intervals
                      .filter((interval) => interval.kind === "interruption")
                      .map((interval) => (
                        <IntervalBar
                          key={`${row.name}-${interval.startUtc}-${interval.endUtc}-gap`}
                          interval={interval}
                          startMs={startMs}
                          endMs={endMs}
                          plotX={layout.plotX}
                          plotW={layout.plotW}
                          barY={band.barY}
                          barH={band.barH}
                          fill={`url(#${gapPatternId})`}
                          label
                          font={layout.font}
                        />
                      ))
                  : null}
                {row.target && row.body
                  ? row.body.intervals
                      .filter((interval) => interval.kind === "access")
                      .map((interval) => (
                        <IntervalBar
                          key={`${row.name}-${interval.startUtc}-${interval.endUtc}-access`}
                          interval={interval}
                          startMs={startMs}
                          endMs={endMs}
                          plotX={layout.plotX}
                          plotW={layout.plotW}
                          barY={band.barY}
                          barH={band.barH}
                          fill={row.color}
                          label={false}
                          font={layout.font}
                        />
                      ))
                  : null}
                {row.target == null && overlap
                  ? overlap.map((interval) => (
                      <IntervalBar
                        key={`overlap-${interval.startUtc}-${interval.endUtc}`}
                        interval={interval}
                        startMs={startMs}
                        endMs={endMs}
                        plotX={layout.plotX}
                        plotW={layout.plotW}
                        barY={band.barY}
                        barH={band.barH}
                        fill={OVERLAP_INK}
                        label={false}
                        font={layout.font}
                      />
                    ))
                  : null}
              </g>
            );
          })}
          <line
            x1={layout.plotX}
            x2={layout.plotX + layout.plotW}
            y1={layout.axisY}
            y2={layout.axisY}
            stroke="#a8a29e"
          />
          {ticks.map((tick) => {
            const x = layout.plotX + tick.fraction * layout.plotW;
            const anchor = tick.fraction < 0.05 ? "start" : tick.fraction > 0.95 ? "end" : "middle";
            return (
              <g key={`${tick.label}-${tick.fraction}`}>
                <line x1={x} x2={x} y1={layout.axisY} y2={layout.axisY + 6} stroke="#78716c" />
                <text
                  x={x}
                  y={layout.axisY + layout.font + 6}
                  textAnchor={anchor}
                  fill="#44403c"
                  fontSize={Math.max(11, layout.font - 2)}
                  style={{ fontFamily: MONO }}
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
          <text
            x={layout.plotX + layout.plotW / 2}
            y={layout.height - 4}
            textAnchor="middle"
            fill="#44403c"
            fontSize={Math.max(11, layout.font - 2)}
          >
            Time (UTC)
          </text>
          {playhead != null ? (
            <Playhead
              x={playhead}
              top={layout.rows[0].barY}
              bottom={layout.rows[2].barY + layout.rows[2].barH}
              plotX={layout.plotX}
              plotW={layout.plotW}
              label={formatUtcLabel(selectedUtc)}
              font={Math.max(11, layout.font - 2)}
            />
          ) : null}
        </svg>
      </div>

      <div className={`mt-5 space-y-4 ${type.body}`}>
        <InterruptionList
          name="Sunlight"
          body={sun}
          target="sun"
          startMs={startMs}
          endMs={endMs}
          mode={mode}
          onSelectTime={onSelectTime}
          onSelectInterval={onSelectInterval}
        />
        <InterruptionList
          name="View of Earth"
          body={earth}
          target="earth"
          startMs={startMs}
          endMs={endMs}
          mode={mode}
          onSelectTime={onSelectTime}
          onSelectInterval={onSelectInterval}
        />
        {!sun || sun.accessDurationHours == null ? (
          <StatusNote>Sunlight: insufficient data. We can’t measure that row.</StatusNote>
        ) : null}
        {!earth || earth.accessDurationHours == null ? (
          <StatusNote>View of Earth: insufficient data. We can’t measure that row.</StatusNote>
        ) : null}
        {overlapHours == null ? (
          <StatusNote>Both at once: insufficient data. We can’t measure that row.</StatusNote>
        ) : (
          <p>
            <span className="font-semibold">Overlap </span>
            <span className={measureClass}>{formatHours(overlapHours)}</span>
            <span className="text-stone-700"> when sunlight and a clear view of Earth happen together.</span>
          </p>
        )}
      </div>
    </section>
  );
}

interface RowSpec {
  name: string;
  body: BodyVisibility | null;
  color: string;
  target: "sun" | "earth" | null;
}

function rowSummary(row: RowSpec, overlapHours: number | null, explore: boolean): string {
  if (row.target == null) {
    if (overlapHours == null) return "Insufficient data";
    return formatHours(overlapHours);
  }
  const body = row.body;
  if (!body || body.accessDurationHours == null) return "Insufficient data";
  const hours = formatHours(body.accessDurationHours);
  if (explore || body.accessPercent == null) return hours;
  return `${hours} · ${formatPercent(body.accessPercent)}`;
}

function parseSelected(iso: string): number | null {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function IntervalBar({
  interval,
  startMs,
  endMs,
  plotX,
  plotW,
  barY,
  barH,
  fill,
  label,
  font,
}: {
  interval: TimeInterval;
  startMs: number;
  endMs: number;
  plotX: number;
  plotW: number;
  barY: number;
  barH: number;
  fill: string;
  label: boolean;
  font: number;
}) {
  const clipped = clipInterval(interval, startMs, endMs);
  if (!clipped) return null;
  const start = timeFraction(clipped.startMs, startMs, endMs);
  const end = timeFraction(clipped.endMs, startMs, endMs);
  const x = plotX + start * plotW;
  const width = Math.max(1, (end - start) * plotW);
  const hours = intervalHoursInWindow(interval, startMs, endMs);
  const text = hours == null ? "" : interruptionLabel(hours, interval.truncated);
  const showText = label && text.length > 0 && text.length * font * 0.55 < width - 8;
  return (
    <g>
      <rect x={x} y={barY} width={width} height={barH} fill={fill} />
      {showText ? (
        <text
          x={x + width / 2}
          y={barY + barH / 2 + font * 0.32}
          textAnchor="middle"
          fill={INK}
          fontSize={Math.max(11, font - 2)}
          style={{ fontFamily: MONO }}
        >
          {text}
        </text>
      ) : null}
    </g>
  );
}

function Playhead({
  x,
  top,
  bottom,
  plotX,
  plotW,
  label,
  font,
}: {
  x: number;
  top: number;
  bottom: number;
  plotX: number;
  plotW: number;
  label: string;
  font: number;
}) {
  const chipW = label.length * font * 0.62 + 10;
  const chipX = Math.min(plotX + plotW - chipW, Math.max(plotX, x - chipW / 2));
  return (
    <g>
      <line x1={x} x2={x} y1={top} y2={bottom} stroke={INK} strokeWidth={1.5} />
      <path d={`M ${x} ${top + 7} L ${x - 5} ${top} H ${x + 5} Z`} fill={INK} />
      <rect x={chipX} y={top - font - 10} width={chipW} height={font + 6} fill={INK} />
      <text
        x={chipX + 5}
        y={top - 8}
        fill={PAPER}
        fontSize={font}
        style={{ fontFamily: MONO }}
      >
        {label}
      </text>
    </g>
  );
}

function InterruptionList({
  name,
  body,
  target,
  startMs,
  endMs,
  mode,
  onSelectTime,
  onSelectInterval,
}: {
  name: string;
  body: BodyVisibility | null;
  target: "sun" | "earth";
  startMs: number;
  endMs: number;
  mode: AudienceMode;
  onSelectTime: (isoUtc: string) => void;
  onSelectInterval?: (interval: TimeInterval, target: "sun" | "earth") => void;
}) {
  if (!body) return null;
  const items = body.intervals.filter((interval) => interval.kind === "interruption");
  if (body.accessDurationHours == null && items.length === 0) return null;
  return (
    <div>
      <p className="font-semibold">{name} gaps</p>
      {mode !== "explore" && body.longestInterruptionHours != null ? (
        <p className={`mt-1 text-stone-700 ${measureClass}`}>
          Longest gap {formatHours(body.longestInterruptionHours)}
          {body.longestInterruptionTruncated ? " (gap continues past this time window)" : ""}.
        </p>
      ) : null}
      {mode === "analyze" && body.nextTransition && body.nextTransitionUtc ? (
        <p className="mt-1 text-stone-700">
          Next change: {body.nextTransition === "becomes_visible" ? "it comes into view" : "the ground blocks it"} at{" "}
          <span className={measureClass}>{formatUtcLabel(body.nextTransitionUtc)}</span>.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="mt-1 text-stone-700">No gaps in this time window.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((interval) => {
            const clipped = clipInterval(interval, startMs, endMs);
            const hours = intervalHoursInWindow(interval, startMs, endMs);
            if (!clipped || hours == null) return null;
            const text = `${interruptionLabel(hours, interval.truncated)}, ${formatUtcLabel(interval.startUtc)} to ${formatUtcLabel(interval.endUtc)}`;
            return (
              <li key={`${interval.startUtc}-${interval.endUtc}`}>
                <button
                  type="button"
                  className={`${focusClass} text-left underline-offset-4 hover:underline`}
                  onClick={() => {
                    onSelectInterval?.(interval, target);
                    onSelectTime(toIsoUtc(clipped.startMs));
                  }}
                >
                  {text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
