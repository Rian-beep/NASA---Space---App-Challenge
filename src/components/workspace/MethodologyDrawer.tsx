"use client";

import type { Provenance } from "@/lib/science/types";
import { RESOLUTION_NOTE, UNCERTAINTY_NOTE } from "./copy";
import { formatMetres, formatUtc, presentationLabel } from "./format";

export function MethodologyDrawer({
  open,
  provenance,
  onToggle,
}: {
  open: boolean;
  provenance: Provenance | null;
  onToggle: () => void;
}) {
  return (
    <section className="border border-stone-300 bg-white" aria-label="Methodology">
      <h2 className="border-b border-stone-300 px-4 py-3 text-base font-semibold text-stone-950">
        <button
          type="button"
          className="w-full text-left"
          aria-expanded={open}
          aria-controls="methodology-body"
          onClick={onToggle}
        >
          {open ? "Hide methodology" : "Methodology, sampling, and limitations"}
        </button>
      </h2>
      {open ? (
        <div id="methodology-body" className="flex flex-col gap-6 px-4 py-4">
          {provenance ? <MethodologyBody provenance={provenance} /> : (
            <p className="text-sm leading-6 text-stone-700">Run a case to read its sampling, sources, and limitations.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function MethodologyBody({ provenance }: { provenance: Provenance }) {
  return (
    <>
      <section className="max-w-[70ch]">
        <h3 className="text-sm font-semibold text-stone-950">Model version</h3>
        <dl className="mt-2 grid gap-y-1 text-sm leading-6">
          <div className="grid grid-cols-[12rem_1fr] gap-3">
            <dt className="text-stone-700">Software</dt>
            <dd className="text-stone-950">{provenance.softwareVersion}</dd>
          </div>
          <div className="grid grid-cols-[12rem_1fr] gap-3">
            <dt className="text-stone-700">Visibility model</dt>
            <dd className="text-stone-950">{provenance.visibilityModel}</dd>
          </div>
          <div className="grid grid-cols-[12rem_1fr] gap-3">
            <dt className="text-stone-700">Eclipse model</dt>
            <dd className="text-stone-950">{provenance.eclipseModel}</dd>
          </div>
        </dl>
      </section>

      <section className="max-w-[70ch]">
        <h3 className="text-sm font-semibold text-stone-950">Numerical resolution</h3>
        <p className="mt-2 text-sm leading-6 text-stone-800">{RESOLUTION_NOTE}</p>
        <dl className="mt-2 grid gap-y-1 text-sm leading-6">
          <Measure term="Source pixel spacing" value={formatMetres(provenance.sourcePixelSpacingM)} />
          <Measure term="Analysis resolution" value={formatMetres(provenance.analysisResolutionM)} />
        </dl>
      </section>

      <section className="max-w-[70ch]">
        <h3 className="text-sm font-semibold text-stone-950">Sampling</h3>
        <dl className="mt-2 grid gap-y-1 text-sm leading-6">
          <Measure
            term="Time step"
            value={Number.isFinite(provenance.timeSampleHours) ? `${provenance.timeSampleHours} h` : "Not available"}
          />
          <Measure term="Horizon azimuth step" value={`${provenance.horizonAzimuthStepDeg}°`} />
          <Measure
            term="Analysis interval"
            value={`${formatUtc(provenance.analysisIntervalUtc.start)} to ${formatUtc(provenance.analysisIntervalUtc.end)}`}
          />
          <Measure term="Solar-panel height" value={formatMetres(provenance.equipment.solarPanelHeightM)} />
          <Measure term="Antenna height" value={formatMetres(provenance.equipment.antennaHeightM)} />
        </dl>
      </section>

      <section className="max-w-[70ch] border-t border-stone-300 pt-4">
        <h3 className="text-sm font-semibold text-stone-950">Physical uncertainty</h3>
        <p className="mt-2 text-sm leading-6 text-stone-800">{UNCERTAINTY_NOTE}</p>
        {provenance.limitations.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {provenance.limitations.map((item) => (
              <li key={item} className="text-sm leading-6 text-stone-900">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-6 text-stone-700">The result did not include limitation statements.</p>
        )}
      </section>

      <section className="max-w-[70ch]">
        <h3 className="text-sm font-semibold text-stone-950">Provenance</h3>
        <dl className="mt-2 grid gap-y-1 text-sm leading-6">
          <Measure term="Presentation" value={presentationLabel(provenance.presentation)} />
          <Measure term="Citation" value={provenance.citation} />
          <Measure term="Terrain product" value={provenance.terrainProductId} />
          <Measure term="Coordinates" value={provenance.coordinateReference} />
          <Measure term="Longitude" value={provenance.longitudeConvention} />
          <Measure
            term="Retrieved"
            value={provenance.retrievedAtUtc.length > 0 ? provenance.retrievedAtUtc.map((item) => formatUtc(item)).join(", ") : "Not available"}
          />
        </dl>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          <li>
            <a className="text-stone-900 underline decoration-stone-400 underline-offset-2" href={provenance.horizonsDocUrl}>
              Horizons documentation
            </a>
          </li>
          <li>
            <a className="text-stone-900 underline decoration-stone-400 underline-offset-2" href={provenance.terrainProductUrl}>
              Terrain product
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}

function Measure({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-3">
      <dt className="text-stone-700">{term}</dt>
      <dd className="text-stone-950">{value}</dd>
    </div>
  );
}
