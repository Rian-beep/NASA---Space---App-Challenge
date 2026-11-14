"use client";

import { useState } from "react";
import type {
  AlternativeSearch,
  AudienceMode,
  ExportReport,
  LunarSite,
  ScenarioInput,
  ScenarioResult,
} from "@/lib/science/types";
import { scenariosToCsv } from "./csv";
import { DISCLAIMER } from "./copy";
import { WarningIcon } from "./icons";
import { downloadText, saveReport } from "./reportStore";

export function ExportButtons({
  scenarios,
  results,
  alternatives,
  mode,
  softwareVersion,
  disclaimer,
  sites,
}: {
  scenarios: ScenarioInput[];
  results: ScenarioResult[];
  alternatives: AlternativeSearch | null;
  mode: AudienceMode;
  softwareVersion: string;
  disclaimer: string;
  sites: LunarSite[];
}) {
  const [error, setError] = useState<string | null>(null);

  const assemble = (): ExportReport => ({
    generatedAtUtc: new Date().toISOString(),
    softwareVersion,
    disclaimer: disclaimer || DISCLAIMER,
    scenarios,
    results,
    alternatives,
    mode,
  });

  const downloadJson = async () => {
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios, results, alternatives, mode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        const local = assemble();
        downloadText(
          fileStamp("json"),
          JSON.stringify(local, null, 2),
          "application/json",
        );
        setError(payload?.error ?? "The server export failed. A copy was saved from the cases on screen.");
        return;
      }
      const report = (await response.json()) as ExportReport;
      downloadText(fileStamp("json"), JSON.stringify(report, null, 2), "application/json");
    } catch {
      downloadText(fileStamp("json"), JSON.stringify(assemble(), null, 2), "application/json");
      setError("The server export failed. A copy was saved from the cases on screen.");
    }
  };

  const downloadCsv = () => {
    setError(null);
    downloadText(fileStamp("csv"), scenariosToCsv(scenarios, results, sites), "text/csv;charset=utf-8");
  };

  const openReport = () => {
    setError(null);
    saveReport({ ...assemble(), sites });
    window.open("/report?print=1", "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="lw-button" onClick={() => void downloadJson()}>
          Download JSON
        </button>
        <button type="button" className="lw-button" onClick={downloadCsv}>
          Download CSV
        </button>
        <button type="button" className="lw-button" onClick={openReport}>
          Printable report
        </button>
      </div>
      <p className="text-sm leading-6 text-stone-700">
        JSON includes the computed samples and provenance. CSV is one row per case. The report carries the disclaimer and source links.
      </p>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function fileStamp(extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `lunar-window-${stamp}.${extension}`;
}
