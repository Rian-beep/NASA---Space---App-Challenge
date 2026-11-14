"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FlareScale, SolarFlare } from "../../../terrestrial/flares";

const SunView = dynamic(() => import("./SunGlobe").then((mod) => mod.SunGlobe), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#07080d]" aria-hidden="true" />,
});

export interface SunReport {
  currentClass: string | null;
  currentScale: FlareScale;
  flux: number | null;
  recent: SolarFlare[];
  sentence: string;
  retrievedAtUtc: string;
  sourceName: string;
  sourceUrl: string;
  caveat: string;
}

const SCALES: FlareScale[] = ["A", "B", "C", "M", "X", "unknown"];

type SunStageProps = {
  loading: boolean;
  error: string | null;
  report: SunReport | null;
};

export function SunStage({ loading, error, report }: SunStageProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const scale = report && SCALES.includes(report.currentScale) ? report.currentScale : "unknown";

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#07080d] text-stone-100 [color-scheme:dark] lg:h-screen lg:min-h-0 lg:flex-row-reverse lg:overflow-hidden">
      <div className="relative h-[14rem] w-full shrink-0 lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-1">
        <SunView scale={scale} reducedMotion={reducedMotion} />
      </div>
      <section
        aria-label="Sun and flares"
        className="flex w-full min-w-0 flex-col gap-3 border-t border-[#2c313c] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-full lg:min-h-0 lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:p-4"
      >
        <header className="min-w-0 bg-[#10131a] p-3">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-100">The Sun</h1>
          <p className="mt-1 text-pretty text-sm leading-6 text-stone-100">
            A model of the Sun, plus the latest solar flares. A flare can disturb the radio path above a listening dish.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className="text-sm text-stone-100 underline decoration-stone-500 underline-offset-2">
              Moon view
            </Link>
            <Link href="/earth" className="text-sm text-stone-100 underline decoration-stone-500 underline-offset-2">
              Earth dishes
            </Link>
          </p>
        </header>

        <div className="min-w-0 bg-[#10131a] p-3">
          {loading && !report ? (
            <p className="text-sm leading-6 text-stone-100" role="status">
              Reading the Sun…
            </p>
          ) : null}
          {error ? (
            <p className="break-words text-sm leading-6 text-stone-100" role="alert">
              {error}
            </p>
          ) : null}
          {report ? (
            <>
              <p className="text-sm font-medium text-stone-100">
                {report.currentClass ? `Live X-ray class ${report.currentClass}` : "Live X-ray class unavailable"}
              </p>
              <p className="mt-2 text-pretty text-sm leading-6 text-stone-100">{report.sentence}</p>
              <p className="mt-2 text-pretty text-sm leading-6 text-stone-100">{report.caveat}</p>
              <h2 className="mt-4 text-sm font-medium text-stone-100">Latest NASA photo</h2>
              <p className="mt-1 text-pretty text-sm leading-6 text-stone-100">
                Bright patches are hot gas. The same photo sits on the model.
              </p>
              {photoFailed ? (
                <p className="mt-2 text-sm leading-6 text-stone-100">The NASA photo did not load.</p>
              ) : (
                <Image
                  src="/api/sun/picture"
                  alt="Latest NASA SDO view of the Sun. Bright regions can be flares."
                  width={1024}
                  height={1024}
                  unoptimized
                  className="mt-2 aspect-square h-auto w-full bg-black object-contain"
                  onError={() => setPhotoFailed(true)}
                />
              )}
            </>
          ) : null}
        </div>

        {report && report.recent.length > 0 ? (
          <div className="min-w-0 bg-[#10131a] p-3">
            <h2 className="text-sm font-medium text-stone-100">Flares in the last 7 days</h2>
            <ul className="mt-2 flex flex-col gap-2" aria-label="Recent solar flares">
              {report.recent.map((flare) => (
                <li key={`${flare.maxUtc}-${flare.maxClass}`} className="text-sm leading-6 text-stone-100">
                  <span className="font-medium">{flare.maxClass}</span>
                  {flare.ongoing ? " · still going" : ""}
                  <span className="block text-xs leading-5 text-stone-300">Peak {londonTime(flare.maxUtc)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="min-w-0 text-pretty text-xs leading-5 text-stone-100">
          <p>The disk is the latest NASA photo. The glow behind it follows the live flare class.</p>
          <p>Flares are from NOAA GOES. The photo is NASA SDO AIA 193.</p>
        </footer>
      </section>
    </div>
  );
}

function londonTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${clock} London`;
}
