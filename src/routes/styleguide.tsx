import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProgressRing } from "@/components/ProgressRing";
import {
  BarList,
  ChartFrame,
  ColumnChart,
  DataTable,
  Legend,
  LineChart,
  SERIES,
  StatTile,
} from "@/components/charts";
import { cn } from "@/lib/utils";

/**
 * Living reference for docs/design-system.html.
 *
 * The document describes tokens as text; nothing rendered them against real
 * components, so a token could drift from what the app actually looks like and
 * nobody would notice until a screen shipped wrong. This page renders every
 * token and every shared primitive pulled live from the same CSS variables and
 * the same components the app uses — not a second copy of the palette that can
 * itself go stale.
 *
 * Not linked from the main navigation; reached from Settings, the same way
 * /admin is.
 */
export const Route = createFileRoute("/styleguide")({
  ssr: false,
  head: () => ({ meta: [{ title: "Style guide — Lovely 100" }] }),
  component: StyleguidePage,
});

const SEMANTIC_TOKENS = [
  { name: "background", fg: "foreground" },
  { name: "card", fg: "card-foreground" },
  { name: "primary", fg: "primary-foreground" },
  { name: "secondary", fg: "secondary-foreground" },
  { name: "muted", fg: "muted-foreground" },
  { name: "accent", fg: "accent-foreground" },
  { name: "success", fg: "success-foreground" },
  { name: "warm", fg: "warm-foreground" },
  { name: "destructive", fg: "destructive-foreground" },
];

const CHART_LABELS = ["chart-1 · terracotta", "chart-2 · teal", "chart-3 · plum", "chart-4 · gold", "chart-5 · indigo"];

function StyleguidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-5 py-8">
      <header className="flex items-center gap-3">
        <Link to="/settings" className="rounded-full border border-input p-2">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="eyebrow">Internal — not in the main nav</p>
          <h1 className="font-display text-title">Style guide</h1>
        </div>
      </header>

      <p className="text-small text-muted-foreground">
        Every swatch and control below is the live token or the live component — not a redrawn copy — so
        this page cannot silently drift from what the app renders. Full rationale lives in{" "}
        <code className="rounded bg-secondary px-1.5 py-0.5 text-tiny">docs/design-system.html</code>.
      </p>

      {/* ---------- colour ---------- */}
      <Section title="Colour" hint="Semantic pairs, each with its own text token. Numbers are the measured contrast ratio of foreground on background.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SEMANTIC_TOKENS.map((t) => (
            <Swatch key={t.name} bg={t.name} fg={t.fg} />
          ))}
        </div>
      </Section>

      <Section title="Chart palette" hint="Assigned in this fixed order, never cycled. Validated for CVD separation and a 0.10 chroma floor — see the skill's validator, not eyeballing.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SERIES.map((c, i) => (
            <div key={c} className="surface p-3">
              <div className="h-12 w-full rounded-lg" style={{ background: c }} />
              <p className="mt-2 text-tiny text-muted-foreground">{CHART_LABELS[i]}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Legend items={SERIES.slice(0, 3).map((c, i) => ({ label: CHART_LABELS[i]!.split(" · ")[1]!, color: c }))} />
        </div>
      </Section>

      {/* ---------- type ---------- */}
      <Section title="Type" hint="Fraunces (display) and Plus Jakarta Sans (body). The optical-size axis steps with size — a 40px heading is not just a scaled-up 14px letterform.">
        <div className="space-y-3">
          <p className="text-display font-display">Aa Day 47</p>
          <p className="text-title font-display">Aa Your consistency</p>
          <p className="text-heading font-display">Aa Today's goals</p>
          <p className="text-body">Aa Body text — Plus Jakarta Sans at 1rem, the size everything reads at.</p>
          <p className="text-small text-muted-foreground">Aa Small — captions, hints, table cells.</p>
          <p className="text-tiny text-muted-foreground">Aa Tiny — timestamps, legends.</p>
          <p className="numeric text-title font-display">1,024 minutes</p>
          <p className="eyebrow">Eyebrow label</p>
        </div>
      </Section>

      {/* ---------- motion & focus ---------- */}
      <Section title="Motion and focus" hint="Tab to the button below to see the focus ring; toggle prefers-reduced-motion in your OS to see the pop animation stop.">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="animate-pop flex size-12 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground"
          >
            <Check className="size-5" />
          </button>
          <p className="text-small text-muted-foreground">Tab here →</p>
          <button type="button" className="rounded-full border border-input px-4 py-2 text-small">
            Focus me
          </button>
        </div>
      </Section>

      {/* ---------- components ---------- */}
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-sm gap-3">
          <Input placeholder="Placeholder text" />
          <div className="flex items-center gap-2">
            <Switch defaultChecked />
            <span className="text-small">Switch, on</span>
          </div>
        </div>
      </Section>

      <Section title="Surfaces and rings">
        <div className="flex flex-wrap items-center gap-4">
          <div className="surface p-4 text-small">surface utility</div>
          <ProgressRing value={68} size={72} label="68" sublabel="days" />
        </div>
      </Section>

      {/* ---------- charts ---------- */}
      <Section title="Chart primitives" hint="Hand-rolled SVG, not a library — recharts is in package.json but unused, so importing it would cost 5 MB to draw four shapes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile label="Days shown up" value="22" sub="of 25 elapsed" delta={12} />
          <StatTile label="Last 7 days" value="71%" delta={-8} />
        </div>
        <ChartFrame
          title="Line — consistency over time"
          hint="Gaps break the line rather than bridging it; the last point renders hollow while its period is still open."
          table={<DataTable head={["Week", "Rate"]} rows={[["W1", "60%"], ["W2", "—"], ["W3", "80%"]]} />}
        >
          <LineChart
            points={[
              { label: "W1", value: 60 },
              { label: "W2", value: null },
              { label: "W3", value: 80, partial: true },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="Bar list — ranked magnitude"
          hint="A null pct renders no fill at all, never a zero-width bar that implies a measured zero."
          table={<DataTable head={["Goal", "Rate"]} rows={[["Walk", "80%"], ["Places", "3 logged"]]} />}
        >
          <BarList
            data={[
              { key: "a", label: "Walk", pct: 80, valueText: "80%", colorIndex: 0 },
              { key: "b", label: "Places", pct: null, valueText: "3 logged", colorIndex: 1 },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="Columns — ordered short categories"
          table={<DataTable head={["Day", "Rate"]} rows={[["Mon", "80%"], ["Tue", "40%"], ["Wed", "—"]]} />}
        >
          <ColumnChart
            colorIndex={2}
            data={[
              { key: "mon", label: "Mon", pct: 80, valueText: "Mon: 80%" },
              { key: "tue", label: "Tue", pct: 40, valueText: "Tue: 40%" },
              { key: "wed", label: "Wed", pct: null, valueText: "not yet" },
            ]}
          />
        </ChartFrame>
      </Section>
    </div>
  );
}

function Swatch({ bg, fg }: { bg: string; fg: string }) {
  return (
    <div
      className="rounded-xl border border-border p-3"
      style={{ background: `var(--color-${bg})`, color: `var(--color-${fg})` }}
    >
      <p className="text-small font-medium">{bg}</p>
      <p className="text-tiny opacity-80">on {fg}</p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cn("space-y-3 border-t border-border pt-6 first:border-t-0 first:pt-0")}>
      <div>
        <h2 className="text-heading font-display">{title}</h2>
        {hint ? <p className="mt-0.5 text-tiny text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
