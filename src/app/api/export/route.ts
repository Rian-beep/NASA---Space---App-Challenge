import type { AlternativeSearch, AudienceMode, ExportReport, ScenarioInput, ScenarioResult } from "@/lib/science/types";
import { SCIENCE_NOT_READY } from "@/components/workspace/copy";
import { disclaimerFrom, isScenarioInput, loadScience } from "@/components/workspace/scienceAdapter";

export const dynamic = "force-dynamic";

function isMode(value: unknown): value is AudienceMode {
  return value === "explore" || value === "plan" || value === "analyze";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON with scenarios and results." }, { status: 400 });
  }
  const record = (body ?? {}) as {
    scenarios?: unknown;
    results?: unknown;
    alternatives?: unknown;
    mode?: unknown;
  };
  if (!Array.isArray(record.scenarios) || !record.scenarios.every(isScenarioInput)) {
    return Response.json({ error: "Expected { scenarios, results }." }, { status: 400 });
  }
  if (!Array.isArray(record.results)) {
    return Response.json({ error: "Expected { scenarios, results }." }, { status: 400 });
  }
  try {
    const science = await loadScience();
    const report: ExportReport = {
      generatedAtUtc: new Date().toISOString(),
      softwareVersion: science.SOFTWARE_VERSION,
      disclaimer: disclaimerFrom(science),
      scenarios: record.scenarios as ScenarioInput[],
      results: record.results as ScenarioResult[],
      alternatives: (record.alternatives ?? null) as AlternativeSearch | null,
      mode: isMode(record.mode) ? record.mode : "plan",
    };
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : SCIENCE_NOT_READY;
    return Response.json({ error: message }, { status: message === SCIENCE_NOT_READY ? 503 : 500 });
  }
}
