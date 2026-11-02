/**
 * Fetches weekly npm download counts for @inlang/sdk and writes them to
 * src/npm-downloads.json.
 *
 * The website renders the download chart from this static file. Run this
 * script to refresh it, then commit the result.
 *
 * Values are intentionally coarse: full Monday-Sunday weeks only, rounded to
 * the nearest thousand.
 *
 * The npm stats API has gaps where a day shows 0 downloads. A package this busy
 * never has a real zero day, so a zero day counts as missing and the days that
 * have data are scaled to a full week. Without this, a week with gaps looks
 * like a dip in the chart.
 *
 * Usage: pnpm --filter @inlang/website-v2 update-npm-downloads
 */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PACKAGE = "@inlang/sdk";
const WEEKS = 53;
const OUTPUT_PATH = fileURLToPath(
  new URL("../src/npm-downloads.json", import.meta.url),
);

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Most recent completed Sunday (UTC), exclusive of today. */
function lastCompletedSunday(now) {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay(): 0 = Sunday. Step back to the previous Sunday, never today.
  const daysBack = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date;
}

const now = new Date();
const end = lastCompletedSunday(now);
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1));

const url = `https://api.npmjs.org/downloads/range/${toIsoDate(start)}:${toIsoDate(end)}/${PACKAGE}`;
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`npm downloads fetch failed: ${res.status} ${url}`);
}
const body = await res.json();
const byDay = new Map(
  (body.downloads ?? []).map((entry) => [entry.day, entry.downloads]),
);

const weeks = [];
for (let i = 0; i < WEEKS; i++) {
  const weekStart = new Date(start);
  weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
  let total = 0;
  let daysWithData = 0;
  for (let d = 0; d < 7; d++) {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + d);
    const value = byDay.get(toIsoDate(day));
    if (value) {
      total += value;
      daysWithData++;
    }
  }
  const weekEnding = new Date(weekStart);
  weekEnding.setUTCDate(weekEnding.getUTCDate() + 6);
  // Skip leading weeks from before the package existed.
  if (daysWithData === 0 && weeks.length === 0) continue;
  const weekTotal = daysWithData === 0 ? 0 : (total * 7) / daysWithData;
  weeks.push({
    weekEnding: toIsoDate(weekEnding),
    downloads: Math.round(weekTotal / 1000) * 1000,
  });
}

const latest = weeks[weeks.length - 1]?.downloads ?? 0;

const payload = {
  generatedAt: now.toISOString(),
  package: PACKAGE,
  latestWeeklyDownloads: latest,
  weeks,
};

await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n");
console.log(
  `Wrote ${weeks.length} weeks for ${PACKAGE} (latest full week: ${latest.toLocaleString("en-US")}) to ${OUTPUT_PATH}`,
);
