"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiRequestError, auth, homeFor, safeNext } from "@/lib/api";
import { useRefreshSession } from "@/lib/use-session";

type Mode = "login" | "signup";

const COPY = {
  login: {
    title: "Sign in",
    description: "Welcome back. Sign in to order, track pickups, or run your shop.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  signup: {
    title: "Create an account",
    description: "One account to order from every neighborhood shop.",
    submit: "Create account",
    busy: "Creating account…",
  },
} as const;

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const refreshSession = useRefreshSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];
  const target = safeNext(next);
  const otherHref = (path: string) => (target ? `${path}?next=${encodeURIComponent(target)}` : path);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(null);
    try {
      const { user } =
        mode === "login"
          ? await auth.login(email, password)
          : await auth.signup(String(form.get("name") ?? ""), email, password);
      await refreshSession();
      router.replace(target ?? homeFor(user));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? sentence(err.message) : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-candy">
      <CardHeader>
        <CardTitle className="font-heading text-3xl font-extrabold text-cola">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <Field label="Your name" name="name" autoComplete="name" required />
          )}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="h-11 rounded-full text-base font-extrabold">
            {busy ? copy.busy : copy.submit}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link href={otherHref("/signup")} className="font-bold text-cherry-deep underline">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href={otherHref("/login")} className="font-bold text-cherry-deep underline">
                Sign in
              </Link>
            </>
          )}
        </p>
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

/** Flask's messages are lower-case fragments ("invalid email or password"). */
function sentence(message: string) {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
