import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Share2, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useMedia, useMemoryMutations, useSignedUrls } from "@/hooks/useChallenge";
import { ShareLogSheet } from "@/components/feed/ShareLogSheet";
import { dayNumber, formatLongDate, todayISO, type Member } from "@/lib/challenge";
import type { Log, Media } from "@/lib/goals";

export const Route = createFileRoute("/memories")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Memories — Lovely 100" },
      { name: "description", content: "The days worth keeping, in order." },
      { property: "og:title", content: "Memories — Lovely 100" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MemoriesPage,
});

function MemoriesPage() {
  return (
    <AppShell>
      {({ me, data, progress, t }) => (
        <MemoriesView
          me={me}
          members={data.members}
          journeyId={data.journey.id}
          journeyStart={data.journey.start_date}
          moments={progress.moments}
          timelineTitle={t.timelineTitle}
        />
      )}
    </AppShell>
  );
}

function MemoriesView({
  me,
  members,
  journeyId,
  journeyStart,
  moments,
  timelineTitle,
}: {
  me: Member;
  members: Member[];
  journeyId: string;
  journeyStart: string;
  moments: Log[];
  timelineTitle: string;
}) {
  const media = useMedia(journeyId);
  const { add, attach, removePhoto, remove } = useMemoryMutations(journeyId, me.id);

  const [note, setNote] = useState("");
  const [place, setPlace] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [shareLogId, setShareLogId] = useState<string | null>(null);
  const [shareDefaultBody, setShareDefaultBody] = useState("");

  const byLog = useMemo(() => {
    const map = new Map<string, Media[]>();
    for (const m of media.data ?? []) {
      map.set(m.log_id, [...(map.get(m.log_id) ?? []), m]);
    }
    return map;
  }, [media.data]);

  const paths = useMemo(() => (media.data ?? []).map((m) => m.storage_path), [media.data]);
  const urls = useSignedUrls(paths);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  const submit = () => {
    if (!note.trim() && !place.trim() && !file) {
      toast.error("Write something, or add a photo");
      return;
    }
    add.mutate(
      { date: todayISO(), note: note.trim() || null, place: place.trim() || null, file },
      {
        onSuccess: () => {
          toast.success("Kept 💛");
          setNote("");
          setPlace("");
          setFile(null);
          if (fileInput.current) fileInput.current.value = "";
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader
        title={timelineTitle}
        subtitle="The days worth keeping. Not everything has to be a goal."
      />

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">Keep a memory</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What happened?"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
        />
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where? (optional)"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm">
            <ImagePlus className="size-4" />
            {file ? file.name.slice(0, 24) : "Add a photo"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={add.isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {add.isPending ? "Keeping…" : "Keep it"}
          </button>
          <Link to="/recap" className="rounded-xl border border-input px-4 py-2 text-sm">
            Make a recap
          </Link>
        </div>
      </section>

      {moments.length === 0 ? (
        <p className="surface p-5 text-sm text-muted-foreground">
          Nothing kept yet. A sentence about today is enough — you'll be glad of it at day 100.
        </p>
      ) : null}

      <ol className="space-y-4">
        {moments.map((m) => {
          const photos = byLog.get(m.id) ?? [];
          const mine = m.member_id === me.id;
          return (
            <li key={m.id} className="surface overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div>
                  <p className="text-sm font-medium">
                    {dayNumber(journeyStart, m.date) >= 1
                      ? `Day ${dayNumber(journeyStart, m.date)} · ${formatLongDate(m.date)}`
                      : formatLongDate(m.date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nameOf(m.member_id)}
                    {m.place ? ` · ${m.place}` : ""}
                  </p>
                </div>
                {mine ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Share this memory"
                      onClick={() => {
                        setShareLogId(m.id);
                        setShareDefaultBody(m.note ?? "");
                      }}
                      className="rounded-full border border-input p-1.5 text-muted-foreground"
                    >
                      <Share2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete this memory"
                      onClick={() =>
                        remove.mutate(m.id, {
                          onSuccess: () => toast.success("Removed"),
                          onError: (e: Error) => toast.error(e.message),
                        })
                      }
                      className="rounded-full border border-input p-1.5 text-muted-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>

              {m.note ? <p className="px-4 pt-2 text-sm">{m.note}</p> : null}

              {photos.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-1">
                  {photos.map((p) => {
                    const url = urls.data?.[p.storage_path] ?? null;
                    return (
                      <div key={p.id} className="relative">
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="aspect-square w-full animate-pulse bg-secondary" />
                        )}
                        {mine ? (
                          <button
                            type="button"
                            aria-label="Remove photo"
                            onClick={() => removePhoto.mutate(p)}
                            className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {mine ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                  <ImagePlus className="size-3.5" />
                  Add a photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        attach.mutate(
                          { logId: m.id, file: f },
                          { onError: (err: Error) => toast.error(err.message) },
                        );
                    }}
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ol>

      <ShareLogSheet
        open={shareLogId !== null}
        onOpenChange={(open) => { if (!open) setShareLogId(null); }}
        myMemberId={me.id}
        journeyId={journeyId}
        logId={shareLogId}
        defaultBody={shareDefaultBody}
        context="Share this memory"
      />
    </div>
  );
}
