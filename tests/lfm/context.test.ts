import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  lfmContextForSite,
  loadLfmContextsFromPath,
  parseLfmContexts,
} from "@/lib/lfm";

const readyFixture = {
  "site-a": {
    status: "ready",
    modelId: "nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model",
    checkpoint:
      "nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model/ni_lfm_ps8_all_modalities_s42.ckpt",
    license: "Apache-2.0",
    task: "polar_ice_prospectivity_regression",
    siteId: "site-a",
    value: 0.42,
    patchMean: 0.4,
    resolutionM: 240,
    extentNote: "Within 10° of the south pole.",
    retrievedAtUtc: "2026-11-14T00:00:00Z",
    sourceUrls: ["https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model"],
    limitations: ["Not measured ice."],
    statement: "Neighbourhood mean from one forward pass.",
  },
};

describe("lfm context", () => {
  it("returns insufficient_data when the fixture is missing", () => {
    const missingPath = path.join(os.tmpdir(), "lfm-contexts-missing.json");
    const loaded = loadLfmContextsFromPath(missingPath);
    const context = lfmContextForSite("example-site", loaded);

    expect(context.status).toBe("insufficient_data");
    expect(context.value).toBeNull();
    expect(context.patchMean).toBeNull();
  });

  it("passes through an in-range prospectivity", () => {
    const contexts = parseLfmContexts(readyFixture);

    expect(contexts["site-a"].status).toBe("ready");
    expect(contexts["site-a"].value).toBe(0.42);
    expect(contexts["site-a"].patchMean).toBe(0.4);
  });

  it("rejects a prospectivity outside 0-1", () => {
    const contexts = parseLfmContexts({
      "site-a": { ...readyFixture["site-a"], value: 1.2, patchMean: -0.1 },
    });

    expect(contexts["site-a"].status).toBe("insufficient_data");
    expect(contexts["site-a"].value).toBeNull();
    expect(contexts["site-a"].patchMean).toBeNull();
  });
});
