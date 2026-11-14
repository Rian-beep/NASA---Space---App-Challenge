# Earth dishes: build plan

A separate folder from the Moon screen. It shows a 3D Earth, the three NASA listening sites, and the weather at those sites on a chosen date. The Moon screen stays as it is. This does not approve a landing and does not say a radio call will work.

## What the user sees

Route: `/earth`

- A turning Earth, NASA picture of the ground, and the three Deep Space Network dishes: Goldstone (California), Madrid (Spain), Canberra (Australia).
- A date. Past, today, or a future day.
- For that date, each dish shows rain risk, cloud, wind, temperature, and whether the Moon is above that dish's horizon.
- A short solar-storm line when a published forecast exists.
- A sentence that stays on screen: this is a planning view, not a promise the signal gets through.

## Two honest weather modes

The "predictive model" is a rule on top of published data. It is not a trained neural net, and it does not invent rain.

| How far ahead | What we use | What we call it |
| --- | --- | --- |
| The selected day is today, or within the next 16 days, and the forecast request works | Meteomatics when a login is set, otherwise Open-Meteo daily forecast | Forecast |
| The day is in the past | NASA POWER daily from 1981, otherwise the Open-Meteo archive back to the 1940s | Recorded on this day |
| The day is further ahead, or the forecast request fails | Mean of NASA POWER daily values on that month and day at that dish, 1991–2020. Wet years had at least 1 mm. Monthly POWER is only the fallback if that day is missing. | Usual for this date |

Rules live in code and tests. Thresholds are our planning labels, not a radio link budget.

Forecast rain risk, first match wins:

- **high** if the day's rain chance is at least 70%, or the day's rain total is at least 10 mm
- **elevated** if the chance is at least 40%, or the total is at least 1 mm
- **low** otherwise
- **unknown** if both numbers are missing

Typical-weather rain risk uses NASA POWER `PRECTOTCORR` (average millimetres per day in that month):

- **high** if at least 5 mm/day
- **elevated** if at least 1 mm/day
- **low** if under 1 mm/day

Wind at or above 12 m/s adds a plain sentence that a gust can push a dish off the Moon. It does not by itself raise the rain risk.

## Sources

Meteomatics is the weather read above each dish when `METEOMATICS_USERNAME` and `METEOMATICS_PASSWORD` are set. The password stays on the server. The report stores the query URL without the login. One hourly series for that calendar day: temperature `t_2m:C`, rain `precip_1h:mm` (added up), wind `wind_speed_10m:ms` (the strongest hour), cloud `effective_cloud_cover:p`. That result is labeled a forecast. If the login is missing or Meteomatics does not answer, the older reads below are used.

No API key for the fallback reads.

- Dishes: `earth/data/stations.ts`. The big 70 m antennas. Import this file. Do not copy the numbers.
- Forecast: `https://api.open-meteo.com/v1/forecast` with `daily=precipitation_sum,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,temperature_2m_mean`, `timezone=UTC`, `forecast_days=16`.
- Typical weather: `https://power.larc.nasa.gov/api/temporal/climatology/point` with `parameters=PRECTOTCORR,T2M,WS10M,CLOUD_AMT`, `community=RE`, `format=JSON`. Months come back as `JAN` … `DEC`.
- Solar storms: `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`. Read the header row. A Kp of 5 or more is a storm in this view. If the date is outside the file, say no published storm forecast reaches that date.
- Moon height: `astronomy-engine` at the dish. Above the horizon means elevation greater than 0. Say it is a sky calculation of about a degree, not a network schedule.
- Earth picture: local NASA Blue Marble in `earth/images/`. For a date on or before today, the globe may also try a NASA GIBS true-color snapshot. A future date keeps the Blue Marble. Do not draw invented storm clouds.

## Files

Shared contract, already written. Do not reshape these types:

- `earth/data/types.ts`
- `earth/data/stations.ts`

Model, tests, and the server read:

- `earth/data/regime.ts`, `rain.ts`, `power.ts`, `openMeteo.ts`, `swpc.ts`, `moon.ts`, `report.ts`
- `earth/tests/*.test.ts`

Picture and page:

- `earth/images/`
- `earth/visuals/EarthGlobe.tsx`
- `earth/visuals/EarthStage.tsx`
- `earth/page.tsx`
- `earth/api/route.ts`

`buildEarthReport({ date, today, fetchImpl })` in `report.ts` returns `EarthDayReport`. The route is GET `/api/earth?date=YYYY-MM-DD` only. Reject a bad date with 400. No request body. Cache a successful report in memory for 30 minutes, at most 32 dates. Time out each outbound request at 12 seconds. If one source fails, still return the globe data and mark that part unknown.

## Words

Everyday words first. "Rain risk", "Moon up", "typical for this month", "forecast". Do not say the landing is safe, approved, or flight-ready. Do not say the call will succeed or fail.
