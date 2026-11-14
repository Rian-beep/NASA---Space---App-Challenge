/**
 * Fixed lunar constants and the visibility model Lunar Window actually uses.
 * Equipment limits elsewhere in the app are user assumptions, not these constants.
 */

/** Mean Moon radius of the MOON_ME / DE421 sphere, metres. Matches PGDA product 90. */
export const BODY_RADIUS_M = 1_737_400;

/** Ephemeris and visibility sampling interval. Horizons STEP_SIZE is "1 h". */
export const TIME_SAMPLE_HOURS = 1;

/**
 * Horizon mask spacing. Elevation is evaluated on each ray; between rays it is
 * interpolated. Finer terrain structure than this is not resolved.
 */
export const HORIZON_AZIMUTH_STEP_DEG = 2;

/**
 * How far along the surface each horizon ray must see terrain before that
 * azimuth is reported as terrain-backed. Azimuths that leave the grid sooner
 * are "missing". This is not the geometric limb distance.
 */
export const HORIZON_SEARCH_RADIUS_M = 12_000;

/**
 * Body-centre test. Wording is part of the public provenance string.
 * Partial discs and eclipses are outside the model on purpose.
 */
export const VISIBILITY_MODEL =
  "body-centre compared with terrain horizon; partial solar/Earth disc NOT resolved; eclipses NOT modelled; Earth visibility is geometric centre only, not a communication link.";

/** JPL Horizons API manual for the query parameters this tool sends. */
export const HORIZONS_DOC_URL = "https://ssd-api.jpl.nasa.gov/doc/horizons.html";

export const HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";

/** PGDA product 90 catalogue page. */
export const TERRAIN_PRODUCT_PAGE_URL = "https://pgda.gsfc.nasa.gov/products/90";

/** Cloud-optimized LDEM used for the analysis window. */
export const TERRAIN_PRODUCT_FILE_URL =
  "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF";

export const TERRAIN_PRODUCT_ID = "PGDA-90 LDEM_80S_80MPP_ADJ";

export const HORIZONS_USER_AGENT =
  "LunarWindow/0.1.0 (NASA Space Apps Challenge; educational planning tool)";

/**
 * Screening does not model power-system behaviour. These sentences are copied
 * into every provenance block.
 */
export const MODEL_LIMITATIONS: readonly string[] = [
  "Screening uses interruption tolerance only.",
  "Recharge is NOT modelled.",
  "Panel orientation is NOT modelled.",
  "Efficiency is NOT modelled.",
  "Temperature is NOT modelled.",
  "Load is NOT modelled.",
  "Battery cycles are NOT modelled.",
  "The Earth result is NOT a link budget.",
  "Partial solar and Earth discs are not resolved; only the body centre is compared with the terrain horizon.",
  "Eclipses are NOT modelled.",
  "An interruption that touches the analysis-window edge is truncated: the hours reported are only the in-window portion, and the full real-world duration is not claimed.",
  "Terrain beyond the documented horizon search radius is outside the mask. Missing terrain is never treated as a flat horizon.",
  "Interruption limits are user assumptions, not NASA or mission requirements.",
];
