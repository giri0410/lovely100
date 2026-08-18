import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Pencil, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useSession } from "@/hooks/useChallenge";
import {
  claimFirstAdmin,
  deleteUser,
  getAdminStatus,
  listUsers,
  sendPasswordReset,
  setUserAdmin,
  updateUserProfile,
  type AdminUserRow,
} from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — 100 Days Together" },
      { name: "description", content: "Manage member accounts, roles and profiles for the 100 Days Together challenge." },
      { property: "og:title", content: "Admin — 100 Days Together" },
      { property: "og:description", content: "Member and role administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { userId, loading } = useSession();
  const status = useServerFn(getAdminStatus);
  const claim = useServerFn(claimFirstAdmin);
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["admin-status", userId],
    enabled: !!userId,
    queryFn: () => status(),
  });

  const claimMutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => {
      toast.success("You are now an admin");
      qc.invalidateQueries({ queryKey: ["admin-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || (userId && statusQuery.isLoading)) {
    return <Centered>Checking your access…</Centered>;
  }

  if (!userId) {
    return (
      <Centered>
        <p>You need to sign in to reach the admin area.</p>
        <Link to="/auth" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </Centered>
    );
  }

  if (!statusQuery.data?.isAdmin) {
    return (
      <Centered>
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-xl">Admin access required</h1>
        {statusQuery.data?.adminCount === 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              No admin exists yet. As the first signed-in member you can claim the admin role.
            </p>
            <button
              className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={claimMutation.isPending}
              onClick={() => claimMutation.mutate()}
            >
              {claimMutation.isPending ? "Claiming…" : "Claim admin access"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Ask an existing admin to grant your account access.
          </p>
        )}
        <Link to="/today" className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the app
        </Link>
      </Centered>
    );
  }

  return <AdminConsole currentUserId={userId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="surface w-full max-w-md p-8 text-center">{children}</div>
    </div>
  );
}

function AdminConsole({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null);

  const fetchUsers = useServerFn(listUsers);
  const roleFn = useServerFn(setUserAdmin);
  const profileFn = useServerFn(updateUserProfile);
  const deleteFn = useServerFn(deleteUser);
  const resetFn = useServerFn(sendPasswordReset);

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const onError = (e: Error) => toast.error(e.message);

  const roleMutation = useMutation({
    mutationFn: (v: { userId: string; makeAdmin: boolean }) => roleFn({ data: v }),
    onSuccess: () => { toast.success("Role updated"); refresh(); },
    onError,
  });
  const profileMutation = useMutation({
    mutationFn: (v: { profileId: string; name: string; relationship: string }) => profileFn({ data: v }),
    onSuccess: () => { toast.success("Profile updated"); setEditing(null); refresh(); },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (v: { userId: string }) => deleteFn({ data: v }),
    onSuccess: () => { toast.success("Account deleted"); setConfirmDelete(null); refresh(); },
    onError,
  });
  const resetMutation = useMutation({
    mutationFn: (v: { email: string }) => resetFn({ data: v }),
    onSuccess: () => toast.success("Password reset email sent"),
    onError,
  });

  const users = usersQuery.data ?? [];
  const term = query.trim().toLowerCase();
  const filtered = term
    ? users.filter((u) =>
        [u.email, u.name, u.coupleName].some((v) => v?.toLowerCase().includes(term)),
      )
    : users;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="px-5 pb-2 pt-7 md:px-8">
        <Link to="/today" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the app
        </Link>
        <p className="eyebrow mt-4">Administration</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl">
          <UserCog className="size-6 text-primary" /> Members
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} account{users.length === 1 ? "" : "s"} · {users.filter((u) => u.isAdmin).length} admin
        </p>
      </header>

      <div className="px-5 md:px-8">
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by email, name or couple"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {usersQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}
          </div>
        ) : usersQuery.error ? (
          <div className="surface mt-6 p-6 text-center text-sm text-muted-foreground">
            {(usersQuery.error as Error).message}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filtered.map((u) => (
              <article key={u.authUserId} className="surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name ?? "No profile"}</p>
                    <p className="truncate text-sm text-muted-foreground">{u.email ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {u.coupleName ? `${u.coupleName} · ${u.relationship}` : "Not part of a couple"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Joined {new Date(u.createdAt).toLocaleDateString()}
                      {u.lastSignInAt ? ` · Last seen ${new Date(u.lastSignInAt).toLocaleDateString()}` : ""}
                      {u.emailConfirmed ? "" : " · Email unverified"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Admin</span>
                    <Switch
                      checked={u.isAdmin}
                      disabled={u.authUserId === currentUserId || roleMutation.isPending}
                      onCheckedChange={(v) => roleMutation.mutate({ userId: u.authUserId, makeAdmin: v })}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton disabled={!u.profileId} onClick={() => setEditing(u)}>
                    <Pencil className="size-3.5" /> Edit profile
                  </ActionButton>
                  <ActionButton
                    disabled={!u.email || resetMutation.isPending}
                    onClick={() => resetMutation.mutate({ email: u.email! })}
                  >
                    <KeyRound className="size-3.5" /> Reset password
                  </ActionButton>
                  <ActionButton
                    disabled={u.authUserId === currentUserId}
                    destructive
                    onClick={() => setConfirmDelete(u)}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </ActionButton>
                </div>
              </article>
            ))}
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No members match that search.</p>
            ) : null}
          </div>
        )}
      </div>

      <EditDialog
        user={editing}
        pending={profileMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(name, relationship) =>
          editing?.profileId && profileMutation.mutate({ profileId: editing.profileId, name, relationship })
        }
      />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.email} will lose access permanently. Their challenge history stays with the couple.
          </p>
          <DialogFooter>
            <button className="rounded-full px-4 py-2 text-sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-60"
              disabled={deleteMutation.isPending}
              onClick={() => confirmDelete && deleteMutation.mutate({ userId: confirmDelete.authUserId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function EditDialog({
  user,
  pending,
  onClose,
  onSave,
}: {
  user: AdminUserRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (name: string, relationship: string) => void;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");

  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => {
        if (o && user) {
          setName(user.name ?? "");
          setRelationship(user.relationship ?? "partner");
        }
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit member profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Display name</span>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Relationship</span>
            <Input className="mt-1" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <button className="rounded-full px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={pending || !name.trim()}
            onClick={() => onSave(name, relationship || "partner")}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
