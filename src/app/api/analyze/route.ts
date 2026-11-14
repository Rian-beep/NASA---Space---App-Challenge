import { SCIENCE_NOT_READY } from "@/components/workspace/copy";
import { analyzeWithScience, isScenarioInput } from "@/components/workspace/scienceAdapter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON with a scenario." }, { status: 400 });
  }
  const record = (body ?? {}) as { scenario?: unknown; baselineScenario?: unknown };
  if (!isScenarioInput(record.scenario)) {
    return Response.json({ error: "Expected { scenario }." }, { status: 400 });
  }
  const baselineScenario = isScenarioInput(record.baselineScenario) ? record.baselineScenario : null;
  try {
    const result = await analyzeWithScience(record.scenario, { baselineScenario });
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : SCIENCE_NOT_READY;
    return Response.json({ error: message }, { status: message === SCIENCE_NOT_READY ? 503 : 500 });
  }
}
