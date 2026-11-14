"use client";

import NextImage from "next/image";
import { useEffect, useState } from "react";
import type { AudienceMode, LunarSite } from "@/lib/science/types";
import {
  formatKilometres,
  formatLatitude,
  formatLongitude,
  formatMetres,
} from "./format";
import {
  EARTH_INK,
  INK,
  PAPER,
  SUN_INK,
  focusClass,
  measureClass,
  modeText,
  panelClass,
  StatusNote,
} from "./marks";
import {
  GRID_INSET,
  MOON_RADIUS_M,
  applyInset,
  datasetCentre,
  eastWestMetres,
  enuFraction,
  frameEnu,
  localEnu,
  niceDegreeStep,
  placeOnPreview,
  previewSpanOk,
  rayExit,
  ringRadiiMetres,
  scaleBarMetres,
  siteExtentFraction,
  visualFraction,
  type GeoBounds,
} from "./projection";
import { useElementSize } from "./useElementSize";

export const DEFAULT_TERRAIN_PREVIEW_URL = "/terrain/south-pole-preview.png";

export interface TerrainPreview {
  imageUrl: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  attribution: string;
}

export interface LunarMapProps {
  sites: LunarSite[];
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
  coverageLabel: string;
  mode: AudienceMode;
  preview?: TerrainPreview | null;
}

type ImageState =
  | { status: "pending" }
  | { status: "missing" }
  | { status: "ready"; width: number; height: number };

type MapKind = "image" | "bounds" | "local";

const MONO = "var(--font-geist-mono), ui-monospace, monospace";

