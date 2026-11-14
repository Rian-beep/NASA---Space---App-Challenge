"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AlternativeCandidate,
  AlternativeSearch,
  AudienceMode,
  DemoBundle,
  LunarSite,
  ScenarioInput,
  ScenarioResult,
  ScenarioSnapshot,
  TerrainHorizon,
} from "@/lib/science/types";
import { AlternativesPanel } from "./AlternativesPanel";
import { ComparisonPanel } from "./ComparisonPanel";
import { PRESENTATION_BADGE, SCIENCE_NOT_READY, SKY_ONLY_PRACTICE } from "./copy";
import { MoonStage } from "@/components/globe/MoonStage";
import type { GlobeMarker } from "@/components/globe/MoonGlobe";
import { MISSIONS, missionById, scenarioPatchForMission } from "@/lib/sites/missions";
import { ExportButtons } from "./ExportButtons";
import { addHours, newId, scenarioProblem, siteCoordinates, siteLabel, statusPhrase } from "./format";
import { ArchiveIcon, WarningIcon } from "./icons";
import { Inputs } from "./Inputs";
import { MethodologyDrawer } from "./MethodologyDrawer";
import { ModeSwitch } from "./ModeSwitch";
import {
  activeWindow,
  alternativesWithScience,
  analyzeWithScience,
  horizonForScenario,
  loadSession,
  resetScienceCache,
} from "./scienceAdapter";
import {
  cloneScenario,
  demoDelayedScenario,
  pickBaseline,
  shiftLanding,
  snapshotAt,
} from "./scenario";
import { HorizonFrame, MapFrame, ScrubberFrame, TimelineFrame } from "./VizFrame";
import { IceProspectivityCard } from "@/components/lfm";
import rawLfmContexts from "@/lib/lfm/fixtures/contexts.json";
import { parseLfmContexts } from "@/lib/lfm/parse";

const lfmContexts = parseLfmContexts(rawLfmContexts);

type Meta = {
  softwareVersion: string;
  disclaimer: string;
  maxScenarios: number;
};

function searchKey(scenario: ScenarioInput): string {
  return JSON.stringify({
    siteId: scenario.siteId,
    customSite: scenario.customSite ?? null,
    arrivalUtc: scenario.arrivalUtc,
    durationHours: scenario.durationHours,
    solarPanelHeightM: scenario.solarPanelHeightM,
    antennaHeightM: scenario.antennaHeightM,
    maxSolarInterruptionHours: scenario.maxSolarInterruptionHours,
    maxEarthInterruptionHours: scenario.maxEarthInterruptionHours,
  });
}

function exploreSentence(place: string, snapshot: ScenarioSnapshot | null, insufficient: boolean): string {
  if (insufficient || !snapshot || snapshot.sunVisible === null || snapshot.earthVisible === null) {
    return "Insufficient data";
  }
  const sun = snapshot.sunVisible
    ? "the Sun is above the nearby ground"
    : "the Sun is hidden by the nearby ground";
  const earth = snapshot.earthVisible ? "Earth is in view" : "Earth is hidden by the nearby ground";
  return `At this time at ${place}, ${sun}, and ${earth}.`;
}

