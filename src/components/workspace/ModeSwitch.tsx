"use client";

import type { AudienceMode } from "@/lib/science/types";
import { cx } from "./format";

const MODES: Array<{ id: AudienceMode; label: string; description: string }> = [
  {
    id: "explore",
    label: "Explore",
    description: "One place and one arrival, in plain words.",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Set the journey and compare up to three cases.",
  },
  {
    id: "analyze",
    label: "Analyze",
    description: "The plan, plus how the numbers were made and where they stop.",
  },
];

export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: AudienceMode;
  onChange: (mode: AudienceMode) => void;
}) {
  const current = MODES.find((item) => item.id === mode) ?? MODES[1];
  return (
    <div>
      <div role="radiogroup" aria-label="Mode" aria-describedby="mode-description" className="inline-flex border border-stone-400 bg-white">
        {MODES.map((item, index) => {
          const selected = item.id === mode;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(item.id)}
              className={cx(
                "px-3 py-1.5 text-sm font-medium",
                index > 0 && "border-l border-stone-400",
                selected ? "bg-stone-900 text-white" : "text-stone-800 hover:bg-stone-100",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p id="mode-description" className="mt-2 max-w-xs text-sm leading-6 text-stone-700">
        {current.description}
      </p>
    </div>
  );
}
