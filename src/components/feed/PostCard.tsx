import { Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Post } from '@/data';
import { cn } from '@/lib/utils';

interface PostCardProps {
  post: Post;
  myMemberId: string;
  onDelete: (postId: string) => void;
  deleting?: boolean;
}

export function PostCard({ post, myMemberId, onDelete, deleting }: PostCardProps) {
  const isOwn = post.author_member_id === myMemberId;
  const initial = post.author_name?.[0]?.toUpperCase() ?? '?';

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{post.author_name}</p>
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-tiny text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
              {isOwn ? (
                <button
                  type="button"
                  aria-label="Delete post"
                  onClick={() => onDelete(post.id)}
                  disabled={deleting}
                  className={cn(
                    'rounded-full border border-input p-1 text-muted-foreground transition-colors hover:text-destructive',
                    deleting && 'opacity-40',
                  )}
                >
                  <Trash2 className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-sm leading-relaxed">{post.body}</p>
        </div>
      </div>
    </li>
  );
}
