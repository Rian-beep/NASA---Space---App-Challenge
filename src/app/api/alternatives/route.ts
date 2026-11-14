import { SCIENCE_NOT_READY } from "@/components/workspace/copy";
import { alternativesWithScience, isScenarioInput } from "@/components/workspace/scienceAdapter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON with a scenario." }, { status: 400 });
  }
  const scenario = (body as { scenario?: unknown } | null)?.scenario;
  if (!isScenarioInput(scenario)) {
    return Response.json({ error: "Expected { scenario }." }, { status: 400 });
  }
  try {
    const search = await alternativesWithScience(scenario);
    return Response.json({ search });
  } catch (error) {
    const message = error instanceof Error ? error.message : SCIENCE_NOT_READY;
    return Response.json({ error: message }, { status: message === SCIENCE_NOT_READY ? 503 : 500 });
  }
}
