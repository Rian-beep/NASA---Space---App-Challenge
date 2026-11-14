#!/usr/bin/env python3
"""Fetch observer ephemerides from JPL Horizons, one request at a time.

Sun is command 10. Earth is command 399. The site altitude is the terrain
height in kilometres, not the equipment height. Raw bodies are written to
data/raw/horizons/ together with the request parameters and retrieval time.
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = "LunarWindow/0.1.0 (NASA Space Apps Challenge; educational planning tool)"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
R_M = 1_737_400.0

# Native LDEM_80S_80MPP_ADJ pixel centres used for the example sites.
SITES = {
    "example-a": (-2600.0, -5400.0, 1703.407),
    "example-b": (7400.0, 4600.0, 1231.216),
    "example-c": (5400.0, -3400.0, -2317.702),
}
TARGETS = (("sun", "10"), ("earth", "399"))
START = "2026-11-01 00:00"
STOP = "2027-02-01 00:00"


def geodetic(x: float, y: float) -> tuple[float, float]:
    rho = math.hypot(x, y)
    lon = math.degrees(math.atan2(x, y))
    lat = math.degrees(2.0 * math.atan(rho / (2.0 * R_M))) - 90.0
    return lon, lat


def main() -> None:
    out_dir = Path(__file__).resolve().parents[2] / "data" / "raw" / "horizons"
    out_dir.mkdir(parents=True, exist_ok=True)
    for site_id, (x, y, height_m) in SITES.items():
        lon, lat = geodetic(x, y)
        site_coord = f"{lon:.6f},{lat:.6f},{height_m / 1000.0:.6f}"
        for target, command in TARGETS:
            params = {
                "format": "json",
                "COMMAND": command,
                "MAKE_EPHEM": "YES",
                "EPHEM_TYPE": "OBSERVER",
                "OBJ_DATA": "NO",
                "CENTER": "coord@301",
                "COORD_TYPE": "GEODETIC",
                "SITE_COORD": site_coord,
                "START_TIME": START,
                "STOP_TIME": STOP,
                "STEP_SIZE": "1 h",
                "TIME_TYPE": "UT",
                "QUANTITIES": "4",
                "APPARENT": "AIRLESS",
                "CSV_FORMAT": "YES",
            }
            retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            url = API + "?" + urllib.parse.urlencode(params)
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=180) as response:
                body = response.read()
                status = response.status
            (out_dir / f"{site_id}_{target}.json").write_bytes(body)
            payload = json.loads(body)
            result = payload.get("result") or ""
            rows = 0
            if "$$SOE" in result and "$$EOE" in result:
                table = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
                rows = sum(1 for line in table.splitlines() if line.strip())
            meta = {
                "retrievedAtUtc": retrieved,
                "httpStatus": status,
                "bytes": len(body),
                "requestUrl": url,
                "request": params,
                "apiVersion": (payload.get("signature") or {}).get("version"),
                "error": payload.get("error"),
                "sampleRows": rows,
                "site": {
                    "id": site_id,
                    "eastLongitudeDeg": lon,
                    "latitudeDeg": lat,
                    "surfaceHeightM": height_m,
                    "siteCoord": site_coord,
                },
            }
            (out_dir / f"{site_id}_{target}.meta.json").write_text(json.dumps(meta, indent=2))
            if payload.get("error") or rows < 100:
                raise SystemExit(f"Bad Horizons response for {site_id} {target}")
            print(f"{site_id} {target}: {rows} rows, {len(body)} bytes")
            time.sleep(1.5)


if __name__ == "__main__":
    main()