export function LunarMap({
  sites,
  selectedSiteId,
  onSelectSite,
  coverageLabel,
  mode,
  preview = null,
}: LunarMapProps) {
  const explore = mode === "explore";
  const type = modeText(explore);
  const bounds: GeoBounds | null =
    preview && previewSpanOk(preview) ? preview : null;
  const imageUrl = (preview?.imageUrl ?? "").trim() || DEFAULT_TERRAIN_PREVIEW_URL;
  const [image, setImage] = useState<ImageState>({ status: "pending" });
  const [frameRef, box] = useElementSize();

  useEffect(() => {
    let cancelled = false;
    setImage({ status: "pending" });
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImage({
        status: "ready",
        width: img.naturalWidth || 1,
        height: img.naturalHeight || 1,
      });
    };
    img.onerror = () => {
      if (!cancelled) setImage({ status: "missing" });
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const mapKind: MapKind =
    bounds && image.status === "ready"
      ? "image"
      : bounds
        ? "bounds"
        : "local";

  const centre = datasetCentre(sites);
  const localPoints = sites.map((site) => ({
    site,
    ...localEnu(site.eastLongitudeDeg, site.latitudeDeg, centre.lonDeg, centre.latDeg),
  }));
  const frame = frameEnu(
    [...localPoints.map((point) => ({ eastM: point.eastM, northM: point.northM })), { eastM: 0, northM: 0 }],
    20_000,
    0.34,
  );

  const placed = sites.map((site) => {
    if (mapKind === "local") {
      const point = localPoints.find((item) => item.site.id === site.id);
      const fraction = applyInset(
        enuFraction(
          { eastM: point?.eastM ?? 0, northM: point?.northM ?? 0 },
          frame,
        ),
      );
      return { site, x: fraction.x, y: fraction.y, outside: false };
    }
    const onImage = placeOnPreview(site.eastLongitudeDeg, site.latitudeDeg, bounds!);
    if (!onImage) return { site, x: 0.5, y: 0.5, outside: true };
    return {
      site,
      x: visualFraction(onImage.x),
      y: visualFraction(onImage.y),
      outside: onImage.outside,
    };
  });

  const outside = placed.filter((item) => item.outside).map((item) => item.site);
  const selected = sites.find((site) => site.id === selectedSiteId) ?? null;
  const aspect =
    mapKind === "image" && image.status === "ready" ? image.width / image.height : 1;
  const viewW = box.width > 0 ? box.width : 640;
  const viewH =
    aspect === 1
      ? viewW
      : box.height > 0
        ? box.height
        : Math.max(1, Math.round(viewW / aspect));
  const font = box.width > 0 ? (explore ? 15 : 12) : 20;

  const scale = scaleFor(mapKind, frame, bounds);
  return (
    <section className={`${panelClass} p-5 sm:p-6`}>
      <header className="max-w-[65ch] space-y-2">
        <h2 className={`${type.title} font-semibold tracking-tight`}>Places on the Moon</h2>
        {coverageLabel ? <p className={type.body}>{coverageLabel}</p> : null}
        <p className={`${type.body} text-stone-700`}>{captionFor(mapKind, image.status, centre, explore)}</p>
      </header>

      {image.status === "ready" && mapKind === "local" ? (
        <figure className="mt-6">
          <NextImage
            src={imageUrl}
            alt="Terrain preview. Geographic bounds were not supplied."
            width={image.width}
            height={image.height}
            unoptimized
            className="max-h-56 w-full border border-stone-200 bg-stone-100 object-contain"
          />
          <figcaption className="mt-3">
            <StatusNote>
              Terrain preview. Bounds were not supplied, so sites are plotted on the
              grid and are not tied to this image.
            </StatusNote>
          </figcaption>
        </figure>
      ) : null}

      <div className="mb-24 mt-6">
        <div
          ref={frameRef}
          className="relative w-full"
          style={{ aspectRatio: String(aspect) }}
        >
          <div className="absolute inset-0 overflow-hidden bg-stone-100">
            {mapKind === "image" && image.status === "ready" ? (
              <NextImage
                src={imageUrl}
                alt={
                  preview?.attribution
                    ? `Terrain preview. ${preview.attribution}`
                    : "Terrain preview"
                }
                fill
                unoptimized
                sizes="100vw"
                style={{ objectFit: "fill" }}
              />
            ) : null}
            <svg
              viewBox={`0 0 ${viewW} ${viewH}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {mapKind === "local" ? (
                <LocalGrid view={viewW} frame={frame} font={font} centre={centre} />
              ) : null}
              {mapKind === "bounds" && bounds ? (
                <BoundsGrid viewW={viewW} viewH={viewH} bounds={bounds} font={font} />
              ) : null}
              <CoverageOutline
                mapKind={mapKind}
                viewW={viewW}
                viewH={viewH}
                frame={frame}
                points={localPoints}
                label={coverageLabel}
                font={font}
              />
              {scale ? (
                <ScaleBar
                  x={12}
                  y={viewH - 46}
                  width={Math.min(viewW * 0.42, scale.pixels(viewW))}
                  label={scale.label}
                  font={font}
                />
              ) : null}
            </svg>
          </div>
          {placed.map((item) => (
            <SiteButton
              key={item.site.id}
              site={item.site}
              selected={item.site.id === selectedSiteId}
              x={item.x}
              y={item.y}
              mode={mode}
              onSelectSite={onSelectSite}
            />
          ))}
        </div>
      </div>

      <div className={`mt-8 max-w-[65ch] space-y-3 ${type.body}`}>
        {image.status === "missing" && preview ? (
          <StatusNote>Preview image did not load.</StatusNote>
        ) : null}
        {outside.length > 0 ? (
          <StatusNote>
            {outside.length === 1
              ? `${outside[0].name} is outside the preview bounds.`
              : `${outside.length} sites are outside the preview bounds.`}
          </StatusNote>
        ) : null}
        {scale ? (
          <p className={`${measureClass} text-stone-800`}>
            Scale bar {scale.label}. Longitude is positive east.
          </p>
        ) : (
          <p className="text-stone-800">Scale is undefined for these bounds.</p>
        )}
        {selected ? (
          <SelectedReadout site={selected} explore={explore} />
        ) : (
          <p>Choose a place on the map.</p>
        )}
      </div>

      <div className={`mt-6 flex flex-col gap-3 border-t border-stone-200 pt-4 ${type.meta} text-stone-800`}>
        <p className="flex items-center gap-2">
          <SiteMark />
          <span>A circle is a practice spot. A square with a centre dot is the place you chose.</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <BodySwatch color={SUN_INK} shape="circle" />
            Sun
          </span>
          <span className="inline-flex items-center gap-2">
            <BodySwatch color={EARTH_INK} shape="diamond" />
            Earth
          </span>
          <span>The Sun and Earth are not pins on this map. They are shown on the ground-line chart and the timeline.</span>
        </p>
      </div>
    </section>
  );
}

function captionFor(
  kind: MapKind,
  imageStatus: ImageState["status"],
  centre: { lonDeg: number; latDeg: number },
  explore: boolean,
): string {
  if (kind === "image") {
    return "Sites are placed linearly across the preview bounds. North is up. East is to the right.";
  }
  if (kind === "bounds") {
    if (imageStatus === "pending") {
      return "Checking for a terrain preview. Positions follow the preview bounds. North is up. East is to the right.";
    }
    return "Linear longitude and latitude across the preview bounds. North is up. East is to the right. Not a terrain image.";
  }
  const where = `${formatLatitude(centre.latDeg)}, ${formatLongitude(centre.lonDeg)}`;
  if (explore) {
    return `Schematic polar grid centred at ${where}. Not a terrain image. Distances are approximate.`;
  }
  return `Schematic polar grid centred at ${where}. South-polar stereographic on a ${formatKilometres(MOON_RADIUS_M)} sphere, with geographic north at the centre pointing up. Not a terrain image. Distances are approximate.`;
}

function scaleFor(
  kind: MapKind,
  frame: { minEastM: number; maxEastM: number },
  bounds: GeoBounds | null,
): { label: string; pixels: (viewW: number) => number } | null {
  if (kind === "local") {
    const span = frame.maxEastM - frame.minEastM;
    if (!(span > 0)) return null;
    const metres = scaleBarMetres(span);
    return {
      label: `${formatKilometres(metres)}, approx.`,
      pixels: (viewW) => (metres / span) * (1 - 2 * GRID_INSET) * viewW,
    };
  }
  if (!bounds) return null;
  const east = Math.abs(
    eastWestMetres(bounds.maxLon - bounds.minLon, (bounds.minLat + bounds.maxLat) / 2),
  );
  if (!(east >= 1)) return null;
  const metres = scaleBarMetres(east);
  return {
    label: `${formatKilometres(metres)}, approx. east–west`,
    pixels: (viewW) => (metres / east) * viewW,
  };
}

function LocalGrid({
  view,
  frame,
  font,
  centre,
}: {
  view: number;
  frame: ReturnType<typeof frameEnu>;
  font: number;
  centre: { lonDeg: number; latDeg: number };
}) {
  const origin = applyInset(enuFraction({ eastM: 0, northM: 0 }, frame));
  const ox = origin.x * view;
  const oy = origin.y * view;
  const inner = (1 - 2 * GRID_INSET) * view;
  const metresPerPx = (frame.maxEastM - frame.minEastM) / inner;
  const rings = ringRadiiMetres(frame);
  const spokes = Array.from({ length: 12 }, (_, index) => index * 30);
  const pole = localEnu(centre.lonDeg, -90, centre.lonDeg, centre.latDeg);
  const poleFraction = applyInset(enuFraction(pole, frame));
  const showPole =
    poleFraction.x > 0.06 &&
    poleFraction.x < 0.94 &&
    poleFraction.y > 0.06 &&
    poleFraction.y < 0.94 &&
    Math.hypot(pole.eastM, pole.northM) > 2_000;

  return (
    <g>
      <rect width={view} height={view} fill="#f5f5f4" />
      {spokes.map((bearing) => {
        const end = rayExit(frame, bearing);
        if (!end) return null;
        const fraction = applyInset(enuFraction(end, frame));
        const cardinal = bearing % 90 === 0;
        return (
          <line
            key={bearing}
            x1={ox}
            y1={oy}
            x2={fraction.x * view}
            y2={fraction.y * view}
            stroke={cardinal ? "#a8a29e" : "#d6d3d1"}
            strokeWidth={cardinal ? 1.25 : 1}
          />
        );
      })}
      {rings.map((radius) => (
        <circle
          key={radius}
          cx={ox}
          cy={oy}
          r={radius / metresPerPx}
          fill="none"
          stroke="#d6d3d1"
        />
      ))}
      {rings.map((radius) => {
        const fraction = applyInset(enuFraction({ eastM: radius, northM: 0 }, frame));
        if (fraction.x < 0.08 || fraction.x > 0.92 || fraction.y < 0.08 || fraction.y > 0.92) {
          return null;
        }
        return (
          <text
            key={`label-${radius}`}
            x={fraction.x * view}
            y={fraction.y * view - 4}
            fill="#44403c"
            fontSize={font}
            style={{ fontFamily: MONO }}
          >
            {formatKilometres(radius)}
          </text>
        );
      })}
      {(["N", "E", "S", "W"] as const).map((label, index) => {
        const end = rayExit(frame, index * 90);
        if (!end) return null;
        const fraction = applyInset(enuFraction(end, frame));
        const x = fraction.x * view;
        const y = fraction.y * view;
        const pull = 0.08;
        return (
          <text
            key={label}
            x={x + (ox - x) * pull}
            y={y + (oy - y) * pull}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={INK}
            fontSize={font + 1}
            fontWeight={600}
          >
            {label}
          </text>
        );
      })}
      <path d={`M ${ox - 7} ${oy} H ${ox + 7} M ${ox} ${oy - 7} V ${oy + 7}`} stroke={INK} strokeWidth={1.25} />
      {showPole ? (
        <g>
          <path
            d={`M ${poleFraction.x * view - 5} ${poleFraction.y * view} H ${poleFraction.x * view + 5} M ${poleFraction.x * view} ${poleFraction.y * view - 5} V ${poleFraction.y * view + 5}`}
            stroke="#44403c"
            strokeWidth={1.25}
          />
          <text
            x={poleFraction.x * view + 8}
            y={poleFraction.y * view - 6}
            fill="#44403c"
            fontSize={font}
          >
            South pole
          </text>
        </g>
      ) : null}
    </g>
  );
}

function BoundsGrid({
  viewW,
  viewH,
  bounds,
  font,
}: {
  viewW: number;
  viewH: number;
  bounds: GeoBounds;
  font: number;
}) {
  const lonStep = niceDegreeStep(bounds.maxLon - bounds.minLon);
  const latStep = niceDegreeStep(bounds.maxLat - bounds.minLat);
  const longitudes: number[] = [];
  const latitudes: number[] = [];
  for (let lon = Math.ceil(bounds.minLon / lonStep) * lonStep; lon < bounds.maxLon - lonStep * 0.05; lon += lonStep) {
    longitudes.push(Number(lon.toFixed(4)));
    if (longitudes.length > 8) break;
  }
  for (let lat = Math.ceil(bounds.minLat / latStep) * latStep; lat < bounds.maxLat - latStep * 0.05; lat += latStep) {
    latitudes.push(Number(lat.toFixed(4)));
    if (latitudes.length > 8) break;
  }
  return (
    <g>
      <rect width={viewW} height={viewH} fill="#f5f5f4" />
      {longitudes.map((lon) => {
        const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * viewW;
        return (
          <g key={lon}>
            <line x1={x} y1={0} x2={x} y2={viewH} stroke="#d6d3d1" />
            <text x={x + 4} y={font + 6} fill="#44403c" fontSize={font} style={{ fontFamily: MONO }}>
              {formatLongitude(lon)}
            </text>
          </g>
        );
      })}
      {latitudes.map((lat) => {
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * viewH;
        return (
          <g key={lat}>
            <line x1={0} y1={y} x2={viewW} y2={y} stroke="#d6d3d1" />
            <text x={6} y={y - 4} fill="#44403c" fontSize={font} style={{ fontFamily: MONO }}>
              {formatLatitude(lat)}
            </text>
          </g>
        );
      })}
      <text x={viewW / 2} y={font + 8} textAnchor="middle" fill={INK} fontSize={font + 1} fontWeight={600}>
        N up
      </text>
    </g>
  );
}

function CoverageOutline({
  mapKind,
  viewW,
  viewH,
  frame,
  points,
  label,
  font,
}: {
  mapKind: MapKind;
  viewW: number;
  viewH: number;
  frame: ReturnType<typeof frameEnu>;
  points: { eastM: number; northM: number }[];
  label: string;
  font: number;
}) {
  const rect =
    mapKind === "local"
      ? siteExtentFraction(points, frame, 8_000)
      : { x: 0, y: 0, w: 1, h: 1 };
  if (!rect || rect.w <= 0 || rect.h <= 0) return null;
  const x = rect.x * viewW + (mapKind === "local" ? 0 : 8);
  const y = rect.y * viewH + (mapKind === "local" ? 0 : 8);
  const w = rect.w * viewW - (mapKind === "local" ? 0 : 16);
  const h = rect.h * viewH - (mapKind === "local" ? 0 : 16);
  if (w < 8 || h < 8) return null;
  const textW = label.length * font * 0.56 + 12;
  const showLabel = label.length > 0 && textW < w - 8 && h > font + 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#292524" strokeWidth={1.5} />
      {showLabel ? (
        <g>
          <rect x={x + 6} y={y + 6} width={textW} height={font + 8} fill={PAPER} stroke="#e7e5e4" />
          <text x={x + 12} y={y + 6 + font} fill={INK} fontSize={font}>
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function ScaleBar({
  x,
  y,
  width,
  label,
  font,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  font: number;
}) {
  const bar = Math.max(28, width);
  const boxW = Math.max(bar + 16, label.length * font * 0.58 + 16);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={boxW} height={font + 22} fill={PAPER} stroke="#e7e5e4" />
      <line x1={8} y1={10} x2={8 + bar} y2={10} stroke={INK} strokeWidth={2} />
      <line x1={8} y1={6} x2={8} y2={14} stroke={INK} strokeWidth={1.5} />
      <line x1={8 + bar} y1={6} x2={8 + bar} y2={14} stroke={INK} strokeWidth={1.5} />
      <text x={8} y={font + 14} fill={INK} fontSize={font} style={{ fontFamily: MONO }}>
        {label}
      </text>
    </g>
  );
}

function SiteButton({
  site,
  selected,
  x,
  y,
  mode,
  onSelectSite,
}: {
  site: LunarSite;
  selected: boolean;
  x: number;
  y: number;
  mode: AudienceMode;
  onSelectSite: (id: string) => void;
}) {
  const example = site.kind === "example_analysis";
  const explore = mode === "explore";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={[
        site.name,
        example ? "practice spot" : "place you entered",
        formatLatitude(site.latitudeDeg),
        formatLongitude(site.eastLongitudeDeg),
        `${formatMetres(site.surfaceHeightM)} surface height`,
        selected ? "selected" : "not selected",
      ].join(", ")}
      onClick={() => onSelectSite(site.id)}
      className={`${focusClass} absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${selected ? "z-20" : "z-10"}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      {selected ? <SelectedMark /> : <SiteMark />}
      <span
        className={`pointer-events-none absolute top-full left-1/2 mt-1 w-max max-w-[11rem] -translate-x-1/2 border border-stone-200 bg-stone-50 px-1.5 py-1 text-center text-stone-900 ${explore ? "text-sm" : "text-xs"}`}
      >
        <span className="block font-semibold leading-tight">{site.name}</span>
        <span className="mt-0.5 block leading-tight text-stone-700">
          {example ? "Practice spot" : "Place you entered"}
        </span>
        {selected ? <span className="mt-0.5 block font-semibold leading-tight">Selected</span> : null}
        {mode === "analyze" ? (
          <span className={`${measureClass} mt-0.5 block leading-tight text-stone-700`}>
            {formatLatitude(site.latitudeDeg)} {formatLongitude(site.eastLongitudeDeg)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SelectedReadout({ site, explore }: { site: LunarSite; explore: boolean }) {
  const example = site.kind === "example_analysis";
  return (
    <div className="space-y-2">
      <p className={explore ? "text-lg font-semibold" : "font-semibold"}>
        {site.name}
        {example ? ", practice spot" : ", place you entered"}
        , selected
      </p>
      {site.summary ? <p className="max-w-[65ch] text-stone-800">{site.summary}</p> : null}
      <dl className={`grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 ${measureClass}`}>
        <dt className="font-[family-name:var(--font-geist-sans)] text-stone-700">Latitude</dt>
        <dd>{formatLatitude(site.latitudeDeg)}</dd>
        <dt className="font-[family-name:var(--font-geist-sans)] text-stone-700">Longitude</dt>
        <dd>{formatLongitude(site.eastLongitudeDeg)}, positive east</dd>
        <dt className="font-[family-name:var(--font-geist-sans)] text-stone-700">Surface height</dt>
        <dd>{formatMetres(site.surfaceHeightM)}</dd>
      </dl>
    </div>
  );
}

function SiteMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" fill={PAPER} stroke={INK} strokeWidth="1.75" />
    </svg>
  );
}

function SelectedMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="2.25" y="2.25" width="17.5" height="17.5" fill={PAPER} stroke={INK} strokeWidth="2" />
      <circle cx="11" cy="11" r="3" fill={INK} />
    </svg>
  );
}

function BodySwatch({ color, shape }: { color: string; shape: "circle" | "diamond" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {shape === "circle" ? (
        <circle cx="7" cy="7" r="4.5" fill={color} />
      ) : (
        <path d="M7 1.4 12.6 7 7 12.6 1.4 7Z" fill={color} />
      )}
    </svg>
  );
}
