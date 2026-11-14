#!/usr/bin/env python3
"""Windowed read of NASA PGDA product 90 for the Lunar Window analysis grid.

Product page: https://pgda.gsfc.nasa.gov/products/90
File: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF

Method: rasterio opens the cloud-optimized GeoTIFF through GDAL /vsicurl/
and reads one aligned window. The multi-hundred-megabyte source is not
downloaded in full and is not copied into the app. The analysis grid keeps
the native 80 m posting. A separate hillshade PNG is a 2x2 block mean of
that window and is not the analysis grid.

Axis directions were checked against the file CRS (south-polar stereographic,
MOON_ME sphere radius 1737400 m, central meridian 0):
  +X toward east longitude 90 degrees
  +Y toward east longitude 0 degrees
Pixel registration is RasterPixelIsArea; JSON originX/originY are pixel centres.
"""

from __future__ import annotations

import json
import math
import os
import struct
import zlib
from datetime import datetime, timezone

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", "TIF")
os.environ.setdefault(
    "GDAL_HTTP_USERAGENT",
    "LunarWindow/0.1.0 (NASA Space Apps Challenge; educational planning tool)",
)

import numpy as np
import rasterio
from rasterio.windows import Window

PRODUCT_PAGE = "https://pgda.gsfc.nasa.gov/products/90"
FILE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"
RASTER = f"/vsicurl/{FILE_URL}"
BODY_RADIUS_M = 1_737_400.0
SEARCH_RADIUS_M = 12_000.0
MARGIN_M = SEARCH_RADIUS_M + 240.0
DATASET_ID = "PGDA-90-LDEM_80S_80MPP_ADJ-south-pole-window"

# Native pixel centres confirmed with rasterio DatasetReader.xy.
SITES = [
    {
        "id": "example-a",
        "name": "Example analysis A — Shackleton rim crest",
        "xy": (-2600.0, -5400.0),
        "summary": (
            "Example analysis location on a local high of the Shackleton rim, "
            "about 6 km from the south pole. It is NOT an officially designated landing site."
        ),
    },
    {
        "id": "example-b",
        "name": "Example analysis B — near-side ridge",
        "xy": (7400.0, 4600.0),
        "summary": (
            "Example analysis location on a ridge near east longitude 58°, on the "
            "Earth-facing side of the south pole. It is NOT an officially designated landing site."
        ),
    },
    {
        "id": "example-c",
        "name": "Example analysis C — Shackleton floor",
        "xy": (5400.0, -3400.0),
        "summary": (
            "Example analysis location on the floor of Shackleton crater, surrounded by "
            "the rim. It is NOT an officially designated landing site."
        ),
    },
]


def geodetic_from_xy(x: float, y: float) -> tuple[float, float]:
    rho = math.hypot(x, y)
    lon = math.degrees(math.atan2(x, y))
    lat = math.degrees(2.0 * math.atan(rho / (2.0 * BODY_RADIUS_M))) - 90.0
    return lon, lat


def write_png(path: str, image: np.ndarray) -> None:
    height, width = image.shape
    if image.dtype != np.uint8:
        raise SystemExit("PNG writer expects uint8")

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + image[row].tobytes() for row in range(height))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def hillshade(height_m: np.ndarray, pixel_m: float) -> np.ndarray:
    z = height_m.astype(np.float64)
    z = np.where(np.isfinite(z), z, np.nanmean(z))
    dx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2.0 * pixel_m)
    dy = (np.roll(z, 1, axis=0) - np.roll(z, -1, axis=0)) / (2.0 * pixel_m)
    dx[:, 0] = dx[:, 1]
    dx[:, -1] = dx[:, -2]
    dy[0, :] = dy[1, :]
    dy[-1, :] = dy[-2, :]
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    zenith = math.radians(45.0)
    azimuth = math.radians(315.0)
    shade = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(azimuth - aspect)
    shade = np.clip(shade, 0.0, 1.0)
    return (30 + shade * 210).astype(np.uint8)


