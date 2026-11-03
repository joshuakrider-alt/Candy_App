"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTACT_EMAIL } from "@/components/site-links";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiRequestError, api } from "@/lib/api";

type RequestAnswer = { status: "accepted"; email_enabled: boolean; expires_in_minutes: number };

/** /forgot-password: ask for a reset link. The answer is the same for every address. */
export function ForgotPasswordForm() {
  const [answer, setAnswer] = useState<RequestAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api.post<RequestAnswer>("/password-reset/request", { email }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? sentence(err.message) : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-candy">
      <CardHeader>
        <CardTitle className="font-heading text-3xl font-extrabold text-cola">Forgot your password?</CardTitle>
        <CardDescription>Enter the email you sign in with and we&apos;ll send you a link to choose a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        {answer ? (
          <div role="status" className="flex flex-col gap-3 text-cola">
            {answer.email_enabled ? (
              <p>
                If an account uses that email, a reset link is on its way. It works once and expires in{" "}
                {answer.expires_in_minutes} minutes. Check your spam folder if it doesn&apos;t arrive.
              </p>
            ) : (
              <p>
                Password reset emails aren&apos;t switched on yet. Email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold text-cherry-deep underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                from the address on your account and we&apos;ll help you get back in.
              </p>
            )}
            <Link href="/login" className="font-bold text-cherry-deep underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={busy} className="h-11 rounded-full text-base font-extrabold">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="font-bold text-cherry-deep underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * /reset-password#token=...: choose a new password. The token comes in the
 * address's fragment, which never reaches a server, and is cleared from the
 * address bar as soon as it has been read.
 */
export function ResetPasswordForm() {
  // undefined until the fragment has been read in the browser.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const found = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(found || null);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/password-reset/confirm", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? sentence(err.message) : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-candy">
      <CardHeader>
        <CardTitle className="font-heading text-3xl font-extrabold text-cola">Choose a new password</CardTitle>
        <CardDescription>Use at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div role="status" className="flex flex-col gap-4 text-cola">
            <p>Your password is updated. Sign in with the new one.</p>
            <Link href="/login" className={buttonVariants({ className: "h-11 rounded-full text-base font-extrabold" })}>
              Sign in
            </Link>
          </div>
        ) : token === null ? (
          <div role="alert" className="flex flex-col gap-3 text-cola">
            <p>This reset link is missing its code. Open the link from the email again, or ask for a new one.</p>
            <Link href="/forgot-password" className="font-bold text-cherry-deep underline">
              Send a new reset link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            {error && (
              <ErrorText>
                {error}{" "}
                {/expired|invalid/i.test(error) && (
                  <Link href="/forgot-password" className="underline">
                    Send a new link
                  </Link>
                )}
              </ErrorText>
            )}
            <Button type="submit" disabled={busy || token === undefined} className="h-11 rounded-full text-base font-extrabold">
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
      {label}
      <Input name={name} className="h-11 rounded-md bg-white text-base" {...props} />
    </label>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">
      {children}
    </p>
  );
}

/** Flask's messages are lower-case fragments ("a valid email is required"). */
function sentence(message: string) {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
