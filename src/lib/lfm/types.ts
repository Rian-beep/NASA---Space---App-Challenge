/**
 * Auxiliary surface context from the NASA-IBM Lunar Foundation Model.
 * This is not an ephemeris and not a terrain horizon.
 */

export const LFM_MODEL_ID =
  "nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model";

export const LFM_CHECKPOINT =
  "nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model/ni_lfm_ps8_all_modalities_s42.ckpt";

export const LFM_LICENSE = "Apache-2.0" as const;

export const LFM_TASK = "polar_ice_prospectivity_regression" as const;

export const LFM_RESOLUTION_M = 240 as const;

/** Nine channels. Aspect is a sine/cosine pair. */
export const LFM_MODALITIES = [
  "aspect (sin/cos)",
  "CUR",
  "DICE",
  "LPSR",
  "LPSR_DEN",
  "LPSR_DIS",
  "slope",
  "TMAX",
] as const;

export const LFM_SOURCE_URLS = [
  "https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model",
  "https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model",
  "https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model",
  "https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression",
  "https://science.nasa.gov/science-research/artificial-intelligence-lunar-foundation-model/",
] as const;

export const LFM_LIMITATIONS = [
  "This regresses the Coyan et al. (2025) knowledge-driven fuzzy-overlay map. It is not measured ice.",
  "Not a resource estimate, and not evidence that ice is present at a location.",
  "Not validated for landing-site certification, ISRU, or hazard clearance.",
  "The backbone maintains no geodetic frame.",
  "Polar only: within 10° of each pole, evaluated at 240 m per pixel.",
  "Outputs must never replace JPL Horizons ephemerides or LOLA horizon visibility.",
] as const;

export const LFM_RMSE_NOTE =
  "Reported test RMSE is about 0.029 (0.0293 ± 0.0013) against the Coyan et al. (2025) map, not against measured ice.";

export const LFM_EXTENT_NOTE =
  "Defined only within 10° of each lunar pole. The released task uses 256×256 px patches at 240 m/px.";

export interface LfmSiteContext {
  status: "ready" | "insufficient_data" | "outside_extent";
  modelId: string;
  checkpoint: string;
  license: "Apache-2.0";
  task: "polar_ice_prospectivity_regression";
  siteId: string;
  /** Mean prospectivity in the site pixel neighbourhood, 0–1. */
  value: number | null;
  patchMean: number | null;
  resolutionM: 240;
  extentNote: string;
  retrievedAtUtc: string | null;
  sourceUrls: string[];
  limitations: string[];
  statement: string;
}