def main() -> None:
    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with rasterio.open(RASTER) as ds:
        if ds.crs is None or "Polar_Stereographic" not in ds.crs.to_wkt():
            raise SystemExit(f"Unexpected CRS: {ds.crs}")
        pixel = float(ds.res[0])
        if abs(pixel - 80.0) > 1e-6 or abs(float(ds.res[1]) - 80.0) > 1e-6:
            raise SystemExit(f"Unexpected pixel size {ds.res}")
        cols = []
        rows = []
        for site in SITES:
            row, col = ds.index(site["xy"][0], site["xy"][1])
            centre_x, centre_y = ds.xy(row, col, offset="center")
            if abs(centre_x - site["xy"][0]) > 1.0 or abs(centre_y - site["xy"][1]) > 1.0:
                raise SystemExit(f"Pixel centre moved for {site['id']}: {centre_x}, {centre_y}")
            radius_px = int(math.ceil(MARGIN_M / pixel))
            cols.extend((col - radius_px, col + radius_px))
            rows.extend((row - radius_px, row + radius_px))
            site["row"] = int(row)
            site["col"] = int(col)
        row0 = min(rows)
        row1 = max(rows)
        col0 = min(cols)
        col1 = max(cols)
        window = Window.from_slices((row0, row1 + 1), (col0, col1 + 1))
        array = ds.read(1, window=window)
        transform = ds.window_transform(window)
        origin_x, origin_y = rasterio.transform.xy(transform, 0, 0, offset="center")
        nodata = ds.nodata
        width = ds.width
        height = ds.height
        crs_wkt = ds.crs.to_wkt()

    rows_n, cols_n = array.shape
    finite = np.isfinite(array)
    if not finite.all():
        missing = int((~finite).sum())
        raise SystemExit(f"Analysis window contains {missing} nodata pixels; refusing to treat them as flat.")
    heights = np.round(array.astype(np.float64), 2)

    sites_out = []
    for site in SITES:
        local_row = site["row"] - row0
        local_col = site["col"] - col0
        surface = float(heights[local_row, local_col])
        lon, lat = geodetic_from_xy(site["xy"][0], site["xy"][1])
        # Distance from this site to the nearest grid edge, in posting steps.
        edge_px = min(local_row, local_col, rows_n - 1 - local_row, cols_n - 1 - local_col)
        edge_m = edge_px * pixel
        if edge_m < SEARCH_RADIUS_M:
            raise SystemExit(f"{site['id']} is only {edge_m:.0f} m from the grid edge.")
        sites_out.append(
            {
                "id": site["id"],
                "name": site["name"],
                "kind": "example_analysis",
                "eastLongitudeDeg": lon,
                "latitudeDeg": lat,
                "surfaceHeightM": surface,
                "summary": site["summary"],
                "stereographicX": site["xy"][0],
                "stereographicY": site["xy"][1],
            }
        )

    dataset = {
        "datasetId": DATASET_ID,
        "productUrl": PRODUCT_PAGE,
        "citation": (
            "Barker, M. K., et al. (2023), A New View of the Lunar South Pole from the "
            "Lunar Orbiter Laser Altimeter, The Planetary Science Journal, "
            "https://doi.org/10.3847/PSJ/acf3e1. "
            "LOLA DEM LDEM_80S_80MPP_ADJ, NASA GSFC PGDA product 90, "
            "https://pgda.gsfc.nasa.gov/products/90."
        ),
        "coordinateReference": (
            "MOON_ME / DE421 sphere, radius 1737400 m, south-polar stereographic metres. "
            "+X toward east longitude 90°, +Y toward east longitude 0°. "
            "Row 0 is the maximum-Y side. originX and originY are the centre of pixel (0,0)."
        ),
        "bodyRadiusM": BODY_RADIUS_M,
        "sourcePixelSpacingM": 80.0,
        "analysisResolutionM": 80.0,
        "rows": int(rows_n),
        "cols": int(cols_n),
        "originX": float(origin_x),
        "originY": float(origin_y),
        "pixelSizeM": 80.0,
        "heights": heights.reshape(-1).tolist(),
        "retrievedAtUtc": retrieved,
        "horizonSearchRadiusM": SEARCH_RADIUS_M,
        "preparationNote": (
            "Windowed read with rasterio and GDAL /vsicurl/ from the cloud-optimized "
            "GeoTIFF. Analysis heights are the native 80 m postings, rounded to 0.01 m, "
            "with no spatial resampling. The display hillshade is a separate 2x2 block mean "
            "and is not this grid. Horizon search radius is 12000 m; the window keeps that "
            "radius inside the grid for every example site."
        ),
        "sourceFileUrl": FILE_URL,
        "sourceSizePx": [width, height],
        "nodataPolicy": "Source nodata is NaN. This window has no nodata. Missing mask azimuths are never filled as flat.",
        "crsWkt": crs_wkt,
        "sites": sites_out,
    }

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    fixture_dir = os.path.join(root, "src", "lib", "science", "fixtures")
    public_dir = os.path.join(root, "public", "terrain")
    os.makedirs(fixture_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    terrain_path = os.path.join(fixture_dir, "terrain.json")
    # AnalysisDataset fields only, plus the optional radius and preparation note.
    analysis = {
        key: dataset[key]
        for key in [
            "datasetId",
            "productUrl",
            "citation",
            "coordinateReference",
            "bodyRadiusM",
            "sourcePixelSpacingM",
            "analysisResolutionM",
            "rows",
            "cols",
            "originX",
            "originY",
            "pixelSizeM",
            "heights",
            "retrievedAtUtc",
            "horizonSearchRadiusM",
            "preparationNote",
        ]
    }
    with open(terrain_path, "w", encoding="utf-8") as handle:
        json.dump(analysis, handle, separators=(",", ":"))
    with open(os.path.join(fixture_dir, "sites.json"), "w", encoding="utf-8") as handle:
        json.dump(sites_out, handle, indent=2)
    with open(os.path.join(fixture_dir, "terrain-preparation.json"), "w", encoding="utf-8") as handle:
        meta = {k: v for k, v in dataset.items() if k != "heights"}
        meta["method"] = (
            "rasterio 1.x windowed read of COG via /vsicurl/. "
            f"Source window rows {row0}:{row1} cols {col0}:{col1}."
        )
        meta["bytesHint"] = "heights omitted from this sidecar"
        json.dump(meta, handle, indent=2)

    factor = 2
    trimmed_rows = rows_n - (rows_n % factor)
    trimmed_cols = cols_n - (cols_n % factor)
    block = heights[:trimmed_rows, :trimmed_cols].reshape(
        trimmed_rows // factor, factor, trimmed_cols // factor, factor
    ).mean(axis=(1, 3))
    preview_pixel = pixel * factor
    image = hillshade(block, preview_pixel)
    png_path = os.path.join(public_dir, "south-pole-preview.png")
    write_png(png_path, image)

    # Bounds of the downsampled image: outer edges of the kept pixels.
    min_x = float(origin_x - pixel / 2.0)
    max_y = float(origin_y + pixel / 2.0)
    max_x = min_x + trimmed_cols * pixel
    min_y = max_y - trimmed_rows * pixel
    corners = []
    for x, y in ((min_x, max_y), (max_x, max_y), (max_x, min_y), (min_x, min_y)):
        lon, lat = geodetic_from_xy(x, y)
        corners.append({"x": x, "y": y, "eastLongitudeDeg": lon, "latitudeDeg": lat})
    preview_meta = {
        "attribution": (
            "NASA GSFC PGDA, LOLA LDEM_80S_80MPP_ADJ (product 90), "
            "Barker et al. 2023, The Planetary Science Journal, doi:10.3847/PSJ/acf3e1."
        ),
        "productUrl": PRODUCT_PAGE,
        "fileUrl": FILE_URL,
        "boundsStereographicM": {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y},
        "corners": corners,
        "sourcePixelSpacingM": 80,
        "previewResolutionM": preview_pixel,
        "analysisResolutionM": 80,
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "downsampling": (
            "Display image only. 2x2 block mean of the native 80 m analysis window "
            f"to {preview_pixel:.0f} m, then a standard hillshade (illumination azimuth 315°, "
            "zenith 45°). This PNG is not the analysis grid and must not be sampled for horizons."
        ),
        "coordinateReference": dataset["coordinateReference"],
        "retrievedAtUtc": retrieved,
        "nodata": "none in the source window",
    }
    with open(os.path.join(public_dir, "preview-meta.json"), "w", encoding="utf-8") as handle:
        json.dump(preview_meta, handle, indent=2)

    print(
        json.dumps(
            {
                "rows": rows_n,
                "cols": cols_n,
                "originX": origin_x,
                "originY": origin_y,
                "heightMin": float(heights.min()),
                "heightMax": float(heights.max()),
                "sites": sites_out,
                "terrainBytes": os.path.getsize(terrain_path),
                "pngBytes": os.path.getsize(png_path),
                "preview": [int(image.shape[1]), int(image.shape[0])],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
