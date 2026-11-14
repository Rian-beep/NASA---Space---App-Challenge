# Lunar Window methodology

Lunar Window screens a user-chosen week at a lunar site. It compares the centre of the Sun and the centre of Earth with a terrain horizon. It does not approve a landing, size a power system, or predict a communications link.

The interruption limits in the demonstration are **user assumptions**, not NASA or mission requirements.

## What is counted

A sample is **visible** only when the body centre is strictly above the terrain horizon at that azimuth. Clearance is elevation minus horizon elevation, in degrees. Clearance of zero is not access. A missing horizon or a missing ephemeris angle is **unknown**. Unknown is neither visible nor hidden, and it forces the access and interruption totals to null.

Hours are summed on the spans between hourly samples. When the two ends of an hour disagree, the crossing time is the zero of a straight line in clearance. The crossing can fall in the middle of the hour. Peaks shorter than the one-hour sample are not resolved.

**Access** is the total of visible spans. **Overlap** is the time when the Sun and Earth are both visible. Overlap percent is that time divided by the analysis window. The window runs from the first sample to the last, inclusive of both Horizons endpoints, so a 168-hour request has 169 samples and 168 hours of spans.

An **interruption** is a continuous hidden span. The reported duration is only the part inside the window. If the span includes the first or last instant of the window, `truncated` is true and the full real-world duration is not claimed. The longest interruption is the longest of those in-window spans. If any sample is unknown, the longest interruption is null.

The screen uses interruption tolerance only:

- **Exceeds selected limits** if a classified in-window interruption is already longer than the user limit. A truncated span can still exceed, because the unseen part outside the window would only make it longer.
- **Insufficient data** if a sample is unknown, or if a truncated interruption is still shorter than the limit and the full duration cannot be shown to fit.
- **Within selected limits** only when every evaluated interruption is fully inside the window (or has zero length) and is at or under the user limit.

Recharge, panel orientation, efficiency, temperature, load, and battery cycles are **not** modelled. The Earth result is **not** a link budget.

## Ephemeris

Positions come from the JPL Horizons API, one request at a time:

`https://ssd.jpl.nasa.gov/api/horizons.api`

| Parameter | Value |
| --- | --- |
| `format` | `json` |
| `COMMAND` | `10` for the Sun, `399` for Earth |
| `MAKE_EPHEM` | `YES` |
| `EPHEM_TYPE` | `OBSERVER` |
| `OBJ_DATA` | `NO` |
| `CENTER` | `coord@301` |
| `COORD_TYPE` | `GEODETIC` |
| `SITE_COORD` | east longitude in degrees, geodetic latitude in degrees, altitude in **kilometres** |
| `APPARENT` | `AIRLESS` |
| `QUANTITIES` | `4` (apparent azimuth and elevation) |
| `CSV_FORMAT` | `YES` |
| `STEP_SIZE` | `1 h` |
| `TIME_TYPE` | `UT` |

The altitude sent to Horizons is the terrain height above the 1737.4 km reference sphere, divided by 1000. It is not the solar-panel or antenna height. Equipment height is applied only in the horizon.

The table is the CSV block between `$$SOE` and `$$EOE`. An API `error` field, a missing table, or an `n.a.` angle throws. The parser does not fill gaps and does not synthesise a sinusoid. Azimuth is interpolated on the shortest arc across 0/360. Elevation is interpolated linearly. Times outside the table are not extrapolated.

The saved responses cover 2026-11-01 00:00 UT through 2027-02-01 00:00 UT at the three example pixels. Demo slices are contiguous subsets of those tables. Each slice keeps the original request parameters and retrieval time, plus `SLICE_START` and `SLICE_STOP`.

Documentation: https://ssd-api.jpl.nasa.gov/doc/horizons.html

## Horizon

The reference body is the MOON_ME / DE421 sphere, radius **1,737,400 m**, the same spheroid as the terrain file.

The observer stands on the site at radius `R + surface height + equipment height`. The Sun uses the solar-panel height. Earth uses the antenna height. A terrain point is at radius `R + z`.

Elevation above the local horizontal, in degrees, is

```
asin(clamp(dot(normalize(T − O), normalize(O)), −1, 1))
```

`O` and `T` are body-fixed vectors. Local up is the geodetic radial. Azimuth is clockwise from geodetic north: north 0, east 90, south 180, west 270. East and north come from the observer’s longitude and latitude. That basis stays defined as latitude approaches −90°, where every direction away from the pole is north along some meridian.

