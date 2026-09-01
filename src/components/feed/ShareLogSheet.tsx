import { useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useCreatePostMutation } from '@/hooks/useFeed';

interface ShareLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myMemberId: string;
  journeyId: string;
  logId: string | null;
  defaultBody?: string;
  context?: string;
}

export function ShareLogSheet({
  open,
  onOpenChange,
  myMemberId,
  journeyId,
  logId,
  defaultBody = '',
  context,
}: ShareLogSheetProps) {
  const [body, setBody] = useState(defaultBody);
  const createPost = useCreatePostMutation(myMemberId);

  const submit = () => {
    if (!body.trim()) {
      toast.error('Write something to share');
      return;
    }
    createPost.mutate(
      { journeyId, logId, body: body.trim() },
      {
        onSuccess: () => {
          toast.success('Shared to feed');
          setBody(defaultBody);
          onOpenChange(false);
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{context ?? 'Share to feed'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="What do you want to share?"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={createPost.isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {createPost.isPending ? 'Sharing…' : 'Share'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-input px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
