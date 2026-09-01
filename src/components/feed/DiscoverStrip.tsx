import type { DiscoverRow } from '@/data';
import { FollowButton } from './FollowButton';

interface DiscoverStripProps {
  suggestions: DiscoverRow[];
  myMemberId: string;
  followingIds: Set<string>;
  onFollow: (id: string) => void;
  onUnfollow: (id: string) => void;
  pending?: boolean;
}

export function DiscoverStrip({
  suggestions,
  myMemberId,
  followingIds,
  onFollow,
  onUnfollow,
  pending,
}: DiscoverStripProps) {
  const visible = suggestions.filter((s) => !followingIds.has(s.member_id));
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="eyebrow px-1">People to follow</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {visible.map((s) => {
          const initial = s.name[0]?.toUpperCase() ?? '?';
          return (
            <div
              key={s.member_id}
              className="surface flex shrink-0 flex-col items-center gap-2 p-4 text-center"
              style={{ minWidth: '120px' }}
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initial}
              </div>
              <p className="text-xs font-medium leading-tight">{s.name}</p>
              <FollowButton
                memberId={s.member_id}
                myMemberId={myMemberId}
                isFollowing={followingIds.has(s.member_id)}
                onFollow={onFollow}
                onUnfollow={onUnfollow}
                {...(pending !== undefined && { pending })}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
