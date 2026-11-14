/** Terrain-horizon geometry. Elevation increases upward. A gap is not interpolated. */

export interface HorizonPoint {
  azimuthDeg: number;
  elevationDeg: number | null;
}

export interface HorizonVertex {
  azimuthDeg: number;
  elevationDeg: number;
}

export function normalizeAzimuth(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function horizonMaxGapDeg(azimuthStepDeg: number): number {
  if (!(azimuthStepDeg > 0) || !Number.isFinite(azimuthStepDeg)) return 5;
  return azimuthStepDeg * 1.5;
}

function dedupe(samples: HorizonPoint[]): HorizonPoint[] {
  const byAzimuth = new Map<number, HorizonPoint>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.azimuthDeg)) continue;
    const azimuthDeg = Math.round(normalizeAzimuth(sample.azimuthDeg) * 1e6) / 1e6;
    byAzimuth.set(azimuthDeg, {
      azimuthDeg,
      elevationDeg:
        sample.elevationDeg != null && Number.isFinite(sample.elevationDeg)
          ? sample.elevationDeg
          : null,
    });
  }
  return [...byAzimuth.values()].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
}

function forwardGap(index: number, seq: HorizonPoint[]): number {
  const current = seq[index];
  const next = seq[(index + 1) % seq.length];
  if (index === seq.length - 1) return next.azimuthDeg + 360 - current.azimuthDeg;
  return next.azimuthDeg - current.azimuthDeg;
}

export function horizonHasGap(samples: HorizonPoint[], maxGapDeg: number): boolean {
  const seq = dedupe(samples);
  if (seq.length === 0) return true;
  if (seq.some((sample) => sample.elevationDeg == null)) return true;
  for (let index = 0; index < seq.length; index += 1) {
    if (forwardGap(index, seq) > maxGapDeg) return true;
  }
  return false;
}

export interface AzimuthGap {
  /** Mid-azimuth in [0, 360). */
  midAzimuthDeg: number;
  spanDeg: number;
}

export function largestHorizonGap(
  samples: HorizonPoint[],
  maxGapDeg: number,
): AzimuthGap | null {
  const seq = dedupe(samples);
  if (seq.length === 0) return { midAzimuthDeg: 180, spanDeg: 360 };
  let best: AzimuthGap | null = null;
  const consider = (start: number, span: number) => {
    if (!(span > 0)) return;
    if (!best || span > best.spanDeg) {
      best = { midAzimuthDeg: normalizeAzimuth(start + span / 2), spanDeg: span };
    }
  };
  for (let index = 0; index < seq.length; index += 1) {
    const current = seq[index];
    const next = seq[(index + 1) % seq.length];
    const gap = forwardGap(index, seq);
    const broken =
      current.elevationDeg == null || next.elevationDeg == null || gap > maxGapDeg;
    if (!broken) continue;
    consider(current.azimuthDeg, Math.max(gap, 0.5));
  }
  if (seq.some((sample) => sample.elevationDeg == null) && !best) {
    const missing = seq.find((sample) => sample.elevationDeg == null);
    if (missing) return { midAzimuthDeg: missing.azimuthDeg, spanDeg: maxGapDeg };
  }
  return best;
}

export function horizonDrawSegments(
  samples: HorizonPoint[],
  maxGapDeg: number,
): HorizonVertex[][] {
  const seq = dedupe(samples);
  const segments: HorizonVertex[][] = [];
  let current: HorizonVertex[] = [];
  const flush = () => {
    if (current.length > 0) segments.push(current);
    current = [];
  };
  for (const sample of seq) {
    if (sample.elevationDeg == null) {
      flush();
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && sample.azimuthDeg - previous.azimuthDeg > maxGapDeg) flush();
    current.push({ azimuthDeg: sample.azimuthDeg, elevationDeg: sample.elevationDeg });
  }
  flush();
  closeWrap(seq, segments, maxGapDeg);
  return segments;
}

