"use client";

import { useEffect, useState } from "react";
import { SunStage, type SunReport } from "./visuals/SunStage";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorText(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = (body as { error: unknown }).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "The Sun read failed.";
}

function isSunReport(body: unknown): body is SunReport {
  if (typeof body !== "object" || body === null) return false;
  const report = body as Partial<SunReport>;
  return typeof report.sentence === "string" && Array.isArray(report.recent) && typeof report.caveat === "string";
}

export default function SunPage() {
  const [report, setReport] = useState<SunReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetch("/api/sun", { signal: controller.signal })
      .then(async (response) => {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (cancelled) return;
        if (response.ok && isSunReport(body)) {
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
        setError("The Sun read failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return <SunStage loading={loading} error={error} report={report} />;
}
