# Demonstration script

In plain words: the first week at the practice spot on the crater rim does not meet the limits you chose. Waiting one week at the same spot does. A search of the three practice spots finds that one-week wait and ranks it first. These places are practice spots, not official landing sites.

The hours below were calculated from the saved NASA position tables and the real terrain grid. They are not targets. The 48-hour sunlight-gap limit, the 24-hour Earth-view-gap limit, the 2 m panel, and the 3 m antenna are user assumptions, not NASA requirements.

Baseline site: Example analysis A — Shackleton rim crest  
(−154.290046° east, −89.802353°, surface 1703.41 m).

## 1. Open the plan

Open the baseline plan: arrival **2026-12-05T06:00:00Z**, duration **168 hours**.

The screen reads **Exceeds selected limits**.

- Solar access **76.81 hours**. Longest solar interruption **91.19 hours**, from 2026-12-06T15:49:40Z to 2026-12-10T11:00:51Z. That gap sits fully inside the week and is **43.19 hours** over the 48-hour user assumption.
- Earth access **0.19 hours**. Longest in-window Earth interruption **167.81 hours**, from the arrival through 2026-12-12T05:48:41Z. The gap touches the end of the window, so the full real-world duration is not claimed. The in-window portion already exceeds the 24-hour user assumption by **143.81 hours**.
- Time when the Sun and Earth are both above the terrain horizon: **0.19 hours**.

## 2. Apply the landing delay

Keep the same site, the same 168-hour duration, and the same user assumptions. Move the arrival **168 hours** later, to **2026-12-12T06:00:00Z**.

This delay was chosen because the calculated visibility changes. It was not chosen to force a failure.

## 3. What changed

The delayed week is **Within selected limits**.

- Longest solar interruption **0.00 hours** (was 91.19). The Sun stays above the mask for all **168.00 hours**.
- Longest Earth interruption **0.00 hours** (was 167.81). Earth stays above the mask for all **168.00 hours**.
- Overlap rises from **0.19 hours** to **168.00 hours**.

In that week the Sun’s azimuth has moved into a lower part of the crest’s horizon, and Earth libration has lifted the Earth centre from about −7° to a path that clears the mask. At the first delayed sample the Earth centre is only about 0.01° above the horizon. The model does not resolve the Earth disc, so that grazing hour is still counted as visible.

## 4. Find an alternative

Search only the three practice spots at time shifts of −48, −24, 0, +24, +48, and +168 hours from the first arrival. Same stay length, same limits you chose. Eighteen options. This is a limited search, not the best place on the whole Moon.

**One searched option meets the limits.**

It is the same rim spot one week later, **2026-12-12T06:00:00Z**:

- Longest sunlight gap **0.00 hours**.
- Longest Earth-view gap **0.00 hours**.
- Time with both in view **168.00 hours**.
- It ranks first because it meets the limits. The week-long wait is a bigger change than a two-day slip, but the two-day slips still miss the limits.

The next option is the other ridge, also one week later. It still misses the sunlight limit: longest gap **84.72 hours**, both-in-view time **83.28 hours**.

## 5. Export

Export both scenarios. The report should carry:

- The two arrivals, 168-hour duration, and the user-assumption limits.
- The statements “Exceeds selected limits” for 2026-12-05 and “Within selected limits” for 2026-12-12, with the hours in step 3.
- The alternative list, with the one-week rim option marked as meeting the limits, and `limitedSearch: true`.
- Provenance: Horizons (Sun command 10, Earth command 399, `coord@301`, airless) retrieved 2026-11-14, and PGDA product 90 `LDEM_80S_80MPP_ADJ`.
- The limitation block: recharge, panel orientation, efficiency, temperature, load, and battery cycles are not modelled, and the Earth result is not a link budget.

The export is a screening record. It is not flight approval.