function closeWrap(
  seq: HorizonPoint[],
  segments: HorizonVertex[][],
  maxGapDeg: number,
): void {
  if (seq.length < 2 || segments.length === 0) return;
  const first = seq[0];
  const last = seq[seq.length - 1];
  if (first.elevationDeg == null || last.elevationDeg == null) return;
  const gap = first.azimuthDeg + 360 - last.azimuthDeg;
  if (!(gap > 0) || gap > maxGapDeg) return;
  const edge =
    last.elevationDeg +
    ((360 - last.azimuthDeg) / gap) * (first.elevationDeg - last.elevationDeg);
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  if (firstSeg[0]?.azimuthDeg !== first.azimuthDeg) return;
  if (lastSeg[lastSeg.length - 1]?.azimuthDeg !== last.azimuthDeg) return;
  lastSeg.push({ azimuthDeg: 360, elevationDeg: edge });
  if (first.azimuthDeg > 0) {
    segments.unshift([
      { azimuthDeg: 0, elevationDeg: edge },
      { azimuthDeg: first.azimuthDeg, elevationDeg: first.elevationDeg },
    ]);
  }
}

export function horizonElevationAt(
  samples: HorizonPoint[],
  azimuthDeg: number,
  maxGapDeg: number,
): number | null {
  const azimuth = normalizeAzimuth(azimuthDeg);
  const seq = dedupe(samples);
  for (const sample of seq) {
    const delta = Math.min(
      Math.abs(sample.azimuthDeg - azimuth),
      Math.abs(sample.azimuthDeg + 360 - azimuth),
      Math.abs(sample.azimuthDeg - (azimuth + 360)),
    );
    if (delta < 1e-4) return sample.elevationDeg;
  }
  for (let index = 0; index < seq.length; index += 1) {
    const start = seq[index];
    const end = seq[(index + 1) % seq.length];
    const gap = forwardGap(index, seq);
    if (!(gap > 0) || gap > maxGapDeg) continue;
    if (start.elevationDeg == null || end.elevationDeg == null) continue;
    let along: number | null = null;
    if (index === seq.length - 1) {
      if (azimuth >= start.azimuthDeg) along = azimuth - start.azimuthDeg;
      else if (azimuth <= end.azimuthDeg) along = azimuth + 360 - start.azimuthDeg;
    } else if (azimuth >= start.azimuthDeg && azimuth <= end.azimuthDeg) {
      along = azimuth - start.azimuthDeg;
    }
    if (along == null) continue;
    const t = along / gap;
    return start.elevationDeg + t * (end.elevationDeg - start.elevationDeg);
  }
  return null;
}

export function elevationDomain(values: number[]): { min: number; max: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { min: -10, max: 20 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min > 0 && min <= 15) min = 0;
  if (max < 0 && max >= -15) max = 0;
  if (max - min < 8) {
    const mid = (min + max) / 2;
    min = mid - 4;
    max = mid + 4;
  }
  const pad = (max - min) * 0.14;
  return { min: min - pad, max: max + pad };
}

export function linearTicks(min: number, max: number, targetCount = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [];
  const step = niceStep(span / targetCount);
  const start = Math.ceil((min - step * 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    const rounded = Number(value.toFixed(6));
    if (rounded < min - step * 1e-6 || rounded > max + step * 1e-6) continue;
    ticks.push(rounded);
    if (ticks.length > 12) break;
  }
  return ticks;
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / power;
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return nice * power;
}

export type BodyClearance = "below" | "above" | "level" | "unknown";

export function bodyClearance(
  horizonElevationDeg: number | null,
  bodyElevationDeg: number | null,
): BodyClearance {
  if (horizonElevationDeg == null || bodyElevationDeg == null) return "unknown";
  const delta = bodyElevationDeg - horizonElevationDeg;
  if (Math.abs(delta) < 0.05) return "level";
  return delta < 0 ? "below" : "above";
}
