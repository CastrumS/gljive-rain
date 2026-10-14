# gljive-rain

Daily rain totals for a 0.5° grid over Croatia, used by the Gljive app.

`rain-grid.json` holds the last 14 full days of `precipitation_sum` (mm) per grid point, plus 7 and 14 day totals. A GitHub Actions job refreshes it every day at 04:17 UTC.

This repo holds only weather data. It holds no user data.

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
