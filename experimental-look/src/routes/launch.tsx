import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Check,
  CircleAlert,
  Clock,
  Flag,
  GitBranch,
  Lock,
  MapPin,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyFlow } from "@/components/money-flow";
import {
  HARDENING,
  PHASES,
  QUICK_WINS,
  SOC2_NOW,
  STACK,
  STATUS_TRACKS,
  type Phase,
} from "@/lib/candy/roadmap";
import { formatCents, splitCharge } from "@/lib/candy/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/launch")({ component: LaunchPage });

const TABS = [
  { id: "roadmap", label: "Roadmap" },
  { id: "money", label: "Money" },
  { id: "trust", label: "Trust" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const HQ_KEY = "candy-lady-hq-v1";

function loadChecks(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(HQ_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function LaunchPage() {
  const [tab, setTab] = useState<Tab>("roadmap");
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [orderDollars, setOrderDollars] = useState(20);
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const phase = PHASES[phaseIdx] ?? PHASES[0]!;
  const split = splitCharge(Math.round(orderDollars * 100));

  function toggle(id: string) {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(HQ_KEY, JSON.stringify(next));
      return next;
    });
  }

  const winDone = useMemo(() => {
    return QUICK_WINS.filter((w) => w.shipped || checks[w.id]).length;
  }, [checks]);

  return (
    <main className="flex flex-col gap-8">
      <header className="grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 shadow-[var(--shadow-card)]">
            <Flag className="size-3.5 text-cherry" />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">
              Target: Shopify-grade UX · Amazon-grade ops
            </span>
          </div>
          <h1 className="mt-4 max-w-[16ch] font-display text-5xl font-extrabold md:text-6xl">
            From neighborhood MVP to city-scale.
          </h1>
          <p className="mt-3 max-w-[54ch] text-base leading-relaxed text-muted">
            Direct Charges so money never sits in our bank. Four phases, owners, and
            measurable exits. This preview already runs the payout model — the live Flask
            app still needs Connect wired.
          </p>
        </div>
        <QuickWinsCard done={winDone} checks={checks} onToggle={toggle} />
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-extrabold transition-colors",
              tab === item.id ? "bg-cola text-cream" : "bg-paper text-ink shadow-[var(--shadow-card)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "roadmap" ? (
        <RoadmapTab phaseIdx={phaseIdx} setPhaseIdx={setPhaseIdx} phase={phase} checks={checks} onToggle={toggle} />
      ) : null}
      {tab === "money" ? <MoneyTab split={split} orderDollars={orderDollars} setOrderDollars={setOrderDollars} /> : null}
      {tab === "trust" ? <TrustTab /> : null}
    </main>
  );
}

