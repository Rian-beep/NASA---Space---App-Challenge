import fs from "node:fs";
import path from "node:path";

import type { LfmSiteContext } from "./types";
import { insufficientLfmContext, parseLfmContexts } from "./parse";

export type { LfmSiteContext } from "./types";
export {
  LFM_CHECKPOINT,
  LFM_EXTENT_NOTE,
  LFM_LIMITATIONS,
  LFM_LICENSE,
  LFM_MODALITIES,
  LFM_MODEL_ID,
  LFM_RESOLUTION_M,
  LFM_RMSE_NOTE,
  LFM_SOURCE_URLS,
  LFM_TASK,
} from "./types";
export { insufficientLfmContext, parseLfmContexts } from "./parse";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "src/lib/lfm/fixtures/contexts.json",
);

export function loadLfmContextsFromPath(fixturePath: string): Record<string, LfmSiteContext> {
  if (!fs.existsSync(fixturePath)) {
    return {};
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return parseLfmContexts(parsed);
}

/**
 * Read `src/lib/lfm/fixtures/contexts.json` when it exists.
 * A site with no stored output is not given a number.
 */
export function loadLfmContexts(): Record<string, LfmSiteContext> {
  return loadLfmContextsFromPath(FIXTURE_PATH);
}

export function lfmContextForSite(
  siteId: string,
  contexts: Record<string, LfmSiteContext> = loadLfmContexts(),
): LfmSiteContext {
  return contexts[siteId] ?? insufficientLfmContext(siteId);
}