Rays are cast every **2°**. Along each ray the grid is sampled about every half pixel out to **12 km** of arc. The horizon elevation is the maximum terrain elevation on that ray. The recorded distance is the distance of that maximum.

If the ray leaves the grid before 12 km, or a nodata hole appears, the azimuth is `missing`. Missing terrain is never treated as a flat 0° horizon.

If the ray stays inside the grid for the full 12 km and every sample is nodata, and the observer is outside the reference sphere, the mask uses the geometric limb

```
−acos(R / (R + h_obs))
```

and only because 12 km covers that limb distance. An observer inside the sphere, such as a crater floor below the reference radius, has no exterior tangent, so the limb fallback is not used.

The geometric limb is not a substitute for distant mountains. Peaks beyond 12 km are outside this mask. That limit is stated on every result.

### Terrain grid and axis directions

The source is NASA GSFC PGDA product 90:

- Page: https://pgda.gsfc.nasa.gov/products/90
- File: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF
- LOLA digital elevation model, south of 80°S, 80 m posting, adjusted
- BigTIFF, float32, deflate, tiled 512×512, nodata NaN
- 7600×7600 pixels, upper-left corner (−304000 m, 304000 m), pixel scale 80 m
- `GTRasterTypeGeoKey` = RasterPixelIsArea (tiepoint is a pixel corner; stored origins below are pixel centres)
- CRS: Moon (2015) sphere / ocentric / south polar stereographic, radius 1737400 m
- `latitude_of_origin = −90`, `central_meridian = 0`, scale factor 1, false easting and northing 0

Axis directions were checked by transforming longitudes through that CRS. **+X points toward east longitude 90°. +Y points toward east longitude 0°.** +X does not point toward longitude 0.

```
ρ = 2 R tan(θ / 2)
x = ρ sin(λ)
y = ρ cos(λ)
```

`θ` is the angular distance from the south pole and `λ` is east longitude.

The analysis window is a 432×432 block of the native 80 m postings (34.56 km on a side), read with rasterio through GDAL `/vsicurl/`. Heights are rounded to 0.01 m. There is no spatial resampling and no nodata in the window. `originX` and `originY` are the centre of pixel (0, 0), and row 0 is the maximum-Y side:

```
x = originX + col × 80 m
y = originY − row × 80 m
```

The display file `public/terrain/south-pole-preview.png` is a 2×2 block mean of that window (160 m) and a hillshade. It is not the analysis grid. Bounds and attribution are in `public/terrain/preview-meta.json`.

Citation: Barker, M. K., et al. (2023), A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter, The Planetary Science Journal, https://doi.org/10.3847/PSJ/acf3e1.

## Example locations

The three sites are pixel centres inside the window. They are **not** officially designated landing sites.

| Id | Nickname | East longitude | Latitude | Surface height |
| --- | --- | --- | --- | --- |
| example-a | Shackleton rim crest | −154.290046° | −89.802353° | 1703.41 m |
| example-b | near-side ridge | 58.134022° | −89.712657° | 1231.22 m |
| example-c | Shackleton floor | 122.195734° | −89.789561° | −2317.70 m |

Each site is at least 12 km from the edge of the grid, and every azimuth at the panel and antenna heights came back as terrain-backed.

## Alternatives

The search evaluates only the sites it is given and only the arrival offsets −48, −24, 0, +24, and +48 hours. Duration and user limits stay the same. Order, best first:

1. Meets every evaluated interruption limit.
2. Shorter worst interruption. An unknown value sorts after a known one.
3. More Sun–Earth overlap. An unknown value sorts after a known one.
4. Smaller plan change: great-circle distance in kilometres plus the absolute date offset in hours.

`limitedSearch` is always true. If nothing meets the limits, the list is the least-violating set in that box, with a shortfall, and the description says so. It is not a global optimum.

## What this leaves out

- The solar and Earth discs are not resolved. A centre a few hundredths of a degree clear of the mask is counted as visible even though the disc would be partly occulted. The delayed example at the Shackleton rim crest begins with Earth only about 0.01° above the mask.
- Eclipses are not modelled.
- Earth visibility is geometric centre only. It is not a link budget, and it does not include antenna gain, Earth station, or terrain multipath.
- The one-hour ephemeris step and the 2° horizon step set the timing resolution. Crossings are linear between samples.
- Terrain beyond 12 km is ignored. A high peak farther away can still rise above this mask.
- The reference-sphere limb is only a fallback for a ray with no elevations. It is not used on these three sites.
- Power, thermal, and mobility constraints are outside the screen.
