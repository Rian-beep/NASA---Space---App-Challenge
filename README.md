# Lunar Window

Lunar Window helps you ask a simple question: if the landing day changes, can we still see the Sun and Earth from this spot on the Moon?

You pick a practice spot near the south pole, an arrival time, and how long a gap in sunlight or in the view of Earth you will accept. The app uses saved NASA position tables and a real terrain grid. It tells you whether those limits are met, what changes if you wait, and which nearby option looks better. A separate note shows a computer model’s guess about where ice might last. That guess is not a measurement of ice, and it does not change the sunlight or Earth-view result. This is a learning and planning tool. It does not approve a landing.

## Run

The same commands work on macOS and Linux. You need Node.js 20 or newer. No API key is required.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
```

Setup, the offline demonstration, and how to rebuild the local terrain product are in [docs/RUN.md](docs/RUN.md).

## Demonstration data

The page opens on a demonstration bundle from `getDemoBundle()` in the science module. That bundle is precomputed from NASA data, so the first screen does not call Horizons. The badge reads “Precomputed from NASA data”. Moving the time control reads samples that are already computed.

## Scope

Global terrain is out of scope for this release. The screen covers the demonstration area shipped with the bundle. A place outside that terrain is reported as Insufficient data.

## Method

- [docs/METHODOLOGY.md](docs/METHODOLOGY.md)
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [docs/RUN.md](docs/RUN.md)
- [docs/LFM.md](docs/LFM.md)
- [docs/PLAIN_LANGUAGE.md](docs/PLAIN_LANGUAGE.md)
