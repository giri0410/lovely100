/**
 * Chart primitives, hand-rolled SVG.
 *
 * Not a charting library: recharts is in package.json but referenced only by an
 * unused shadcn scaffold, so it costs nothing today and importing it here would
 * add 5 MB of dependency to draw four simple shapes. Hand-rolled also means the
 * mark specs are exactly right — 2px strokes, 4px rounded data-ends anchored to
 * the baseline, a 2px surface gap between adjacent fills, recessive axes.
 *
 * Conventions that hold everywhere in this file:
 *   - A percentage is rendered only where one exists. `null` prints a count or
 *     an em dash; it never becomes 0%.
 *   - Series colour comes from --chart-1..5 in fixed order, never cycled.
 *   - Values and labels wear text tokens, never the series colour.
 *   - Every chart has a table view, because colour alone is not an encoding.
 */

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/* ---------- frame ---------- */

export function ChartFrame({
  title,
  hint,
  legend,
  table,
  children,
}: {
  title: string;
  hint?: string;
  legend?: ReactNode;
  /** Rendered when the reader switches to the table. Always provide one. */
  table: ReactNode;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading">{title}</h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="shrink-0 rounded-full border border-input px-2.5 py-1 text-tiny text-muted-foreground"
        >
          {showTable ? "View chart" : "View data"}
        </button>
      </div>
      {hint ? <p className="mt-1 text-tiny text-muted-foreground">{hint}</p> : null}
      {legend ? <div className="mt-3">{legend}</div> : null}
      <div className="mt-4">{showTable ? <div className="overflow-x-auto">{table}</div> : children}</div>
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-tiny text-muted-foreground">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-small">
      <thead>
        <tr className="text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={cn("py-1.5 font-medium", i === 0 ? "text-left" : "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-t border-border/70">
            {r.map((c, ci) => (
              <td key={ci} className={cn("py-1.5 numeric", ci === 0 ? "text-left" : "text-right")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- horizontal bars ---------- */

export interface BarDatum {
  key: string;
  label: string;
  /** null means "no denominator" — the row shows `valueText` instead of a bar. */
  pct: number | null;
  valueText: string;
  /**
   * Only set this where the rows really are different categories, with a legend
   * to match. Leave it unset for a ranked list of one kind of thing: cycling
   * hues down a single series implies groups that do not exist, and once there
   * are more rows than hues the colours repeat and imply the wrong ones.
   */
  colorIndex?: number;
}

/**
 * Ranked horizontal bars. The right form when the categories are named things
 * being compared by magnitude — labels stay horizontal and readable, which a
 * vertical column chart cannot do once a label is longer than a word.
 */
export function BarList({ data, monochrome = false }: { data: BarDatum[]; monochrome?: boolean }) {
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key}>
          <div className="flex items-baseline justify-between gap-3 text-small">
            <span className="truncate">{d.label}</span>
            <span className="numeric shrink-0 font-medium tabular-nums">{d.valueText}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
            {d.pct !== null ? (
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(Math.min(d.pct, 100), 0)}%`,
                  background: monochrome ? SERIES[0] : SERIES[(d.colorIndex ?? 0) % SERIES.length],
                }}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- columns ---------- */

export interface ColumnDatum {
  key: string;
  label: string;
  pct: number | null;
  /** The value alone. The tooltip and the aria-label add the label themselves. */
  valueText: string;
}

/**
 * Columns for an ordered, short-labelled dimension — weekdays. Bars sit on a
 * baseline with rounded tops only, so the mark reads as growing from the axis.
 * A null value draws no column at all rather than a zero-height one, which
 * would imply a measured zero.
 */
export function ColumnChart({ data, colorIndex = 1 }: { data: ColumnDatum[]; colorIndex?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {data.map((d) => {
          const h = d.pct === null ? 0 : Math.max(d.pct, 2);
          return (
            <button
              key={d.key}
              type="button"
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              className="group relative flex h-full flex-1 flex-col justify-end"
              aria-label={`${d.label}: ${d.valueText}`}
            >
              {/* Tooltip on hover and on keyboard focus, not hover alone. */}
              {hover === d.key ? (
                <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-tiny shadow-[var(--shadow-lift)]">
                  <span className="font-medium">{d.label}</span>{" "}
                  <span className="numeric">{d.valueText}</span>
                </span>
              ) : null}
              <span
                className="w-full rounded-t-[4px] transition-[height] duration-500"
                style={{
                  height: `${h}%`,
                  background: SERIES[colorIndex % SERIES.length],
                  opacity: hover && hover !== d.key ? 0.55 : 1,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-tiny text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- line ---------- */

export interface LinePoint {
  label: string;
  value: number | null;
  /** Drawn hollow when the period is still in progress. */
  partial?: boolean;
}

/**
 * A trend line over ordered periods.
 *
 * Change over time is the one job a line does better than anything else. Gaps
 * are genuine breaks in the path — a null is not bridged, because joining
 * across missing data draws a trend that was never measured.
 */
export function LineChart({
  points,
  colorIndex = 0,
  yMax = 100,
  unit = "%",
}: {
  points: LinePoint[];
  colorIndex?: number;
  yMax?: number;
  unit?: string;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 100;
  const H = 42;
  const pad = 3;

  if (points.length === 0) {
    return <p className="text-small text-muted-foreground">Nothing to chart yet.</p>;
  }

  const x = (i: number) =>
    points.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v: number) => H - pad - (Math.max(0, Math.min(v, yMax)) / yMax) * (H - pad * 2);

  // Break the path wherever a value is missing.
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push({ i, v: p.value });
  });
  if (run.length) segments.push(run);

  const color = SERIES[colorIndex % SERIES.length];
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="relative">
        {/* Scale markers. Without them the highest point could be 60% or 100%
            and the line would look identical. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-[2px] text-tiny text-muted-foreground">
          <span className="numeric">{yMax}{unit}</span>
          <span className="numeric">0{unit}</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible pr-8"
          role="img"
          aria-label={`Trend over ${points.length} periods`}
          preserveAspectRatio="none"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={W} height={H} />
            </clipPath>
          </defs>

          {/* Recessive gridlines: hairlines at quarters, no labels cluttering. */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={y(yMax * f)}
              y2={y(yMax * f)}
              stroke="var(--color-border)"
              strokeWidth={0.25}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {segments.map((seg, si) => (
              <polyline
                key={si}
                points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {points.map((p, i) =>
            p.value === null ? null : (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={hover === i ? 3 : 2}
                fill={p.partial ? "var(--color-card)" : color}
                stroke={color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>

        {/* Hit targets sit above the drawing and are wider than the marks. */}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <button
              key={i}
              type="button"
              className="h-full flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.label}: ${p.value === null ? "no data" : `${p.value}${unit}`}`}
            />
          ))}
        </div>

        {active ? (
          <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg bg-popover px-2 py-1 text-tiny shadow-[var(--shadow-lift)]">
            <span className="font-medium">{active.label}</span>{" "}
            <span className="numeric">
              {active.value === null ? "—" : `${active.value}${unit}`}
            </span>
            {active.partial ? <span className="text-muted-foreground"> · in progress</span> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-tiny text-muted-foreground">
        <span>{points[0]?.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]?.label}</span> : null}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/* ---------- stat tile ---------- */

export function StatTile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Percentage-point change. null renders nothing — not a zero. */
  delta?: number | null;
}) {
  const dir = delta === null || delta === undefined ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <div className="surface p-4">
      <p className="eyebrow">{label}</p>
      <p className="numeric mt-1 font-display text-title">{value}</p>
      {sub ? <p className="text-tiny text-muted-foreground">{sub}</p> : null}
      {dir ? (
        <p
          className={cn(
            "numeric mt-1 text-tiny font-medium",
            dir === "up" && "text-success",
            dir === "down" && "text-destructive",
            dir === "flat" && "text-muted-foreground",
          )}
        >
          {/* An arrow plus a sign, so direction is not carried by colour alone. */}
          {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {Math.abs(delta!)} pts
        </p>
      ) : null}
    </div>
  );
}
