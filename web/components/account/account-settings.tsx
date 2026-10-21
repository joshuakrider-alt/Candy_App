"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sentence } from "@/components/orders/use-order-actions";
import { ApiRequestError, api, auth } from "@/lib/api";
import type { User } from "@/lib/types";
import { useRefreshSession } from "@/lib/use-session";

const message = (error: unknown) =>
  error instanceof ApiRequestError ? sentence(error.message) : "Something went wrong. Try again.";

/** Change password (PUT /me/password) and delete account (DELETE /me), new on the website. */
export function AccountSettings({ user }: { user: User }) {
  const router = useRouter();
  const refreshSession = useRefreshSession();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await api.put("/me/password", {
        current_password: data.get("current_password"),
        new_password: data.get("new_password"),
      });
      form.reset();
      toast.success("Password changed.");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setDeleteError(null);
    try {
      await api.delete("/me", { password });
      await auth.logout().catch(() => {});
      await refreshSession();
      toast.success("Your account was deleted.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setDeleteError(message(error));
      setBusy(false);
    }
  }

  async function signOut() {
    await auth.logout().catch(() => {});
    await refreshSession();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg bg-paper/95 p-5 shadow-candy">
        <h2 className="font-heading text-2xl font-bold text-cola">{user.name}</h2>
        <p className="text-muted-foreground">{user.email}</p>
        <Button variant="outline" onClick={signOut} className="mt-4 rounded-full font-extrabold">
          Sign out
        </Button>
      </section>

      {user.has_password && (
        <section className="rounded-lg bg-paper/95 p-5 shadow-candy">
          <h2 className="mb-3 font-heading text-2xl font-bold text-cola">Change password</h2>
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              Current password
              <Input name="current_password" type="password" autoComplete="current-password" required className="h-11 bg-white" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              New password (at least 8 characters)
              <Input name="new_password" type="password" autoComplete="new-password" minLength={8} required className="h-11 bg-white" />
            </label>
            <Button type="submit" disabled={busy} className="self-start rounded-full px-6 font-extrabold">
              Change password
            </Button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-destructive/30 bg-paper/95 p-5 shadow-candy">
        <h2 className="font-heading text-2xl font-bold text-cola">Delete account</h2>
        {user.role === "admin" ? (
          // Flask refuses (accounts.assert_self_deletable) so the platform is never left without an admin.
          <p className="mt-1 text-sm text-muted-foreground">Admin accounts can&apos;t be deleted here. Ask another admin to remove this account.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Removes your account for good. Unpaid orders are cancelled and their items go back on the shelf. Paid orders
              stay on the shop&apos;s records without your name.
            </p>
            <Button variant="destructive" onClick={() => setDeleting(true)} className="mt-4 rounded-full font-extrabold">
              Delete my account
            </Button>
          </>
        )}
      </section>

      <Dialog open={deleting} onOpenChange={(open) => !busy && setDeleting(open)}>
        <DialogContent>
          <form onSubmit={deleteAccount} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl text-cola">Delete your account?</DialogTitle>
              <DialogDescription>This can&apos;t be undone. Enter your password to confirm.</DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              Password
              <Input name="password" type="password" autoComplete="current-password" required className="h-11 bg-white" />
            </label>
            {deleteError && (
              <p role="alert" className="text-sm font-bold text-destructive">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(false)} className="rounded-full">
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" disabled={busy} className="rounded-full font-extrabold">
                Delete for good
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
