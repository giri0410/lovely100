export function EmptyFeed() {
  return (
    <div className="surface p-6 text-center">
      <p className="text-2xl">👥</p>
      <h2 className="mt-2 text-lg">Your feed is quiet</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        Follow people from the suggestions above and you'll see their updates here. Share your own
        progress from Today or Memories.
      </p>
    </div>
  );
}
