import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { GROK_PROVIDERS, authEnabled, authClient, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authEnabled) return;
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0] || "Neighbor",
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
      }
      window.location.href = "/shop";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-md gap-6 rounded-[28px] bg-paper p-6 shadow-[var(--shadow-card)]">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Account</p>
        <h1 className="font-display text-4xl font-extrabold">
          {mode === "in" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Buyers shop and collect. Sellers apply, then stock a catalog.
        </p>
      </div>

      {authEnabled ? (
        <>
          <div className="grid gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <Button
                key={provider.providerId}
                type="button"
                variant="secondary"
                onClick={() => signIn(provider.providerId, { callbackURL: "/shop" })}
              >
                Continue with {provider.label}
              </Button>
            ))}
          </div>
          <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-muted">
            or use email
          </p>
          <form className="grid gap-3" onSubmit={onSubmit}>
            {mode === "up" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            type="button"
            className="text-sm font-bold text-cherry"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">Sign-in is disabled.</p>
      )}

      <Link to="/" className="text-sm font-bold text-muted">
        Back home
      </Link>
    </main>
  );
}
