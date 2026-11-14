import type { ReactNode } from "react";

export const SUN_INK = "#b45309";
export const EARTH_INK = "#1d4ed8";
export const INK = "#1c1917";
export const PAPER = "#fafaf9";

export const panelClass =
  "bg-stone-50 text-stone-900 border border-stone-200 font-[family-name:var(--font-geist-sans)]";

export const measureClass =
  "font-[family-name:var(--font-geist-mono)] tabular-nums";

export const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900";

export function WarningTriangle({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="none">
      <path
        d="M8 1.7 14.4 13.3H1.6L8 1.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.1v3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 11.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function StatusNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-stone-800">
      <WarningTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function modeText(explore: boolean) {
  return {
    title: explore ? "text-xl" : "text-base",
    body: explore ? "text-base leading-relaxed" : "text-sm leading-relaxed",
    meta: explore ? "text-sm" : "text-xs",
  };
}
