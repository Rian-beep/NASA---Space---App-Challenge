import type { ReactNode } from "react";

type IconProps = { className?: string };

function Frame({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      className={className ?? "shrink-0"}
      fill="none"
    >
      {children}
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <Frame className={className ?? "shrink-0 text-[#9a3412]"}>
      <path
        d="M10 2.8 17.2 16.2H2.8L10 2.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8.1v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.6" r="0.8" fill="currentColor" />
    </Frame>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Frame className={className ?? "shrink-0 text-stone-800"}>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.6 10.2 8.9 12.4 13.4 7.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function MissingIcon({ className }: IconProps) {
  return (
    <Frame className={className ?? "shrink-0 text-stone-700"}>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2.2" />
      <path d="M10 6.6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.3" r="0.8" fill="currentColor" />
    </Frame>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <Frame className={className ?? "shrink-0 text-stone-700"}>
      <path
        d="M3.5 7.5h13v8.2H3.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2.8 4.2h14.4v3.3H2.8V4.2Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 11.1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Frame>
  );
}

export function SunMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="4.2" fill="#b45309" />
    </svg>
  );
}

export function EarthMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="4.2" fill="#1d4ed8" />
    </svg>
  );
}