function QuickWinsCard({
  done,
  checks,
  onToggle,
}: {
  done: number;
  checks: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-cherry">
            Ship this week
          </p>
          <h2 className="font-display text-2xl font-extrabold">Quick wins</h2>
        </div>
        <span className="rounded-full bg-cola px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-cream">
          {done}/{QUICK_WINS.length}
        </span>
      </div>
      <ul className="mt-3 grid gap-1.5">
        {QUICK_WINS.map((win) => {
          const on = Boolean(win.shipped || checks[win.id]);
          return (
            <li key={win.id}>
              <button
                type="button"
                onClick={() => {
                  if (!win.shipped) onToggle(win.id);
                }}
                className="flex w-full items-start gap-3 rounded-[14px] px-2 py-2 text-left hover:bg-cream"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border",
                    on ? "border-mint bg-mint text-cream" : "border-ink/20 bg-paper",
                  )}
                >
                  {on ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold leading-tight">{win.title}</span>
                    <span className="rounded-full bg-foam px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                      {win.cat}
                    </span>
                  </span>
                  <span className="mt-0.5 flex gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Timer className="size-3" />
                      {win.time}
                    </span>
                    <span className="text-cherry">{win.impact}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-[14px] bg-foam px-3 py-2 text-xs leading-relaxed text-muted">
        Do these before any new feature. One lost Connect webhook costs more than a week of UI polish.
      </p>
    </section>
  );
}

function RoadmapTab({
  phaseIdx,
  setPhaseIdx,
  phase,
  checks,
  onToggle,
}: {
  phaseIdx: number;
  setPhaseIdx: (n: number) => void;
  phase: Phase;
  checks: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PHASES.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPhaseIdx(idx)}
            className={cn(
              "rounded-[20px] border p-4 text-left transition-colors",
              idx === phaseIdx
                ? "border-cola bg-cola text-cream"
                : "border-transparent bg-paper text-ink shadow-[var(--shadow-card)]",
            )}
          >
            <p className={cn("text-[10px] font-extrabold uppercase tracking-[0.14em]", idx === phaseIdx ? "text-cream/70" : "text-muted")}>
              Phase {item.num} · {item.duration.split("—")[0]}
            </p>
            <p className="mt-1 font-display text-xl font-extrabold leading-tight">{item.title}</p>
            <div className={cn("mt-3 h-1 overflow-hidden rounded-full", idx === phaseIdx ? "bg-cream/20" : "bg-foam")}>
              <div
                className={cn("h-full", idx === phaseIdx ? "bg-cream" : "bg-cherry")}
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-card)]">
        <div className="border-b border-ink/8 bg-cream px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
                Phase {phase.num} · {phase.duration}
              </p>
              <h2 className="mt-1 font-display text-4xl font-extrabold">{phase.title}</h2>
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">{phase.goal}</p>
            </div>
            <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-extrabold shadow-[var(--shadow-card)]">
              {phase.progress}% shipped in this preview
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {phase.metrics.map((metric) => (
              <div key={metric.label} className="rounded-[16px] bg-paper p-3.5 shadow-[var(--shadow-card)]">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  {metric.label}
                </p>
                <p className="mt-1 text-sm font-extrabold">{metric.target}</p>
                <p className="mt-1 text-xs text-muted">{metric.why}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid divide-y divide-ink/8 md:grid-cols-3 md:divide-x md:divide-y-0">
          {phase.columns.map((col) => (
            <div key={col.label} className="p-5 sm:p-6">
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
                {col.label} · {col.items.length}
              </p>
              <ul className="grid gap-2.5">
                {col.items.map((item) => {
                  const on = Boolean(item.shipped || checks[item.id]);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.shipped) onToggle(item.id);
                        }}
                        className="flex w-full items-start gap-2.5 text-left"
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border",
                            on ? "border-mint bg-mint text-cream" : "border-ink/20 bg-paper",
                          )}
                        >
                          {on ? <Check className="size-3" /> : null}
                        </span>
                        <span className={cn("text-sm leading-snug", on ? "text-muted line-through" : "")}>
                          {item.text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 bg-cream px-5 py-4 sm:px-8">
          <p className="text-xs font-bold text-muted">Exit: {phase.ship}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="compact"
              disabled={phaseIdx === 0}
              onClick={() => setPhaseIdx(Math.max(0, phaseIdx - 1))}
            >
              Prev
            </Button>
            <Button
              variant="cola"
              size="compact"
              disabled={phaseIdx === PHASES.length - 1}
              onClick={() => setPhaseIdx(Math.min(PHASES.length - 1, phaseIdx + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] bg-paper shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 px-5 py-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold">Current vs target stack</h2>
            <p className="text-sm text-muted">Why Shopify/Amazon feels different — the primitives.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-cream text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Layer</th>
                <th className="px-5 py-3">Live Flask app</th>
                <th className="px-5 py-3">This preview</th>
                <th className="px-5 py-3">Target</th>
                <th className="px-5 py-3">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {STACK.map((row) => (
                <tr key={row.layer}>
                  <td className="px-5 py-3 font-extrabold">{row.layer}</td>
                  <td className="px-5 py-3 text-muted">{row.original}</td>
                  <td className="px-5 py-3 font-bold">{row.preview}</td>
                  <td className="px-5 py-3">{row.target}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                        row.risk === "Critical"
                          ? "bg-cherry/12 text-cherry"
                          : row.risk === "High"
                            ? "bg-foam text-ink"
                            : "bg-cream text-muted",
                      )}
                    >
                      {row.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-extrabold">Status by track</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {STATUS_TRACKS.map((track) => (
            <li key={track.id} className="rounded-[20px] bg-paper p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold">{track.title}</p>
                <Badge
                  variant={
                    track.state === "done" ? "mint" : track.state === "blocked" ? "cherry" : "cream"
                  }
                >
                  {track.state}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{track.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MoneyTab({
  split,
  orderDollars,
  setOrderDollars,
}: {
  split: ReturnType<typeof splitCharge>;
  orderDollars: number;
  setOrderDollars: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-cherry">
            Direct Charges + application fee
          </p>
          <h2 className="mt-1 font-display text-3xl font-extrabold">We never touch their money.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Buyer pays the seller’s connected Stripe account. Stripe peels off the 10%
            application fee. Funds never enter the platform bank — the DoorDash / Etsy /
            Shopify marketplace model. One checkout = one seller.
          </p>
          <div className="mt-5">
            <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted" htmlFor="gmv">
              Sample order {formatCents(Math.round(orderDollars * 100))}
            </label>
            <input
              id="gmv"
              type="range"
              min={5}
              max={80}
              value={orderDollars}
              onChange={(e) => setOrderDollars(Number(e.target.value))}
              className="mt-2 w-full accent-cherry"
            />
          </div>
          <div className="mt-4">
            <MoneyFlow split={split} sellerName="Ms. Kiki" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <article className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
            <Banknote className="size-5 text-cherry" />
            <h3 className="mt-2 font-display text-2xl font-extrabold">Winter launch fees</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-relaxed">
              <li>Platform fee: 10% (configurable).</li>
              <li>Stripe: 2.9% + 30¢ + 0.25% Connect, paid by the seller.</li>
              <li>First 10 sellers: 0% platform fee in November, if you want trust more than take rate.</li>
            </ul>
          </article>
          <article className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
            <Lock className="size-5 text-cherry" />
            <h3 className="mt-2 font-display text-2xl font-extrabold">Why this model</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-muted">
              <li>Trust: sellers see “Paid by Stripe to your bank,” not “Paid by the platform.”</li>
              <li>Legal: avoid money-transmission licensing in most states.</li>
              <li>SOC 2: no card data, no seller balances on our books.</li>
            </ul>
          </article>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/shop">Try a Direct Charge</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/apply">Seller Connect flow</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: "Connect Express",
            body: "Sellers finish KYC on Stripe. We store an account id and charges_enabled — never a bank number or ID photo.",
          },
          {
            icon: MapPin,
            title: "Single-seller cart",
            body: "Direct Charges cannot split one payment across two ladies. Shop this spot, pay that spot.",
          },
          {
            icon: GitBranch,
            title: "Connect webhooks",
            body: "Live API needs a Connect endpoint for checkout.session.completed and account.updated — separate secret from platform webhooks.",
          },
        ].map((card) => (
          <article key={card.title} className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
            <card.icon className="size-5 text-cherry" />
            <h3 className="mt-2 font-display text-2xl font-extrabold">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function TrustTab() {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-3">
        {HARDENING.map((group) => (
          <article key={group.group} className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-display text-2xl font-extrabold">{group.group}</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-relaxed">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-mint" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex items-center gap-2">
          <CircleAlert className="size-5 text-cherry" />
          <h2 className="font-display text-2xl font-extrabold">Collect this quarter for SOC 2</h2>
        </div>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">
          Type I is design of controls at a point in time. Type II is 6–12 months of the same
          controls operating. Start the evidence folder now — auditors buy history.
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {SOC2_NOW.map((item, idx) => (
            <li key={item} className="flex gap-3 rounded-[14px] bg-cream px-3 py-2 text-sm">
              <span className="font-extrabold tabular-nums text-muted">{idx + 1}</span>
              {item}
            </li>
          ))}
        </ol>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <Clock className="size-5 text-cherry" />
          <h3 className="mt-2 font-display text-2xl font-extrabold">Incident plan</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Severity 1 (breach or payments down): take the API offline, notify sellers within
            one hour, revert the last deploy, restore Neon, write a post-mortem in 48 hours.
          </p>
        </article>
        <article className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <ShieldCheck className="size-5 text-cherry" />
          <h3 className="mt-2 font-display text-2xl font-extrabold">Policies</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Privacy, refunds, and marketplace terms are live in this app. The live site still
            needs the same pages plus a one-page InfoSec policy.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-extrabold">
            <Link to="/privacy" className="text-cherry">
              Privacy
            </Link>
            <Link to="/refunds" className="text-cherry">
              Refunds
            </Link>
            <Link to="/terms" className="text-cherry">
              Terms
            </Link>
          </div>
        </article>
        <article className="rounded-[20px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <Flag className="size-5 text-cherry" />
          <h3 className="mt-2 font-display text-2xl font-extrabold">This week</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Merge the Phase 0/1 CI patch, create the R2 bucket, and keep Direct Charges as the
            only checkout path on the live API.
          </p>
        </article>
      </section>
    </div>
  );
}
