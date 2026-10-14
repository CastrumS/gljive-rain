import { writeFileSync } from "node:fs";

type Point = { lat: number; lon: number };
type DailyResponse = { daily: { time: string[]; precipitation_sum: number[] } };
type GridPoint = Point & { total7: number; total14: number; daily: number[] };
type Grid = {
  generated: string;
  source: string;
  license: string;
  step: number;
  days: string[];
  points: GridPoint[];
};

const STEP = 0.5;
const LAT_MIN = 42.5;
const LAT_MAX = 46.5;
const LON_MIN = 13.5;
const LON_MAX = 19.5;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 2000;
const ATTEMPTS = 4;
const RETRY_PAUSE_MS = 15000;
const OUT_FILE = "rain-grid.json";

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const steps = (min: number, max: number): number[] =>
  Array.from({ length: Math.round((max - min) / STEP) + 1 }, (_, i) => +(min + i * STEP).toFixed(1));

const gridPoints = (): Point[] =>
  steps(LAT_MIN, LAT_MAX).flatMap((lat) => steps(LON_MIN, LON_MAX).map((lon) => ({ lat, lon })));

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const batchUrl = (batch: Point[]): string =>
  "https://api.open-meteo.com/v1/forecast?" +
  new URLSearchParams({
    latitude: batch.map((p) => p.lat).join(","),
    longitude: batch.map((p) => p.lon).join(","),
    daily: "precipitation_sum",
    past_days: "14",
    forecast_days: "0",
    timezone: "Europe/Zagreb",
  }).toString();

const parseDaily = (body: string, url: string, expected: number): DailyResponse[] => {
  const parsed: DailyResponse | DailyResponse[] = JSON.parse(body);
  const list: DailyResponse[] = Array.isArray(parsed) ? parsed : [parsed];
  const valid =
    list.length === expected &&
    list.every(
      (r) =>
        r.daily.time.length === 14 &&
        r.daily.precipitation_sum.length === 14 &&
        r.daily.precipitation_sum.every((v) => typeof v === "number"),
    );
  if (!valid) throw new Error(`Unexpected Open-Meteo body: ${JSON.stringify({ url, body: body.slice(0, 500) })}`);
  return list;
};

const fetchBatch = async (batch: Point[], attempt = 1): Promise<DailyResponse[]> => {
  const url = batchUrl(batch);
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch((err: Error) => err);
  const failure =
    res instanceof Error
      ? { url, attempt, error: res.message }
      : res.ok
        ? null
        : { url, attempt, status: res.status, body: (await res.text()).slice(0, 500) };
  if (failure === null) return parseDaily(await (res as Response).text(), url, batch.length);
  if (attempt >= ATTEMPTS) throw new Error(`Open-Meteo batch failed: ${JSON.stringify(failure)}`);
  console.warn(JSON.stringify({ level: "warn", msg: "open-meteo retry", ...failure }));
  await sleep(RETRY_PAUSE_MS);
  return fetchBatch(batch, attempt + 1);
};

const sum = (values: number[]): number => +values.reduce((a, b) => a + b, 0).toFixed(1);

const main = async (): Promise<void> => {
  const batches = chunks(gridPoints(), BATCH_SIZE);
  const results: DailyResponse[][] = [];
  for (const batch of batches) {
    results.push(await fetchBatch(batch));
    await sleep(BATCH_PAUSE_MS);
  }
  const grid: Grid = {
    generated: new Date().toISOString(),
    source: "Open-Meteo.com",
    license: "CC BY 4.0",
    step: STEP,
    days: results[0][0].daily.time,
    points: batches.flatMap((batch, b) =>
      batch.map((p, i) => {
        const daily = results[b][i].daily.precipitation_sum;
        return { ...p, total7: sum(daily.slice(7)), total14: sum(daily), daily };
      }),
    ),
  };
  writeFileSync(OUT_FILE, JSON.stringify(grid) + "\n");
  console.log(JSON.stringify({ level: "info", msg: "grid written", points: grid.points.length, days: grid.days }));
};

await main();
