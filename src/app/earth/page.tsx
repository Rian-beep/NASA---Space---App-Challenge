"use client";

import { useEffect, useState } from "react";
import { EarthStage } from "@/components/earth/EarthStage";
import type { EarthDayReport } from "../../../terrestrial/types";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorText(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = (body as { error: unknown }).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "The Earth read failed.";
}

function isEarthDayReport(body: unknown): body is EarthDayReport {
  if (typeof body !== "object" || body === null) return false;
  const report = body as Partial<EarthDayReport>;
  return typeof report.date === "string" && Array.isArray(report.weather) && typeof report.caveat === "string";
}

export default function EarthPage() {
  const [date, setDate] = useState(utcToday);
  const [report, setReport] = useState<EarthDayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);

    fetch(`/api/earth?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (cancelled) return;
        if (response.ok && isEarthDayReport(body)) {
          setReport(body);
          setError(null);
          return;
        }
        setReport(null);
        setError(errorText(body));
      })
      .catch((cause: unknown) => {
        if (cancelled || isAbortError(cause)) return;
        setReport(null);
        setError("The Earth read failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [date]);

  return <EarthStage date={date} onDate={setDate} loading={loading} error={error} report={report} />;
}
