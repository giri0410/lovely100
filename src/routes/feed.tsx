import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/AppShell';
import { PostCard } from '@/components/feed/PostCard';
import { DiscoverStrip } from '@/components/feed/DiscoverStrip';
import { EmptyFeed } from '@/components/feed/EmptyFeed';
import {
  useFeed,
  useFollowing,
  useFollowMutation,
  useDeletePostMutation,
  useDiscoverMembers,
} from '@/hooks/useFeed';

export const Route = createFileRoute('/feed')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Feed — Lovely 100' },
      { name: 'description', content: 'Updates from people you follow.' },
      { property: 'og:title', content: 'Feed — Lovely 100' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  return (
    <AppShell>
      {({ me, data }) => (
        <FeedView myMemberId={me.id} journeyId={data.journey.id} />
      )}
    </AppShell>
  );
}

function FeedView({ myMemberId, journeyId: _journeyId }: { myMemberId: string; journeyId: string }) {
  const { pages, isLoading, loadMore, hasMore, loadingMore } = useFeed(myMemberId);
  const followingQuery = useFollowing(myMemberId);
  const discoverQuery = useDiscoverMembers(myMemberId, 10);
  const { follow, unfollow } = useFollowMutation(myMemberId);
  const deleteMutation = useDeletePostMutation(myMemberId);

  const followingIds = new Set(
    (followingQuery.data ?? []).map((f) => f.following_member_id),
  );

  const allPosts = pages.flat();
  const isEmpty = !isLoading && allPosts.length === 0;
  const hasFollowing = followingIds.size > 0;

  const handleFollow = (targetId: string) => {
    follow.mutate(targetId, {
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleUnfollow = (targetId: string) => {
    unfollow.mutate(targetId, {
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleDelete = (postId: string) => {
    deleteMutation.mutate(postId, {
      onSuccess: () => toast.success('Post removed'),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader title="Feed" subtitle="What your people are keeping up with." />

      {(discoverQuery.data?.length ?? 0) > 0 ? (
        <DiscoverStrip
          suggestions={discoverQuery.data ?? []}
          myMemberId={myMemberId}
          followingIds={followingIds}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          pending={follow.isPending || unfollow.isPending}
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="surface h-20 animate-pulse" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyFeed />
      ) : (
        <div className="space-y-3">
          <ol className="space-y-3">
            {allPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                myMemberId={myMemberId}
                onDelete={handleDelete}
                deleting={deleteMutation.isPending}
              />
            ))}
          </ol>

          {hasFollowing && allPosts.length === 0 ? (
            <p className="surface p-5 text-center text-sm text-muted-foreground">
              Nobody has posted yet. Be the first.
            </p>
          ) : null}

          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-xl border border-input py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
