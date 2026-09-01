import { cn } from '@/lib/utils';

interface FollowButtonProps {
  memberId: string;
  myMemberId: string;
  isFollowing: boolean;
  onFollow: (id: string) => void;
  onUnfollow: (id: string) => void;
  pending?: boolean;
}

export function FollowButton({
  memberId,
  myMemberId,
  isFollowing,
  onFollow,
  onUnfollow,
  pending,
}: FollowButtonProps) {
  if (memberId === myMemberId) return null;

  return (
    <button
      type="button"
      onClick={() => (isFollowing ? onUnfollow(memberId) : onFollow(memberId))}
      disabled={pending}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
        isFollowing
          ? 'border border-input bg-background text-foreground hover:border-destructive hover:text-destructive'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
