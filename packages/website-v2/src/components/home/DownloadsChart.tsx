import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import npmDownloads from "../../npm-downloads.json";
import { Section, SectionHeading } from "./Section";

const VW = 1000;
const VH = 220;
const PAD = 8;

const ranges = [
  { key: "90d", label: "90d", weeks: 13 },
  { key: "6m", label: "6m", weeks: 26 },
  { key: "12m", label: "12M", weeks: 53 },
] as const;

type RangeKey = (typeof ranges)[number]["key"];

type Week = { weekEnding: string; downloads: number };

const allWeeks: Week[] = npmDownloads.weeks;

const dateFormat = (options: Intl.DateTimeFormatOptions) => (value: Date) =>
  value.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

const formatDay = dateFormat({
  month: "short",
  day: "numeric",
  year: "numeric",
});
const formatMonth = dateFormat({ month: "long", year: "numeric" });

/** Short count for labels: 667k, 1M, 1.4M. */
function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

function weekStart(weekEnding: string): Date {
  const start = new Date(`${weekEnding}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return start;
}

/**
 * Weekly npm downloads of @inlang/sdk with 90d / 6m / 12M ranges, drawn from
 * the statically generated npm-downloads.json.
 */
export function DownloadsChart() {
  const [range, setRange] = useState<RangeKey>("12m");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const take = ranges.find((r) => r.key === range)?.weeks ?? allWeeks.length;
    return allWeeks.slice(Math.max(0, allWeeks.length - take));
  }, [range]);

  const { points, ticks } = useMemo(() => {
    const values = data.map((week) => week.downloads);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const floor = min * 0.4;
    const span = Math.max(1, max - floor);
    const toY = (value: number) =>
      VH - PAD - ((value - floor) / span) * (VH - PAD * 2);
    const points = data.map((week, i) => {
      const x = data.length === 1 ? VW : (i / (data.length - 1)) * VW;
      return [x, toY(week.downloads)] as const;
    });

    // Pick a "nice" tick step that yields at most about 5 axis labels.
    const stepCandidates = [1, 2, 2.5, 5]
      .flatMap((base) =>
        [1_000, 10_000, 100_000, 1_000_000].map(
          (magnitude) => base * magnitude,
        ),
      )
      .sort((a, b) => a - b);
    const step =
      stepCandidates.find((candidate) => span / candidate <= 5) ??
      stepCandidates[stepCandidates.length - 1];
    const ticks: Array<{ value: number; y: number }> = [];
    for (
      let value = Math.ceil(floor / step) * step;
      value <= max;
      value += step
    ) {
      ticks.push({ value, y: toY(value) });
    }
    return { points, ticks };
  }, [data]);

  const linePath = points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${VW} ${VH} L0 ${VH} Z`;
  const last = points[points.length - 1];
  const latest = allWeeks[allWeeks.length - 1];

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap || points.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    const frac = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    setHoverIdx(Math.round(frac * (data.length - 1)));
  };

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <Section id="adoption">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <SectionHeading>Adoption</SectionHeading>
          <p className="text-[15px] text-ink-faint">
            Weekly npm downloads of{" "}
            <code className="text-[13.5px] text-ink-secondary">
              @inlang/sdk
            </code>
            {latest && <> · {formatCount(latest.downloads)} last week</>}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[#d9d5cc] bg-white">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setRange(r.key);
                setHoverIdx(null);
              }}
              className={`min-h-8 cursor-pointer px-3 py-[7px] font-mono text-[11px] leading-none transition-colors ${
                range === r.key
                  ? "bg-ink text-paper"
                  : "bg-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-white px-5 pt-7 pb-4 sm:px-7">
        <div
          ref={wrapRef}
          className="relative cursor-crosshair"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            className="block h-auto w-full overflow-visible"
            role="img"
            aria-label="Weekly npm downloads of @inlang/sdk"
          >
            {ticks.map((tick) => (
              <line
                key={tick.value}
                x1="0"
                y1={tick.y.toFixed(1)}
                x2={VW}
                y2={tick.y.toFixed(1)}
                stroke="#eceae4"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={areaPath} fill="rgba(14,116,144,0.10)" />
            <path
              d={linePath}
              fill="none"
              stroke="#0e7490"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {hoveredPoint && (
              <line
                x1={hoveredPoint[0].toFixed(1)}
                y1="0"
                x2={hoveredPoint[0].toFixed(1)}
                y2={VH}
                stroke="#9aa0a6"
                strokeWidth="1"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hoveredPoint && (
              <circle
                cx={hoveredPoint[0].toFixed(1)}
                cy={hoveredPoint[1].toFixed(1)}
                r="4.5"
                fill="#ffffff"
                stroke="#0e7490"
                strokeWidth="2"
              />
            )}
            {last && (
              <circle
                cx={last[0].toFixed(1)}
                cy={last[1].toFixed(1)}
                r="3.5"
                fill="#0e7490"
              />
            )}
          </svg>
          {ticks.map((tick) => (
            <span
              key={tick.value}
              className="pointer-events-none absolute left-0 -translate-y-full pb-[3px] font-mono text-[11px] leading-none text-ink-faint"
              style={{ top: `${((tick.y / VH) * 100).toFixed(2)}%` }}
            >
              {formatCount(tick.value)}
            </span>
          ))}
          {hovered && hoveredPoint && (
            <div
              className="pointer-events-none absolute z-[5] flex -translate-x-1/2 translate-y-[-128%] flex-col gap-[3px] rounded-lg bg-ink px-[13px] py-[9px] whitespace-nowrap text-paper shadow-[0_6px_18px_rgba(20,23,26,0.22)]"
              style={{
                left: `${Math.min(88, Math.max(10, (hoveredPoint[0] / VW) * 100)).toFixed(1)}%`,
                top: `${((hoveredPoint[1] / VH) * 100).toFixed(1)}%`,
              }}
            >
              <span className="text-[13.5px] font-bold tracking-[-0.01em]">
                {hovered.downloads.toLocaleString("en-US")} downloads
              </span>
              <span className="text-xs text-[#b8bdc4]">
                Week of {formatDay(weekStart(hovered.weekEnding))}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-2.5 font-mono text-xs text-ink-faint">
          <span>
            {data[0] &&
              formatMonth(weekStart(data[0].weekEnding)).toLowerCase()}
          </span>
          <span>
            {latest &&
              `through ${formatDay(new Date(`${latest.weekEnding}T00:00:00Z`))}`}
          </span>
        </div>
      </div>
    </Section>
  );
}
