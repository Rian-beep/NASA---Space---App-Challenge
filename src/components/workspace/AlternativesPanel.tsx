"use client";

import type { AlternativeSearch, LunarSite } from "@/lib/science/types";
import { formatUtc } from "./format";
import { CheckIcon, WarningIcon } from "./icons";

export function AlternativesPanel({
  search,
  loading,
  error,
  showReasons,
  replaceName,
  onToggleReasons,
  onFind,
  onApply,
  disabled,
}: {
  search: AlternativeSearch | null;
  loading: boolean;
  error: string | null;
  showReasons: boolean;
  replaceName: string | null;
  onToggleReasons: () => void;
  onFind: () => void;
  onApply: (candidateId: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-stone-300 pt-4" aria-label="Alternatives">
      <h2 className="text-base font-semibold text-stone-950">Alternatives</h2>
      <p className="text-sm leading-6 text-stone-700">
        The search checks a bounded set of places and arrival times. It is not a global optimum.
      </p>
      <button type="button" className="lw-button-strong self-start" onClick={onFind} disabled={disabled || loading}>
        {loading ? "Searching the bounded set…" : "Find alternatives"}
      </button>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-stone-900">
          <WarningIcon />
          <span>{error}</span>
        </p>
      ) : null}
      {search ? <SearchResult search={search} showReasons={showReasons} replaceName={replaceName} onToggleReasons={onToggleReasons} onApply={onApply} /> : null}
    </section>
  );
}

function SearchResult({
  search,
  showReasons,
  replaceName,
  onToggleReasons,
  onApply,
}: {
  search: AlternativeSearch;
  showReasons: boolean;
  replaceName: string | null;
  onToggleReasons: () => void;
  onApply: (candidateId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-stone-900">{search.boundsDescription}</p>
      <p className="text-sm leading-6 text-stone-700">{search.candidateCount} options checked.</p>
      <p className="flex items-start gap-2 text-sm leading-6 text-stone-900">
        {search.anyMeetsLimits ? <CheckIcon /> : <WarningIcon />}
        <span>
          {search.anyMeetsLimits
            ? "At least one option meets the selected limits."
            : "No option in this search meets the selected limits."}
        </span>
      </p>
      {search.limitedSearch ? (
        <p className="text-sm leading-6 text-stone-700">
          This is a limited search, not a proof that no better place or time exists.
        </p>
      ) : null}
      <button type="button" className="lw-button self-start" onClick={onToggleReasons} aria-pressed={showReasons}>
        {showReasons ? "Hide ranking reasons" : "Show ranking reasons"}
      </button>
      {showReasons ? (
        <div className="text-sm leading-6 text-stone-800">
          <p className="font-medium text-stone-950">Order used</p>
          <ol className="mt-1 list-decimal pl-5">
            {search.ordering.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm leading-6 text-stone-700">
          The list follows the search order. Show ranking reasons to read why each option is where it is.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {search.results.map((candidate) => (
          <li key={candidate.id} className="border border-stone-300 p-3">
            <p className="text-sm font-medium text-stone-950">{candidateLabel(candidate.site, candidate.arrivalUtc)}</p>
            <p className="mt-1 flex items-start gap-2 text-sm leading-6 text-stone-900">
              {candidate.meetsAllLimits ? <CheckIcon /> : <WarningIcon />}
              <span>{candidate.meetsAllLimits ? "Meets the selected limits." : "Does not meet the selected limits."}</span>
            </p>
            {showReasons ? <p className="mt-2 text-sm leading-6 text-stone-900">{candidate.rankReason}</p> : null}
            {candidate.shortfall ? (
              <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-stone-900">
                <WarningIcon />
                <span>{candidate.shortfall}</span>
              </p>
            ) : null}
            <button type="button" className="lw-button mt-3" onClick={() => onApply(candidate.id)}>
              {replaceName ? `Use this option (replaces ${replaceName})` : "Use this option"}
            </button>
          </li>
        ))}
      </ul>
      {search.results.length === 0 ? (
        <p className="text-sm leading-6 text-stone-700">The search returned no options.</p>
      ) : null}
    </div>
  );
}

function candidateLabel(site: LunarSite, arrivalUtc: string): string {
  return `${site.name} · ${formatUtc(arrivalUtc)}`;
}
