import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/data';
import type { Post, Follow, DiscoverRow } from '@/data';

const PAGE_SIZE = 20;

export function useFeed(memberId: string | undefined) {
  const [pages, setPages] = useState<Post[][]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const initialQuery = useQuery({
    queryKey: ['feed', memberId, 'page-0'],
    enabled: !!memberId,
    queryFn: async () => {
      const posts = await api.listFeedPosts({ memberId: memberId!, limit: PAGE_SIZE });
      setPages([posts]);
      setCursor(posts[posts.length - 1]?.created_at);
      setHasMore(posts.length === PAGE_SIZE);
      return posts;
    },
  });

  const loadMore = async () => {
    if (!memberId || loading || !hasMore) return;
    setLoading(true);
    try {
      const posts = await api.listFeedPosts({ memberId, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
      setPages((prev) => [...prev, posts]);
      setCursor(posts[posts.length - 1]?.created_at);
      setHasMore(posts.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  };

  return {
    pages,
    isLoading: initialQuery.isLoading,
    loadMore,
    hasMore,
    loadingMore: loading,
    refetch: () => {
      setPages([]);
      setCursor(undefined);
      setHasMore(true);
      initialQuery.refetch();
    },
  };
}

export function useFollowing(memberId: string | undefined) {
  return useQuery({
    queryKey: ['following', memberId],
    enabled: !!memberId,
    queryFn: (): Promise<Follow[]> => api.listFollowing(memberId!),
  });
}

export function useFollowMutation(myMemberId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['following', myMemberId] });

  const follow = useMutation({
    mutationFn: (targetMemberId: string) =>
      api.followMember({ followerMemberId: myMemberId, followingMemberId: targetMemberId }),
    onSuccess: invalidate,
  });

  const unfollow = useMutation({
    mutationFn: (targetMemberId: string) =>
      api.unfollowMember({ followerMemberId: myMemberId, followingMemberId: targetMemberId }),
    onSuccess: invalidate,
  });

  return { follow, unfollow };
}

export function useCreatePostMutation(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { journeyId: string; logId: string | null; body: string }) =>
      api.createPost({ authorMemberId: memberId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed', memberId] }),
  });
}

export function useDeletePostMutation(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.deletePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed', memberId] }),
  });
}

export function useDiscoverMembers(memberId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['discover', memberId],
    enabled: !!memberId,
    queryFn: (): Promise<DiscoverRow[]> => api.discoverMembers({ memberId: memberId!, limit }),
  });
}
