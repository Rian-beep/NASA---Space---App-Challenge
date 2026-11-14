# Run Lunar Window

Lunar Window reads a precomputed demonstration. It does not need an API key, and the browser does not call JPL Horizons.

## Requirements

- Node.js 20 or newer
- npm

The commands below are the same on macOS and Linux. Run them from the repository root.

## Install and start

```bash
node --version
npm install
npm run dev
```

Open http://localhost:3000

Run the test suite with:

```bash
npm test
```

## Offline demonstration

The app opens on a demonstration bundle held by the science module and produced from NASA data. The badge reads “Precomputed from NASA data”. It does not say Live.

Scrubbing the timeline changes the selected time and reads samples that analysis has already computed. It does not download a new ephemeris. Analysis and “Find alternatives” call the science module, which uses that cached demonstration. The server routes under `src/app/api/` call the same module, so a browser request does not go to JPL.

If the science module is missing the exports the workspace needs, the page reports “science module not ready” and does not invent a horizon.

## Terrain preparation

Global terrain is out of scope for this release. When the Python dependencies for the science tools are installed, rebuild the local terrain product from the repository root:

```bash
python3 science/scripts/prepare_terrain.py
```

If those dependencies are not installed, skip the script and use the committed demonstration data.
