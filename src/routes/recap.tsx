import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Share2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { formatMoney } from "@/lib/challenge";
import { badgesEarned } from "@/lib/progress";
import type { JourneyProgress } from "@/lib/progress";
import type { Copy } from "@/lib/copy";

export const Route = createFileRoute("/recap")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your recap — Lovely 100" },
      { name: "description", content: "Turn your 100 days into a card you can share." },
      { property: "og:title", content: "Your recap — Lovely 100" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecapPage,
});

/**
 * The recap is drawn in the browser and handed to the user as a file.
 *
 * Deliberately not a hosted page behind a share link. The product decision was
 * shareable recaps and no public content: a link would mean stranger-visible
 * pages, moderation, and a permanent surface to defend. An image the user
 * sends through their own apps keeps the number of publicly reachable URLs at
 * zero, and the sharing decision stays entirely theirs.
 */
function RecapPage() {
  return (
    <AppShell>
      {({ data, progress, t, me }) => (
        <RecapView
          progress={progress}
          t={t}
          journeyName={data.journey.name}
          duration={data.journey.duration}
          savedTotal={data.expenses.reduce((s, e) => s + Number(e.amount || 0), 0)}
          myName={me.name}
        />
      )}
    </AppShell>
  );
}

interface Line {
  label: string;
  value: string;
}

function RecapView({
  progress,
  t,
  journeyName,
  duration,
  savedTotal,
  myName,
}: {
  progress: JourneyProgress;
  t: Copy;
  journeyName: string;
  duration: number;
  savedTotal: number;
  myName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const mine = progress.members.find((m) => m.member.name === myName) ?? progress.members[0];

  const badges = badgesEarned(progress.currentDay);
  const goalLines: Line[] = (mine?.goals ?? [])
    .filter((g) => !g.goal.archived_at)
    .slice(0, 6)
    .map((g) => ({
      label: `${g.goal.icon ? `${g.goal.icon} ` : ""}${g.goal.title}`,
      // A count where there is no honest denominator — the same rule the rest
      // of the app follows. A recap is the last place to start inventing one.
      value: g.pct !== null ? `${g.pct}%` : `${g.unitsDone}`,
    }));

  const stats: Line[] = [
    { label: "Days shown up", value: `${t.together ? progress.togetherDays : progress.aliveDays}` },
    { label: "Best streak", value: `${progress.togetherStreak.best} days` },
    { label: "Memories kept", value: `${progress.moments.length}` },
    ...(savedTotal > 0 ? [{ label: "Money avoided", value: formatMoney(savedTotal) }] : []),
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fixed 1080x1350 — the portrait ratio Instagram and WhatsApp both accept
    // without recropping.
    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#fdf6f0");
    bg.addColorStop(1, "#f6ebe3");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#8c5a3c";
    ctx.font = "600 34px Georgia, serif";
    ctx.fillText("LOVELY 100", 80, 130);

    ctx.fillStyle = "#2f2119";
    ctx.font = "700 78px Georgia, serif";
    ctx.fillText(`Day ${progress.currentDay}`, 80, 240);

    ctx.font = "400 34px Georgia, serif";
    ctx.fillStyle = "#6b5445";
    ctx.fillText(`of ${duration} — ${journeyName}`.slice(0, 44), 80, 292);

    let y = 400;
    ctx.font = "600 40px Georgia, serif";
    for (const s of stats) {
      ctx.fillStyle = "#6b5445";
      ctx.fillText(s.label, 80, y);
      ctx.fillStyle = "#2f2119";
      ctx.textAlign = "right";
      ctx.fillText(s.value, W - 80, y);
      ctx.textAlign = "left";
      y += 72;
    }

    if (goalLines.length > 0) {
      y += 24;
      ctx.strokeStyle = "#e0cfc2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, y - 40);
      ctx.lineTo(W - 80, y - 40);
      ctx.stroke();

      ctx.font = "400 34px Georgia, serif";
      for (const g of goalLines) {
        ctx.fillStyle = "#6b5445";
        ctx.fillText(g.label.slice(0, 26), 80, y);
        ctx.fillStyle = "#2f2119";
        ctx.textAlign = "right";
        ctx.fillText(g.value, W - 80, y);
        ctx.textAlign = "left";
        y += 58;
      }
    }

    if (badges.length > 0) {
      ctx.font = "400 44px Georgia, serif";
      ctx.fillStyle = "#8c5a3c";
      ctx.fillText(badges.map((b) => `${b.emoji} ${b.label}`).join("   ").slice(0, 40), 80, H - 150);
    }

    ctx.font = "400 28px Georgia, serif";
    ctx.fillStyle = "#8c7a6c";
    ctx.fillText("100 days, your goals.", 80, H - 80);

    canvas.toBlob((blob) => {
      if (blob) setUrl(URL.createObjectURL(blob));
    }, "image/png");
  }, [progress, duration, journeyName, savedTotal, badges.length, goalLines.length]);

  // Object URLs are revoked when replaced so a long session does not leak them.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const share = async () => {
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "lovely-100-recap.png", { type: "image/png" });
      // Web Share with files is not universal, so a download is the fallback
      // rather than an error.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Lovely 100 recap" });
        return;
      }
      download();
    } catch {
      toast.error("Sharing isn't available here — the image has been downloaded instead.");
      download();
    }
  };

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "lovely-100-recap.png";
    a.click();
  };

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader
        title="Your recap"
        subtitle="A card of where you've got to. Yours to share, or not."
      />

      <section className="surface p-4">
        {url ? (
          <img src={url} alt="Your recap card" className="w-full rounded-xl" />
        ) : (
          <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-secondary" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={share}
          disabled={!url}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Share2 className="size-4" />
          Share
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!url}
          className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm disabled:opacity-60"
        >
          <Download className="size-4" />
          Download
        </button>
      </div>

      {/* Said plainly, because the privacy policy promises the app keeps this
          private — and sharing is the one thing that changes that. */}
      <p className="text-sm text-muted-foreground">
        The card is made on your device and never uploaded. Once you share it, whoever you send it to can
        see what's on it — that part is up to you.
      </p>
    </div>
  );
}
