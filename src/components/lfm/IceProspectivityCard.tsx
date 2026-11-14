"use client";

import type { LfmSiteContext } from "@/lib/lfm/types";

type AudienceMode = "explore" | "plan" | "analyze";

function formatGuess(value: number): string {
  return value.toFixed(2);
}

function likelihood(value: number): string {
  if (value >= 0.8) return "more likely to last";
  if (value <= 0.2) return "less likely to last";
  return "neither especially likely nor unlikely";
}

function plainStatus(context: LfmSiteContext | null): string {
  if (context?.status === "outside_extent") {
    return "This place is too far from the pole for this model. It only looks within about 10 degrees of the south pole. This is a model, not a picture of ice.";
  }
  if (context?.status !== "ready" || context.value === null) {
    return "We don’t have a model guess for this place. That is not the same as saying there is no ice. This is a model, not a picture of ice.";
  }
  return `A computer model guesses that ice is ${likelihood(context.value)} here (${formatGuess(context.value)} out of 1). This is a model, not a picture of ice.`;
}

function WarningLine() {
  return (
    <p className="m-0 flex gap-2 border border-stone-300 bg-stone-100 px-3 py-2 text-sm leading-5 text-stone-800">
      <span aria-hidden="true" className="font-semibold">
        △
      </span>
      <span>
        Not a measurement of ice. Not a reason to say a landing is approved.
      </span>
    </p>
  );
}

export function IceProspectivityCard({
  context,
  mode,
}: {
  context: LfmSiteContext | null;
  mode: AudienceMode;
}) {
  const ready = context?.status === "ready" && context.value !== null;

  return (
    <section
      aria-label="Ice guess from a computer model"
      className="max-w-xl border border-stone-300 bg-stone-50 text-stone-800"
    >
      <header className="border-b border-stone-200 px-4 py-3">
        <p className="m-0 text-xs uppercase tracking-wide text-stone-500">
          Extra surface note
        </p>
        <h2 className="m-0 mt-1 text-base font-semibold text-stone-900">
          Where ice might last
        </h2>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {mode === "explore" ? (
          <p className="m-0 text-sm leading-6">{plainStatus(context)}</p>
        ) : null}

        {mode !== "explore" && ready ? (
          <p className="m-0 font-mono text-2xl tracking-tight text-stone-900">
            {formatGuess(context.value as number)}
            <span className="ml-2 font-sans text-base font-normal text-stone-600">out of 1</span>
          </p>
        ) : null}

        {mode !== "explore" ? (
          <p className="m-0 text-sm leading-6">{plainStatus(context)}</p>
        ) : null}

        {mode !== "explore" ? <WarningLine /> : null}

        {mode === "analyze" && context ? (
          <div className="flex flex-col gap-3 border-t border-stone-200 pt-3 text-sm leading-6">
            <p className="m-0">
              The model looked at hill shape, slope, cold dark places, and temperature. Each square is about{" "}
              {context.resolutionM} metres across.
            </p>
            <p className="m-0">
              The number copies an expert map of where ice might last. In tests it was about 0.03 off that map. It was not checked against real ice samples.
            </p>
            {ready && context.patchMean !== null ? (
              <p className="m-0">
                The wider patch around this place averages {formatGuess(context.patchMean)}. The number above is only the small area next to the spot.
              </p>
            ) : null}
            <p className="m-0">This does not change the sunlight or Earth-view results.</p>
            <p className="m-0 text-stone-600">{context.statement}</p>
            <ul className="m-0 list-none p-0">
              {context.sourceUrls.map((url) => (
                <li key={url} className="truncate">
                  <a
                    className="text-stone-700 underline decoration-stone-400 underline-offset-2"
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
