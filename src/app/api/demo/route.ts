import { SCIENCE_NOT_READY } from "@/components/workspace/copy";
import { disclaimerFrom, loadScience } from "@/components/workspace/scienceAdapter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const science = await loadScience();
    const bundle = await science.getDemoBundle();
    return Response.json({
      bundle,
      softwareVersion: science.SOFTWARE_VERSION,
      disclaimer: disclaimerFrom(science),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : SCIENCE_NOT_READY;
    return Response.json({ error: message }, { status: message === SCIENCE_NOT_READY ? 503 : 500 });
  }
}
