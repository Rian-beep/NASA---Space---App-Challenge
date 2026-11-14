"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LunarSite, ScenarioInput, ScenarioResult } from "@/lib/science/types";
import { EARTH_PANEL_TEXT, SUN_PANEL_TEXT } from "./copy";
import { formatHours, formatPercent, formatUtc, presentationLabel, statusPhrase } from "./format";
import { CheckIcon, WarningIcon } from "./icons";
import { loadReport, type StoredReport } from "./reportStore";
import { StatusMark } from "./StatusMark";

export function ReportView() {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [missing, setMissing] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    const loaded = loadReport();
    if (!loaded) {
      setMissing(true);
      return;
    }
    setReport(loaded);
  }, []);

  useEffect(() => {
    if (!report || printed.current) return;
    const print = new URLSearchParams(window.location.search).get("print") === "1";
    if (!print) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [report]);

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-stone-950">Lunar Window report</h1>
        <p className="mt-3 text-sm leading-6 text-stone-800">
          No report is loaded. Return to the workspace and choose Printable report.
        </p>
        <Link className="mt-4 inline-block text-sm text-stone-900 underline" href="/">
          Back to Lunar Window
        </Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-stone-700">Reading the report…</p>
      </main>
    );
  }

  return (
    <main className="report-sheet mx-auto max-w-3xl bg-white px-6 py-8 text-stone-950">
      <p className="no-print text-sm">
        <Link className="underline decoration-stone-400 underline-offset-2" href="/">
          Back to Lunar Window
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Lunar Window report</h1>
      <p className="mt-3 text-sm leading-6">{report.disclaimer}</p>
      <p className="mt-3 text-sm leading-6">
        {presentationLabel(report.results[0]?.provenance.presentation)} · Generated {formatUtc(report.generatedAtUtc)} ·
        Software {report.softwareVersion} · Mode {report.mode}
      </p>
      <p className="mt-2 text-sm leading-6">
        This document screens user-selected interruption limits. It does not approve a landing or a flight.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {report.scenarios.map((scenario) => {
          const result = report.results.find((item) => item.scenarioId === scenario.id);
          return (
            <ReportCase
              key={scenario.id}
              scenario={scenario}
              result={result}
              sites={report.sites ?? []}
            />
          );
        })}
      </div>

      {report.alternatives ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Alternatives</h2>
          <p className="mt-2 text-sm leading-6">{report.alternatives.boundsDescription}</p>
          <p className="mt-2 flex items-start gap-2 text-sm leading-6">
            {report.alternatives.anyMeetsLimits ? <CheckIcon /> : <WarningIcon />}
            <span>
              {report.alternatives.anyMeetsLimits
                ? "At least one option meets the selected limits."
                : "No option in this search meets the selected limits."}
            </span>
          </p>
          <p className="mt-2 text-sm leading-6">Order used: {report.alternatives.ordering.join("; ")}</p>
          <ol className="mt-4 flex flex-col gap-4">
            {report.alternatives.results.map((candidate) => (
              <li key={candidate.id}>
                <p className="text-sm font-medium">
                  {candidate.site.name} · {formatUtc(candidate.arrivalUtc)}
                </p>
                <p className="text-sm leading-6">{candidate.rankReason}</p>
                {candidate.shortfall ? <p className="text-sm leading-6">{candidate.shortfall}</p> : null}
                <p className="text-sm leading-6">
                  {candidate.meetsAllLimits ? "Meets the selected limits." : "Does not meet the selected limits."}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-10 border-t border-stone-300 pt-4">
        <h2 className="text-xl font-semibold">Sources</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {[...new Set(report.results.map((result) => result.provenance.horizonsDocUrl))].map((url) => (
            <li key={url}>
              <a href={url}>{url}</a>
            </li>
          ))}
          {[...new Set(report.results.map((result) => result.provenance.terrainProductUrl))].map((url) => (
            <li key={url}>
              <a href={url}>{url}</a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6">{report.disclaimer}</p>
        <p className="mt-2 text-sm leading-6">
          Full visibility samples are in the JSON download. This page records the case, the limits, and the provenance.
        </p>
      </section>
      <p className="no-print mt-6">
        <button type="button" className="lw-button" onClick={() => window.print()}>
          Print
        </button>
      </p>
    </main>
  );
}

function ReportCase({
  scenario,
  result,
  sites,
}: {
  scenario: ScenarioInput;
  result: ScenarioResult | undefined;
  sites: LunarSite[];
}) {
  const catalog = sites.find((site) => site.id === scenario.siteId);
  return (
    <section className="border-t border-stone-300 pt-4">
      <h2 className="text-xl font-semibold">{scenario.name}</h2>
      <p className="mt-1 text-sm leading-6">
        {scenario.isBaseline ? "Baseline. " : ""}
        Arrival {formatUtc(scenario.arrivalUtc)} · {scenario.durationHours} h · solar panel {scenario.solarPanelHeightM} m ·
        antenna {scenario.antennaHeightM} m
      </p>
      <p className="text-sm leading-6">
        Accepted solar interruption {scenario.maxSolarInterruptionHours} h · accepted Earth interruption{" "}
        {scenario.maxEarthInterruptionHours} h
      </p>
      {scenario.customSite ? (
        <p className="text-sm leading-6 tabular-nums">
          {scenario.customSite.name}: {scenario.customSite.eastLongitudeDeg}° east longitude, {scenario.customSite.latitudeDeg}°
          latitude, surface {scenario.customSite.surfaceHeightM} m
        </p>
      ) : (
        <p className="text-sm leading-6">
          {catalog ? catalog.name : `Site id ${scenario.siteId}`}
          {catalog
            ? ` · ${catalog.eastLongitudeDeg}° east longitude · ${catalog.latitudeDeg}° latitude · ${catalog.surfaceHeightM} m surface height`
            : ""}
        </p>
      )}
      {result ? (
        <>
          <div className="mt-2">
            <StatusMark status={result.status} />
          </div>
          <p className="mt-2 text-sm leading-6">{result.statement}</p>
          <p className="mt-2 text-sm leading-6">{SUN_PANEL_TEXT}</p>
          <p className="text-sm leading-6">
            Sunlight {formatHours(result.sun.accessDurationHours)} ({formatPercent(result.sun.accessPercent)}), longest
            interruption {formatHours(result.sun.longestInterruptionHours)}.
          </p>
          <p className="mt-2 text-sm leading-6">{EARTH_PANEL_TEXT}</p>
          <p className="text-sm leading-6">
            Earth {formatHours(result.earth.accessDurationHours)} ({formatPercent(result.earth.accessPercent)}), longest
            interruption {formatHours(result.earth.longestInterruptionHours)}.
          </p>
          <p className="text-sm leading-6">
            Overlap {formatHours(result.overlapHours)} ({formatPercent(result.overlapPercent)}).
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {result.limitChecks.map((check) => (
              <li key={check.id} className="text-sm leading-6">
                {statusPhrase(check.status)}: {check.detail}
              </li>
            ))}
          </ul>
          {result.deltaFromBaseline ? <p className="mt-2 text-sm leading-6">{result.deltaFromBaseline.summary}</p> : null}
          <div className="mt-3 text-sm leading-6">
            <p>{result.provenance.citation}</p>
            <p>
              Numerical resolution: source spacing {result.provenance.sourcePixelSpacingM ?? "not available"} m, analysis
              resolution {result.provenance.analysisResolutionM ?? "not available"} m.
            </p>
            <p>Physical uncertainty and model limits:</p>
            <ul className="list-disc pl-5">
              {result.provenance.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>Visibility model: {result.provenance.visibilityModel}</p>
            <p>Eclipse model: {result.provenance.eclipseModel}</p>
            <p>
              <a href={result.provenance.horizonsDocUrl}>{result.provenance.horizonsDocUrl}</a>
            </p>
            <p>
              <a href={result.provenance.terrainProductUrl}>{result.provenance.terrainProductUrl}</a>
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6">This case has no computed result in the report.</p>
      )}
    </section>
  );
}
