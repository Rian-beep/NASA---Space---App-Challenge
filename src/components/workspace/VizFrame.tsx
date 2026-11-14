"use client";

import { Component, type ReactNode } from "react";
import {
  HorizonChart,
  LunarMap,
  TimelinePanel,
  TimeScrubber,
} from "@/components/viz";
import type { HorizonChartProps, LunarMapProps, TimelinePanelProps, TimeScrubberProps } from "@/components/viz";
import { formatUtc } from "./format";

type BoundaryProps = { label: string; children: ReactNode };
type BoundaryState = { failed: boolean };

class VizBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="status" className="border border-stone-300 bg-white p-4 text-sm leading-6 text-stone-700">
          {this.props.label}
        </p>
      );
    }
    return this.props.children;
  }
}

export function MapFrame(props: LunarMapProps) {
  return (
    <VizBoundary label="The map could not be drawn.">
      <LunarMap {...props} />
    </VizBoundary>
  );
}

export function HorizonFrame(props: HorizonChartProps) {
  return (
    <VizBoundary label="The horizon chart could not be drawn.">
      <HorizonChart {...props} />
    </VizBoundary>
  );
}

export function TimelineFrame(props: TimelinePanelProps) {
  return (
    <VizBoundary label="The timeline could not be drawn.">
      <TimelinePanel {...props} />
    </VizBoundary>
  );
}

export function ScrubberFrame(props: TimeScrubberProps) {
  if (typeof TimeScrubber !== "function") return <FallbackScrubber {...props} />;
  return (
    <VizBoundary label="The time control could not be drawn.">
      <TimeScrubber {...props} />
    </VizBoundary>
  );
}

function FallbackScrubber({ startUtc, endUtc, valueUtc, onChange }: TimeScrubberProps) {
  const start = Date.parse(startUtc);
  const end = Date.parse(endUtc);
  const value = Date.parse(valueUtc);
  const span = Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(end - start, 0);
  const current = Number.isNaN(value) || Number.isNaN(start) ? 0 : Math.min(Math.max(value - start, 0), span);
  return (
    <label className="flex flex-col gap-2 border border-stone-300 bg-white p-4 text-sm text-stone-800">
      <span>Selected time (UTC)</span>
      <input
        type="range"
        min={0}
        max={span}
        step={60_000}
        value={current}
        onChange={(event) => {
          if (Number.isNaN(start)) return;
          onChange(new Date(start + Number(event.target.value)).toISOString());
        }}
        className="w-full"
      />
      <time dateTime={valueUtc}>{formatUtc(valueUtc)}</time>
    </label>
  );
}
