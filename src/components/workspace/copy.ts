/** User-facing phrases. Status words stay exact. */
export const PRESENTATION_BADGE = "Precomputed from NASA data";

export const EXAMPLE_SITE_NOTE =
  "Practice spots we picked. They are not official landing sites.";

export const SUN_PANEL_TEXT =
  "This only checks how long a sunlight gap you will accept. It does not model a battery.";

export const EARTH_PANEL_TEXT =
  "This is whether Earth is above the ground line. It is not a promise that a radio link will work.";

export const OVERLAP_TEXT =
  "Hours when sunlight and a clear view of Earth happen at the same time.";

export const DISCLAIMER =
  "Lunar Window is a learning and planning tool. It is not a flight check, and it must not be used to approve a landing.";

export const RESOLUTION_NOTE =
  "The grid spacing and the time step say how finely we looked. They are not a measure of how wrong the hills or the sky path might be.";

export const UNCERTAINTY_NOTE =
  "What the model cannot settle is listed with the limits of the method, separate from the grid spacing.";

export const SCIENCE_NOT_READY = "science module not ready";

export const STATUS_PHRASE = {
  within_limits: "Within selected limits",
  exceeds_limits: "Exceeds selected limits",
  insufficient_data: "Insufficient data",
} as const;