export function Workspace() {
  const [mode, setMode] = useState<AudienceMode>("plan");
  const [bundle, setBundle] = useState<DemoBundle | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([]);
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [horizons, setHorizons] = useState<Record<string, TerrainHorizon | null>>({});
  const [activeScenarioId, setActiveScenarioId] = useState("");
  const [selectedTimeUtc, setSelectedTimeUtc] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [exploreOrigin, setExploreOrigin] = useState<{ id: string; arrivalUtc: string } | null>(null);
  const [exploreDelayHours, setExploreDelayHours] = useState(0);
  const [planDelayHours, setPlanDelayHours] = useState(6);
  const [alternatives, setAlternatives] = useState<AlternativeSearch | null>(null);
  const [alternativesKey, setAlternativesKey] = useState<string | null>(null);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [methodOpen, setMethodOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const session = await loadSession();
        if (cancelled) return;
        const baseline = pickBaseline(session.bundle);
        if (!baseline) throw new Error("The demonstration has no baseline case.");
        const scenario = cloneScenario(baseline, { isBaseline: true });
        const delayed = demoDelayedScenario(session.bundle);
        if (delayed) {
          const gap = (Date.parse(delayed.arrivalUtc) - Date.parse(scenario.arrivalUtc)) / 3_600_000;
          if (Number.isFinite(gap) && gap > 0) setPlanDelayHours(Math.round(gap * 10) / 10);
        }
        setBundle(session.bundle);
        setMeta({
          softwareVersion: session.softwareVersion,
          disclaimer: session.disclaimer,
          maxScenarios: session.maxScenarios,
        });
        setScenarios([scenario]);
        setActiveScenarioId(scenario.id);
        setSelectedTimeUtc(scenario.arrivalUtc);
        setExploreOrigin({ id: scenario.id, arrivalUtc: scenario.arrivalUtc });
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : SCIENCE_NOT_READY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadToken]);

  const scenarioKey = JSON.stringify(scenarios);

  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setAnalyzing(true);
        try {
          const savedSky = (scenario: ScenarioInput) =>
            bundle.sites.some((site) => site.id === scenario.siteId) && !scenarioProblem(scenario);
          const baseline = scenarios.find((scenario) => scenario.isBaseline) ?? scenarios[0];
          const next: Record<string, ScenarioResult> = {};
          const nextHorizons: Record<string, TerrainHorizon | null> = {};
          let baselineResult: ScenarioResult | null = null;
          if (baseline && savedSky(baseline)) {
            baselineResult = await analyzeWithScience(baseline, { bundle });
            next[baseline.id] = baselineResult;
            nextHorizons[baseline.id] = await horizonForScenario(baseline, bundle);
          }
          for (const scenario of scenarios) {
            if (!baseline || scenario.id === baseline.id) continue;
            if (!savedSky(scenario)) continue;
            next[scenario.id] = await analyzeWithScience(scenario, {
              bundle,
              baselineResult,
              baselineScenario: baseline && savedSky(baseline) ? baseline : undefined,
            });
            nextHorizons[scenario.id] = await horizonForScenario(scenario, bundle);
          }
          if (cancelled) return;
          setResults(next);
          setHorizons(nextHorizons);
          setAnalysisError(null);
        } catch (error) {
          if (!cancelled) {
            setAnalysisError(error instanceof Error ? error.message : "The case could not be analysed.");
          }
        } finally {
          if (!cancelled) setAnalyzing(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bundle, scenarioKey, scenarios]);

  useEffect(() => {
    const current = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0];
    if (!current) return;
    const bounds = activeWindow(current);
    if (!bounds) return;
    const time = Date.parse(selectedTimeUtc);
    const start = Date.parse(bounds.startUtc);
    const end = Date.parse(bounds.endUtc);
    if (Number.isNaN(time) || time < start || time > end) {
      setSelectedTimeUtc(current.arrivalUtc);
    }
  }, [scenarios, selectedTimeUtc, activeScenarioId]);

  const active = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0];

  useEffect(() => {
    if (!active) return;
    if (exploreOrigin?.id === active.id) return;
    setExploreOrigin({ id: active.id, arrivalUtc: active.arrivalUtc });
    setExploreDelayHours(0);
  }, [active, exploreOrigin]);
  const activeResult = active ? results[active.id] : undefined;
  const snapshot = useMemo(
    () => (activeResult ? snapshotAt(activeResult, selectedTimeUtc) : null),
    [activeResult, selectedTimeUtc],
  );
  const bounds = active ? activeWindow(active) : null;
  const sites = bundle?.sites ?? [];
  const delayed = bundle ? demoDelayedScenario(bundle) : null;
  const coordinates = active ? siteCoordinates(active, sites) : null;
  const problem = active ? scenarioProblem(active) : null;
  const maxScenarios = meta?.maxScenarios ?? 3;

  useEffect(() => {
    if (!active || !alternativesKey) return;
    if (searchKey(active) !== alternativesKey) setAlternatives(null);
  }, [active, alternativesKey]);

  function patchActive(patch: Partial<ScenarioInput>) {
    setScenarios((current) =>
      current.map((scenario) => {
        if (scenario.id !== activeScenarioId) return scenario;
        const next = cloneScenario(scenario, patch);
        return JSON.stringify(next) === JSON.stringify(scenario) ? scenario : next;
      }),
    );
  }

  function changeMode(next: AudienceMode) {
    setMode(next);
    if (next === "analyze") setMethodOpen(true);
  }

  function selectScenario(id: string) {
    setActiveScenarioId(id);
    const scenario = scenarios.find((item) => item.id === id);
    if (scenario && exploreOrigin?.id !== id) {
      setExploreOrigin({ id, arrivalUtc: scenario.arrivalUtc });
      setExploreDelayHours(0);
    }
  }

  function handleExploreArrival(arrivalUtc: string) {
    if (!active) return;
    setExploreOrigin({ id: active.id, arrivalUtc });
    setExploreDelayHours(0);
    patchActive({ arrivalUtc });
  }

  function handleExploreDelay(hours: number) {
    if (!exploreOrigin) return;
    setExploreDelayHours(hours);
    patchActive({ arrivalUtc: addHours(exploreOrigin.arrivalUtc, hours) });
  }

  function duplicate() {
    if (!active || scenarios.length >= maxScenarios) return;
    const copy = cloneScenario(active, {
      id: newId("case"),
      name: `Copy of ${active.name}`,
      isBaseline: false,
    });
    setScenarios((current) => [...current, copy]);
    setActiveScenarioId(copy.id);
  }

  function applyDelay() {
    if (scenarios.length >= maxScenarios) return;
    const source = scenarios.find((scenario) => scenario.isBaseline) ?? scenarios[0];
    if (!source) return;
    const copy = shiftLanding(source, planDelayHours, newId("delay"), `${source.name} + ${planDelayHours} h`);
    setScenarios((current) => [...current, copy]);
    setActiveScenarioId(copy.id);
  }

  function useDemoDelay() {
    if (!delayed || scenarios.length >= maxScenarios) return;
    if (scenarios.some((scenario) => scenario.id === delayed.id)) return;
    const copy = cloneScenario(delayed, { isBaseline: false });
    setScenarios((current) => [...current, copy]);
    setActiveScenarioId(copy.id);
  }

  function removeScenario(id: string) {
    const remaining = scenarios.filter((scenario) => scenario.id !== id);
    if (remaining.length === 0) return;
    setScenarios(remaining);
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (activeScenarioId === id) {
      const fallback = remaining.find((scenario) => scenario.isBaseline) ?? remaining[0];
      setActiveScenarioId(fallback.id);
    }
  }

  function restore() {
    if (!bundle) return;
    const baseline = pickBaseline(bundle);
    if (!baseline) return;
    const scenario = cloneScenario(baseline, { isBaseline: true });
    setScenarios([scenario]);
    setResults({});
    setActiveScenarioId(scenario.id);
    setSelectedTimeUtc(scenario.arrivalUtc);
    setExploreOrigin({ id: scenario.id, arrivalUtc: scenario.arrivalUtc });
    setExploreDelayHours(0);
    setAlternatives(null);
    setAlternativesKey(null);
  }

  function selectSite(siteId: string) {
    if (!sites.some((site) => site.id === siteId)) return;
    const place = sites.find((site) => site.id === siteId);
    patchActive({ siteId, name: place?.name ?? active?.name, customSite: undefined });
  }

  function selectPlace(id: string) {
    if (sites.some((site) => site.id === id)) {
      selectSite(id);
      return;
    }
    const mission = missionById(id);
    if (!mission) return;
    patchActive(scenarioPatchForMission(mission));
  }

  function pickCoordinates(latitudeDeg: number, eastLongitudeDeg: number) {
    patchActive({
      siteId: "custom",
      name: "Place on the Moon",
      customSite: {
        name: "Place on the Moon",
        latitudeDeg,
        eastLongitudeDeg,
        surfaceHeightM: 0,
      },
    });
  }

  async function findAlternatives() {
    if (!bundle || !active || scenarioProblem(active)) return;
    setAlternativesLoading(true);
    setAlternativesError(null);
    try {
      const search = await alternativesWithScience(active, { bundle });
      setAlternatives(search);
      setAlternativesKey(searchKey(active));
    } catch (error) {
      setAlternativesError(error instanceof Error ? error.message : SCIENCE_NOT_READY);
    } finally {
      setAlternativesLoading(false);
    }
  }

  function applyAlternative(candidateId: string) {
    if (!active || !alternatives) return;
    const candidate = alternatives.results.find((item) => item.id === candidateId);
    if (!candidate) return;
    const draft = scenarioFromCandidate(candidate, active, sites);
    const atCapacity = scenarios.length >= maxScenarios;
    const replaceId = replacementId(scenarios, active, maxScenarios);
    const taken = scenarios.some((item) => item.id === draft.id);
    const nextId = atCapacity ? (replaceId ?? draft.id) : taken ? newId("alt") : draft.id;
    const scenario = { ...draft, id: nextId };
    setScenarios((current) =>
      atCapacity ? current.map((item) => (item.id === nextId ? scenario : item)) : [...current, scenario],
    );
    setResults((current) => ({
      ...current,
      [scenario.id]: { ...candidate.result, scenarioId: scenario.id },
    }));
    setActiveScenarioId(scenario.id);
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">Lunar Window</h1>
        <p className="mt-3 text-sm leading-6 text-stone-700">Reading the precomputed demonstration…</p>
      </main>
    );
  }

  if (loadError || !bundle || !meta || !active) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">Lunar Window</h1>
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>{loadError ?? SCIENCE_NOT_READY}</span>
        </p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-700">
          The workspace will open the demonstration once the science module exports its analysis functions. The browser does not call JPL.
        </p>
        <button
          type="button"
          className="lw-button mt-4"
          onClick={() => {
            resetScienceCache();
            setLoadToken((value) => value + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  const place = siteLabel(active, sites);
  const sentence = problem
    ? problem
    : !activeResult
      ? "Reading this place…"
      : exploreSentence(place, snapshot, activeResult.status === "insufficient_data");
  const mapSites = coordinates && active.siteId === "custom"
    ? [
        ...sites,
        {
          id: "custom",
          name: active.customSite?.name?.trim() || "Custom location",
          kind: "custom" as const,
          eastLongitudeDeg: coordinates.eastLongitudeDeg,
          latitudeDeg: coordinates.latitudeDeg,
          surfaceHeightM: coordinates.surfaceHeightM,
          summary: "Coordinates entered for this case. Not an official landing site.",
        },
      ]
    : sites;
  const replaceName =
    scenarios.length >= maxScenarios
      ? !active.isBaseline
        ? active.name
        : scenarios.find((scenario) => !scenario.isBaseline)?.name ?? null
      : null;
  const shownAlternatives =
    alternatives && alternativesKey && searchKey(active) === alternativesKey ? alternatives : null;
  const skyReady = sites.some((site) => site.id === active.siteId);
  const globeMarkers: GlobeMarker[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    latitudeDeg: site.latitudeDeg,
    eastLongitudeDeg: site.eastLongitudeDeg,
    tone: "practice" as const,
  }));
  for (const mission of MISSIONS) {
    globeMarkers.push({
      id: mission.id,
      name: mission.name,
      latitudeDeg: mission.latitudeDeg,
      eastLongitudeDeg: mission.eastLongitudeDeg,
      tone: mission.outcome === "impact" ? "impact" : "landing",
    });
  }
  if (active.siteId === "custom" && coordinates) {
    globeMarkers.push({
      id: "custom",
      name: active.customSite?.name?.trim() || "Place on the Moon",
      latitudeDeg: coordinates.latitudeDeg,
      eastLongitudeDeg: coordinates.eastLongitudeDeg,
      tone: "picked",
    });
  }
  const practiceIds = new Set(sites.map((site) => site.id));

  const map = (
    <MapFrame
      sites={mapSites}
      selectedSiteId={active.siteId}
      onSelectSite={selectSite}
      coverageLabel={activeResult ? statusPhrase(activeResult.status) : "Precomputed from NASA data"}
      mode={mode}
    />
  );

  const horizon = (
    <div className="flex flex-col gap-2">
      <HorizonFrame
        horizon={horizons[active.id] ?? null}
        sunAzimuthDeg={snapshot?.sunAzimuthDeg ?? null}
        sunElevationDeg={snapshot?.sunElevationDeg ?? null}
        earthAzimuthDeg={snapshot?.earthAzimuthDeg ?? null}
        earthElevationDeg={snapshot?.earthElevationDeg ?? null}
        mode={mode}
      />
      {active.solarPanelHeightM !== active.antennaHeightM ? (
        <p className="text-sm leading-6 text-stone-700">
          The horizon line uses the solar-panel height. Earth visibility in the comparison uses the antenna height.
        </p>
      ) : null}
    </div>
  );

  const timeControl = bounds ? (
    <div className="flex flex-col gap-3">
      <TimelineFrame
        startUtc={bounds.startUtc}
        endUtc={bounds.endUtc}
        selectedUtc={selectedTimeUtc}
        sun={activeResult?.sun ?? null}
        earth={activeResult?.earth ?? null}
        overlapHours={activeResult?.overlapHours ?? null}
        onSelectTime={setSelectedTimeUtc}
        mode={mode}
      />
      <ScrubberFrame
        startUtc={bounds.startUtc}
        endUtc={bounds.endUtc}
        valueUtc={selectedTimeUtc}
        onChange={setSelectedTimeUtc}
      />
      <p className="text-sm leading-6 text-stone-700">
        The marker reads the nearest computed sample. It does not recompute the sky.
      </p>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[#07080d] lg:grid lg:h-screen lg:grid-cols-[minmax(0,1fr)_26rem]">
      <a href="#workspace-body" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:bg-white focus:px-3 focus:py-2">
        Skip to the workspace
      </a>
      <MoonStage
        markers={globeMarkers}
        selectedId={active.siteId}
        practiceIds={practiceIds}
        onSelect={selectPlace}
        onPickCoordinates={pickCoordinates}
      />
      <aside id="workspace-body" className="bg-stone-100 text-stone-950 lg:h-screen lg:overflow-y-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 px-4 py-4">
        <div className="max-w-xl">
          <p className="text-lg font-semibold tracking-tight text-stone-950">Sunlight and a view of Earth</p>
          <p className="mt-1 text-sm leading-6 text-stone-700">
            The check below uses saved sky and ground data. It is not a flight check, and not an approval to land.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <ModeSwitch mode={mode} onChange={changeMode} />
          <p className="inline-flex items-center gap-2 text-sm font-medium text-stone-800">
            <ArchiveIcon />
            {PRESENTATION_BADGE}
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-4 px-4 py-4">

      {analysisError ? (
        <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>{analysisError}</span>
        </p>
      ) : null}
      {analyzing ? <p className="text-sm text-stone-700">Updating the case…</p> : null}
      {problem ? (
        <p role="status" className="flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>{problem}</span>
        </p>
      ) : null}

      {skyReady ? (
        <section className="flex flex-col gap-4" aria-label="Sky and ground">
          {horizon}
          {timeControl}
          {map}
          {mode === "explore" ? (
            <p className="text-xl font-medium leading-snug text-stone-950" aria-live="polite">
              {sentence}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm leading-6 text-stone-800">{SKY_ONLY_PRACTICE}</p>
      )}
      <Inputs
        mode={mode}
        sites={sites}
        scenarios={scenarios}
        active={active}
        results={results}
        maxScenarios={maxScenarios}
        exploreDelayHours={exploreDelayHours}
        planDelayHours={planDelayHours}
        demoDelay={delayed ? { name: delayed.name, arrivalUtc: delayed.arrivalUtc } : null}
        demoDelayAdded={delayed ? scenarios.some((scenario) => scenario.id === delayed.id) : false}
        onSelectScenario={selectScenario}
        onChangeActive={patchActive}
        onExploreArrival={handleExploreArrival}
        onExploreDelayHours={handleExploreDelay}
        onPlanDelayHours={setPlanDelayHours}
        onApplyDelay={applyDelay}
        onUseDemoDelay={useDemoDelay}
        onDuplicate={duplicate}
        onRemove={removeScenario}
        onRestore={restore}
      />
      {mode === "analyze" ? (
        <MethodologyDrawer
          open={methodOpen}
          provenance={activeResult?.provenance ?? null}
          onToggle={() => setMethodOpen((open) => !open)}
        />
      ) : null}
      {mode !== "explore" ? (
        <>
          <ComparisonPanel
            sites={sites}
            scenarios={scenarios}
            results={results}
            activeScenarioId={active.id}
            snapshot={snapshot}
            onSelectScenario={selectScenario}
          />
          <AlternativesPanel
            search={shownAlternatives}
            loading={alternativesLoading}
            error={alternativesError}
            showReasons={showReasons}
            replaceName={replaceName}
            disabled={Boolean(problem) || !skyReady}
            onToggleReasons={() => setShowReasons((value) => !value)}
            onFind={() => void findAlternatives()}
            onApply={applyAlternative}
          />
          <ExportButtons
            scenarios={scenarios}
            results={scenarios.flatMap((scenario) => (results[scenario.id] ? [results[scenario.id]] : []))}
            alternatives={shownAlternatives}
            mode={mode}
            softwareVersion={meta.softwareVersion}
            disclaimer={meta.disclaimer}
            sites={sites}
          />
        </>
      ) : null}
      <IceProspectivityCard context={lfmContexts[active.siteId] ?? null} mode={mode} />

      <footer className="mt-2 border-t border-stone-300 pt-4 text-sm leading-6 text-stone-700">
        <p>{meta.disclaimer}</p>
        <p className="mt-1">
          Version {meta.softwareVersion}. The ground line and the sky check cover the three practice spots. The Moon picture is global.
        </p>
        {activeResult ? (
          <p className="mt-1">
            <a className="underline decoration-stone-400 underline-offset-2" href={activeResult.provenance.horizonsDocUrl}>
              Horizons documentation
            </a>
            {" · "}
            <a className="underline decoration-stone-400 underline-offset-2" href={activeResult.provenance.terrainProductUrl}>
              Terrain product
            </a>
          </p>
        ) : null}
      </footer>
      </div>
      </aside>
    </main>
  );
}

function scenarioFromCandidate(
  candidate: AlternativeCandidate,
  source: ScenarioInput,
  sites: LunarSite[],
): ScenarioInput {
  const catalog = sites.some((site) => site.id === candidate.site.id);
  return {
    id: candidate.id,
    name: `${candidate.site.name} · ${candidate.arrivalUtc.replace(".000Z", "Z")}`,
    siteId: catalog ? candidate.site.id : "custom",
    customSite: catalog
      ? undefined
      : {
          name: candidate.site.name,
          eastLongitudeDeg: candidate.site.eastLongitudeDeg,
          latitudeDeg: candidate.site.latitudeDeg,
          surfaceHeightM: candidate.site.surfaceHeightM,
        },
    arrivalUtc: candidate.arrivalUtc,
    durationHours: source.durationHours,
    solarPanelHeightM: source.solarPanelHeightM,
    antennaHeightM: source.antennaHeightM,
    maxSolarInterruptionHours: source.maxSolarInterruptionHours,
    maxEarthInterruptionHours: source.maxEarthInterruptionHours,
    isBaseline: false,
  };
}

function replacementId(scenarios: ScenarioInput[], active: ScenarioInput, maxScenarios: number): string | null {
  if (scenarios.length < maxScenarios) return null;
  if (!active.isBaseline) return active.id;
  return scenarios.find((scenario) => !scenario.isBaseline)?.id ?? active.id;
}
