import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatHours,
  formatLongitude,
  formatUtcLabel,
  toIsoUtc,
} from "./format";
import {
  bodyClearance,
  horizonDrawSegments,
  horizonElevationAt,
  horizonHasGap,
} from "./horizonPath";
import {
  datasetCentre,
  eastWestMetres,
  localEnu,
  placeOnPreview,
} from "./projection";
import {
  clipInterval,
  fractionToIso,
  intersectAccess,
  interruptionLabel,
  intervalHoursInWindow,
  shiftIso,
  timelineLayout,
} from "./timelineScale";

describe("time labels", () => {
  it("formats UTC without shifting the clock", () => {
    assert.equal(formatUtcLabel("2026-12-01T00:00:00Z"), "2026-12-01 00:00 UTC");
    assert.equal(toIsoUtc(Date.parse("2026-12-01T00:00:00Z")), "2026-12-01T00:00:00Z");
  });

  it("labels a truncated interruption with the window edge", () => {
    assert.equal(interruptionLabel(14, true), "14 h (gap continues past this time window)");
    assert.equal(interruptionLabel(6.5, false), "6.5 h");
    assert.equal(formatHours(14), "14 h");
  });
});

describe("local map projection", () => {
  it("puts east and north on the positive axes", () => {
    const origin = { lon: 0, lat: -89 };
    const east = localEnu(1, -89, origin.lon, origin.lat);
    const north = localEnu(0, -88, origin.lon, origin.lat);
    assert.ok(east.eastM > 0);
    assert.ok(Math.abs(east.northM) < 30);
    assert.ok(north.northM > 20_000);
    assert.ok(Math.abs(north.eastM) < 30);
  });

  it("separates opposite longitudes across the pole", () => {
    const opposite = localEnu(180, -89, 0, -89);
    assert.ok(opposite.northM < -50_000);
    assert.ok(Math.abs(opposite.eastM) < 1_000);
  });

  it("wraps longitude the short way", () => {
    const across = localEnu(-179, -89, 179, -89);
    assert.ok(across.eastM > 0);
    assert.ok(across.eastM < 5_000);
  });

  it("uses a circular mean for the dataset centre", () => {
    const centre = datasetCentre([
      { eastLongitudeDeg: 350, latitudeDeg: -89 },
      { eastLongitudeDeg: 10, latitudeDeg: -89 },
    ]);
    assert.ok(Math.abs(centre.lonDeg) < 1);
    assert.equal(centre.latDeg, -89);
  });

  it("places preview coordinates north-up and east-right", () => {
    const placed = placeOnPreview(120, -88.5, {
      minLon: 100,
      maxLon: 140,
      minLat: -89,
      maxLat: -88,
    });
    assert.ok(placed);
    assert.equal(placed.x, 0.5);
    assert.equal(placed.y, 0.5);
    assert.equal(placed.outside, false);
    const outside = placeOnPreview(0, -88.5, {
      minLon: 100,
      maxLon: 140,
      minLat: -89,
      maxLat: -88,
    });
    assert.equal(outside?.outside, true);
  });

  it("shrinks east-west distance toward the pole", () => {
    const mid = eastWestMetres(1, -80);
    const polar = eastWestMetres(1, -89.5);
    assert.ok(polar > 0);
    assert.ok(polar < mid);
  });

  it("labels 180 degrees without a false hemisphere", () => {
    assert.equal(formatLongitude(180), "180°");
  });
});

describe("horizon path", () => {
  const samples = [
    { azimuthDeg: 0, elevationDeg: 10 },
    { azimuthDeg: 10, elevationDeg: 20 },
    { azimuthDeg: 20, elevationDeg: null },
    { azimuthDeg: 30, elevationDeg: 5 },
  ];

  it("interpolates only across measured steps", () => {
    assert.equal(horizonElevationAt(samples, 5, 15), 15);
    assert.equal(horizonElevationAt(samples, 15, 15), null);
    assert.equal(horizonElevationAt(samples, 25, 15), null);
    assert.equal(horizonHasGap(samples, 15), true);
  });

  it("draws a gap instead of bridging a missing sample", () => {
    const segments = horizonDrawSegments(samples, 15);
    assert.equal(segments.length, 2);
    assert.deepEqual(
      segments[0].map((point) => point.azimuthDeg),
      [0, 10],
    );
  });

  it("joins a short wrap across 0 degrees", () => {
    const wrapped = [
      { azimuthDeg: 350, elevationDeg: 0 },
      { azimuthDeg: 10, elevationDeg: 10 },
    ];
    assert.equal(horizonElevationAt(wrapped, 355, 25), 2.5);
    assert.equal(horizonElevationAt(wrapped, 0, 25), 5);
    const segments = horizonDrawSegments(wrapped, 25);
    const azimuths = segments.flat().map((point) => point.azimuthDeg);
    assert.ok(azimuths.includes(0));
    assert.ok(azimuths.includes(360));
  });

  it("does not call a body below the terrain unless both elevations exist", () => {
    assert.equal(bodyClearance(5, 1), "below");
    assert.equal(bodyClearance(5, 8), "above");
    assert.equal(bodyClearance(null, 1), "unknown");
    assert.equal(bodyClearance(5, null), "unknown");
  });
});

describe("timeline window", () => {
  const start = "2026-12-01T00:00:00Z";
  const end = "2026-12-03T00:00:00Z";
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  it("clips interruption hours to the window", () => {
    const interval = {
      startUtc: "2026-11-30T00:00:00Z",
      endUtc: "2026-12-01T04:00:00Z",
      kind: "interruption" as const,
      truncated: true,
    };
    assert.equal(intervalHoursInWindow(interval, startMs, endMs), 4);
    const clipped = clipInterval(interval, startMs, endMs);
    assert.equal(clipped?.startMs, startMs);
  });

  it("intersects access and does not invent time outside either interval", () => {
    const overlap = intersectAccess(
      [
        {
          startUtc: "2026-12-01T00:00:00Z",
          endUtc: "2026-12-01T10:00:00Z",
          kind: "access",
          truncated: false,
        },
      ],
      [
        {
          startUtc: "2026-12-01T06:00:00Z",
          endUtc: "2026-12-01T12:00:00Z",
          kind: "access",
          truncated: false,
        },
      ],
    );
    assert.equal(overlap.length, 1);
    assert.equal(overlap[0].startUtc, "2026-12-01T06:00:00Z");
    assert.equal(overlap[0].endUtc, "2026-12-01T10:00:00Z");
  });

  it("seeks inside the window on one-hour steps", () => {
    assert.equal(fractionToIso(0, startMs, endMs), start);
    assert.equal(fractionToIso(1, startMs, endMs), end);
    assert.equal(shiftIso(start, start, end, 1), "2026-12-01T01:00:00Z");
    assert.equal(shiftIso(start, start, end, -5), start);
    assert.equal(shiftIso(end, start, end, 5), end);
  });

  it("aligns the three rows to one plot column", () => {
    const layout = timelineLayout(800, false);
    assert.equal(layout.rows.length, 3);
    assert.ok(layout.plotW > 0);
    assert.ok(layout.rows[1].barY > layout.rows[0].barY + layout.rows[0].barH);
    assert.ok(layout.rows[2].barY > layout.rows[1].barY + layout.rows[1].barH);
  });
});
