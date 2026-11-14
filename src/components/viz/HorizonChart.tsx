"use client";

import { useId, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { AudienceMode, TerrainHorizon } from "@/lib/science/types";
import { formatDegrees } from "./format";
import {
  bodyClearance,
  elevationDomain,
  horizonDrawSegments,
  horizonElevationAt,
  horizonHasGap,
  horizonMaxGapDeg,
  largestHorizonGap,
  linearTicks,
  normalizeAzimuth,
  type BodyClearance,
  type HorizonPoint,
} from "./horizonPath";
import {
  EARTH_INK,
  INK,
  PAPER,
  SUN_INK,
  StatusNote,
  WarningTriangle,
  focusClass,
  measureClass,
  modeText,
  panelClass,
} from "./marks";
import { useElementSize } from "./useElementSize";

export interface HorizonChartProps {
  horizon: TerrainHorizon | null;
  sunAzimuthDeg: number | null;
  sunElevationDeg: number | null;
  earthAzimuthDeg: number | null;
  earthElevationDeg: number | null;
  highlightAzimuthDeg?: number | null;
  mode: AudienceMode;
  onSelectAzimuth?: (az: number) => void;
}

const MONO = "var(--font-geist-mono), ui-monospace, monospace";

export function HorizonChart({
  horizon,
  sunAzimuthDeg,
  sunElevationDeg,
  earthAzimuthDeg,
  earthElevationDeg,
  highlightAzimuthDeg,
  mode,
  onSelectAzimuth,
}: HorizonChartProps) {
  const explore = mode === "explore";
  const type = modeText(explore);
  const uid = useId().replace(/:/g, "");
  const [frameRef, box] = useElementSize();
  const [localAzimuth, setLocalAzimuth] = useState<number | null>(null);
  const shownAzimuth = highlightAzimuthDeg === undefined ? localAzimuth : highlightAzimuthDeg;

  const samples = horizonSamples(horizon);
  const maxGap = horizonMaxGapDeg(horizon?.azimuthStepDeg ?? 0);
  const segments = horizonDrawSegments(samples, maxGap);
  const hasGap = horizon == null || horizon.coverage === "insufficient" || horizonHasGap(samples, maxGap);
  const limbOnly = horizon?.samples.some((sample) => sample.coverage === "geometric_limb_only") ?? false;

  const sunHorizon =
    sunAzimuthDeg == null ? null : horizonElevationAt(samples, sunAzimuthDeg, maxGap);
  const earthHorizon =
    earthAzimuthDeg == null ? null : horizonElevationAt(samples, earthAzimuthDeg, maxGap);
  const sunState = bodyClearance(sunHorizon, sunElevationDeg);
  const earthState = bodyClearance(earthHorizon, earthElevationDeg);

  const domain = elevationDomain([
    ...samples.flatMap((sample) => (sample.elevationDeg == null ? [] : [sample.elevationDeg])),
    sunElevationDeg ?? Number.NaN,
    earthElevationDeg ?? Number.NaN,
    sunHorizon ?? Number.NaN,
    earthHorizon ?? Number.NaN,
  ]);

  const width = box.width > 0 ? box.width : 720;
  const height = explore ? 420 : 340;
  const margin = {
    top: 16,
    right: 18,
    bottom: explore ? 58 : 50,
    left: explore ? 68 : 58,
  };
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = Math.max(40, height - margin.top - margin.bottom);
  const plotBottom = plotTop + plotH;
  const ySpan = domain.max - domain.min || 1;

  const xOf = (azimuth: number) => plotLeft + (azimuth / 360) * plotW;
  const yOf = (elevation: number) => plotBottom - ((elevation - domain.min) / ySpan) * plotH;

  const selectAzimuth = (value: number) => {
    const next = Math.round(Math.min(360, Math.max(0, value)) * 10) / 10;
    setLocalAzimuth(next);
    onSelectAzimuth?.(next);
  };

  const onPlotClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onSelectAzimuth) return;
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    if (local.x < plotLeft || local.x > plotLeft + plotW || local.y < plotTop || local.y > plotBottom) {
      return;
    }
    selectAzimuth(((local.x - plotLeft) / plotW) * 360);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelectAzimuth) return;
    const current = shownAzimuth ?? 0;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAzimuth(Math.min(360, current + step));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAzimuth(Math.max(0, current - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAzimuth(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAzimuth(360);
    }
  };

  const gap = largestHorizonGap(samples, maxGap);
  const ticks = linearTicks(domain.min, domain.max);
  const interactive = Boolean(onSelectAzimuth);

  return (
    <section className={`${panelClass} p-5 sm:p-6`}>
      <header className="max-w-[65ch] space-y-2">
        <h2 className={`${type.title} font-semibold tracking-tight`}>
          How high the ground blocks the sky
        </h2>
        <p className={type.body}>
          A dot above the ground line can be seen. A dot below the line is blocked. This uses the
          center of the Sun or Earth, not the whole disc, and it does not include eclipses.
        </p>
      </header>

      <div
        ref={frameRef}
        className={`mt-5 ${interactive ? focusClass : ""}`}
        role={interactive ? "slider" : "group"}
        tabIndex={interactive ? 0 : undefined}
        aria-label="Direction around the ground line"
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? 360 : undefined}
        aria-valuenow={interactive ? Math.round(shownAzimuth ?? 0) : undefined}
        aria-valuetext={
          interactive
            ? `Direction ${formatDegrees(shownAzimuth ?? 0)} from north`
            : undefined
        }
        onKeyDown={interactive ? onKeyDown : undefined}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          className={`block ${interactive ? "cursor-crosshair" : ""}`}
          aria-hidden="true"
          onClick={onPlotClick}
        >
          <rect x={plotLeft} y={plotTop} width={plotW} height={plotH} fill="#ffffff" stroke="#e7e5e4" />
          <defs>
            <clipPath id={`${uid}-plot`}>
              <rect x={plotLeft} y={plotTop} width={plotW} height={plotH} />
            </clipPath>
            <pattern id={`${uid}-sun`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={SUN_INK} strokeWidth="1.5" />
            </pattern>
            <pattern id={`${uid}-earth`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={EARTH_INK} strokeWidth="1.5" />
            </pattern>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={plotLeft}
                x2={plotLeft + plotW}
                y1={yOf(tick)}
                y2={yOf(tick)}
                stroke={tick === 0 ? "#78716c" : "#e7e5e4"}
                strokeWidth={tick === 0 ? 1.25 : 1}
              />
              <text
                x={plotLeft - 8}
                y={yOf(tick) + 4}
                textAnchor="end"
                fill="#44403c"
                fontSize={explore ? 14 : 12}
                style={{ fontFamily: MONO }}
              >
                {formatDegrees(tick, Number.isInteger(tick) ? 0 : 1)}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${uid}-plot)`}>
            {segments.map((segment, index) =>
              segment.length < 2 ? null : (
                <path
                  key={`fill-${index}`}
                  d={blockedPath(segment, xOf, yOf, plotBottom)}
                  fill="#e7e5e4"
                />
              ),
            )}
            {segments.map((segment, index) =>
              segment.length < 2 ? (
                <circle
                  key={`pt-${index}`}
                  cx={xOf(segment[0].azimuthDeg)}
                  cy={yOf(segment[0].elevationDeg)}
                  r={3}
                  fill={INK}
                />
              ) : (
                <path
                  key={`line-${index}`}
                  d={linePath(segment, xOf, yOf)}
                  fill="none"
                  stroke={INK}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ),
            )}
            <BlockedLabel segments={segments} xOf={xOf} yOf={yOf} plotBottom={plotBottom} plotLeft={plotLeft} plotW={plotW} explore={explore} />
            {hasGap && gap ? (
              <text
                x={xOf(gap.midAzimuthDeg)}
                y={plotTop + plotH / 2}
                textAnchor="middle"
                fill={INK}
                fontSize={explore ? 16 : 13}
              >
                Insufficient data
              </text>
            ) : null}
            <BodyMark
              name="Sun"
              azimuth={sunAzimuthDeg}
              elevation={sunElevationDeg}
              horizonElevation={sunHorizon}
              state={sunState}
              color={SUN_INK}
              hatch={`url(#${uid}-sun)`}
              shape="circle"
              xOf={xOf}
              yOf={yOf}
              plotRight={plotLeft + plotW}
              labelDy={0}
            />
            <BodyMark
              name="Earth"
              azimuth={earthAzimuthDeg}
              elevation={earthElevationDeg}
              horizonElevation={earthHorizon}
              state={earthState}
              color={EARTH_INK}
              hatch={`url(#${uid}-earth)`}
              shape="diamond"
              xOf={xOf}
              yOf={yOf}
              plotRight={plotLeft + plotW}
              labelDy={
                sunAzimuthDeg != null &&
                earthAzimuthDeg != null &&
                Math.abs(normalizeAzimuth(sunAzimuthDeg) - normalizeAzimuth(earthAzimuthDeg)) < 18
                  ? 18
                  : 0
              }
            />
            {shownAzimuth != null ? (
              <g>
                <line
                  x1={xOf(shownAzimuth)}
                  x2={xOf(shownAzimuth)}
                  y1={plotTop}
                  y2={plotBottom}
                  stroke={INK}
                  strokeWidth={1.25}
                />
                <text
                  x={xOf(shownAzimuth)}
                  y={plotTop + 14}
                  textAnchor="middle"
                  fill={INK}
                  fontSize={12}
                  style={{ fontFamily: MONO }}
                >
                  {formatDegrees(shownAzimuth)}
                </text>
              </g>
            ) : null}
          </g>
          {[0, 90, 180, 270, 360].map((azimuth) => {
            const cardinal = azimuth === 0 ? "N" : azimuth === 90 ? "E" : azimuth === 180 ? "S" : azimuth === 270 ? "W" : "";
            const anchor = azimuth === 0 ? "start" : azimuth === 360 ? "end" : "middle";
            return (
              <text
                key={azimuth}
                x={xOf(azimuth)}
                y={plotBottom + (explore ? 22 : 18)}
                textAnchor={anchor}
                fill="#44403c"
                fontSize={explore ? 14 : 12}
                style={{ fontFamily: MONO }}
              >
                {cardinal ? `${azimuth}° ${cardinal}` : `${azimuth}°`}
              </text>
            );
          })}
          <text
            x={plotLeft + plotW / 2}
            y={height - 8}
            textAnchor="middle"
            fill="#44403c"
            fontSize={explore ? 14 : 12}
          >
            Azimuth, degrees clockwise from north
          </text>
          <text
            x={16}
            y={plotTop + plotH / 2}
            transform={`rotate(-90 16 ${plotTop + plotH / 2})`}
            textAnchor="middle"
            fill="#44403c"
            fontSize={explore ? 14 : 12}
          >
            Elevation (°)
          </text>
        </svg>
      </div>

      <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${type.body}`}>
        <BodyReadout
          name="Sun"
          color={SUN_INK}
          shape="circle"
          azimuth={sunAzimuthDeg}
          elevation={sunElevationDeg}
          state={sunState}
        />
        <BodyReadout
          name="Earth"
          color={EARTH_INK}
          shape="diamond"
          azimuth={earthAzimuthDeg}
          elevation={earthElevationDeg}
          state={earthState}
        />
      </div>

      <div className={`mt-4 space-y-2 ${type.body}`}>
        {hasGap ? (
          <StatusNote>Insufficient data. We don’t have enough terrain here to say.</StatusNote>
        ) : null}
        {horizon?.coverage === "partial" ? (
          <StatusNote>We only have hills for part of the circle around this place.</StatusNote>
        ) : null}
        {limbOnly ? (
          <StatusNote>
            For some directions we only know the curve of the Moon, not the local hills.
          </StatusNote>
        ) : null}
      </div>
    </section>
  );
}

function horizonSamples(horizon: TerrainHorizon | null): HorizonPoint[] {
  if (!horizon) return [];
  return horizon.samples.map((sample) => ({
    azimuthDeg: sample.azimuthDeg,
    elevationDeg:
      sample.elevationDeg == null || sample.coverage === "missing" ? null : sample.elevationDeg,
  }));
}

function linePath(
  segment: { azimuthDeg: number; elevationDeg: number }[],
  xOf: (azimuth: number) => number,
  yOf: (elevation: number) => number,
): string {
  return segment
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xOf(point.azimuthDeg).toFixed(2)} ${yOf(point.elevationDeg).toFixed(2)}`)
    .join(" ");
}

function blockedPath(
  segment: { azimuthDeg: number; elevationDeg: number }[],
  xOf: (azimuth: number) => number,
  yOf: (elevation: number) => number,
  yBottom: number,
): string {
  const first = segment[0];
  const last = segment[segment.length - 1];
  const top = segment
    .map((point) => `L ${xOf(point.azimuthDeg).toFixed(2)} ${yOf(point.elevationDeg).toFixed(2)}`)
    .join(" ");
  return `M ${xOf(first.azimuthDeg).toFixed(2)} ${yBottom} ${top} L ${xOf(last.azimuthDeg).toFixed(2)} ${yBottom} Z`;
}

function BlockedLabel({
  segments,
  xOf,
  yOf,
  plotBottom,
  plotLeft,
  plotW,
  explore,
}: {
  segments: { azimuthDeg: number; elevationDeg: number }[][];
  xOf: (azimuth: number) => number;
  yOf: (elevation: number) => number;
  plotBottom: number;
  plotLeft: number;
  plotW: number;
  explore: boolean;
}) {
  const tall = segments
    .flat()
    .find((point) => plotBottom - yOf(point.elevationDeg) > 28);
  if (!tall) return null;
  const x = Math.min(plotLeft + plotW - 8, Math.max(plotLeft + 8, xOf(tall.azimuthDeg)));
  return (
    <text x={x} y={plotBottom - 8} textAnchor="start" fill="#44403c" fontSize={explore ? 14 : 12}>
      Ground blocks the sky
    </text>
  );
}

function BodyMark({
  name,
  azimuth,
  elevation,
  horizonElevation,
  state,
  color,
  hatch,
  shape,
  xOf,
  yOf,
  plotRight,
  labelDy,
}: {
  name: string;
  azimuth: number | null;
  elevation: number | null;
  horizonElevation: number | null;
  state: BodyClearance;
  color: string;
  hatch: string;
  shape: "circle" | "diamond";
  xOf: (azimuth: number) => number;
  yOf: (elevation: number) => number;
  plotRight: number;
  labelDy: number;
}) {
  if (azimuth == null || elevation == null) return null;
  const x = xOf(normalizeAzimuth(azimuth));
  const y = yOf(elevation);
  const yHorizon = horizonElevation == null ? null : yOf(horizonElevation);
  const labelX = x > plotRight - 110 ? x - 10 : x + 10;
  const anchor = x > plotRight - 110 ? "end" : "start";
  return (
    <g>
      {state === "below" && yHorizon != null ? (
        <rect
          x={x - 7}
          y={Math.min(y, yHorizon)}
          width={14}
          height={Math.max(6, Math.abs(y - yHorizon))}
          fill={hatch}
        />
      ) : null}
      {shape === "circle" ? (
        <circle cx={x} cy={y} r={5.5} fill={color} stroke={PAPER} strokeWidth={1.5} />
      ) : (
        <path d={`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`} fill={color} stroke={PAPER} strokeWidth={1.5} />
      )}
      <text x={labelX} y={y - 8 + labelDy} textAnchor={anchor} fill={color} fontSize={12} fontWeight={600}>
        {name}
      </text>
      {state === "below" ? (
        <text x={labelX} y={y + 8 + labelDy} textAnchor={anchor} fill={INK} fontSize={12}>
          Below terrain
        </text>
      ) : null}
    </g>
  );
}

function BodyReadout({
  name,
  color,
  shape,
  azimuth,
  elevation,
  state,
}: {
  name: string;
  color: string;
  shape: "circle" | "diamond";
  azimuth: number | null;
  elevation: number | null;
  state: BodyClearance;
}) {
  const missing = azimuth == null || elevation == null;
  return (
    <div className="flex gap-3">
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-1 shrink-0" aria-hidden="true">
        {shape === "circle" ? (
          <circle cx="8" cy="8" r="5" fill={color} />
        ) : (
          <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill={color} />
        )}
      </svg>
      <div>
        <p className="font-semibold">{name}</p>
        {missing ? (
          <p className="mt-1 flex items-start gap-2 text-stone-800">
            <WarningTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>We don’t have a position for this time. Insufficient data.</span>
          </p>
        ) : (
          <p className={`${measureClass} mt-1 flex items-start gap-2 text-stone-800`}>
            <span>
              Direction from north {formatDegrees(normalizeAzimuth(azimuth))}. Height in the sky{" "}
              {formatDegrees(elevation)}.{" "}
              <span className="font-[family-name:var(--font-geist-sans)]">{clearanceSentence(state)}</span>
            </span>
            {state === "unknown" ? <WarningTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          </p>
        )}
      </div>
    </div>
  );
}

function clearanceSentence(state: BodyClearance): string {
  if (state === "below") return "Blocked by the ground.";
  if (state === "above") return "Above the ground line, so it can be seen.";
  if (state === "level") return "Right on the ground line.";
  return "Insufficient data. We can’t tell if the ground blocks it.";
}
