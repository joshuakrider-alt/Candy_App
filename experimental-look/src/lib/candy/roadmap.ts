export type Risk = "Critical" | "High" | "Med";

export type PhaseColumn = {
  label: string;
  items: { id: string; text: string; shipped?: boolean }[];
};

export type Phase = {
  id: string;
  num: string;
  title: string;
  duration: string;
  goal: string;
  accent: "amber" | "cherry" | "mint" | "ink";
  progress: number;
  ship: string;
  columns: PhaseColumn[];
  metrics: { label: string; target: string; why: string }[];
};

export type QuickWin = {
  id: string;
  title: string;
  impact: string;
  time: string;
  cat: string;
  shipped?: boolean;
};

export type StackRow = {
  layer: string;
  original: string;
  preview: string;
  target: string;
  risk: Risk;
};

export type StatusTrack = {
  id: string;
  title: string;
  state: "done" | "waiting" | "blocked" | "next";
  detail: string;
};

export const QUICK_WINS: QuickWin[] = [
  {
    id: "jwt-cookie",
    title: "Move JWT off localStorage",
    impact: "Critical security",
    time: "Shipped here",
    cat: "Security",
    shipped: true,
  },
  {
    id: "rate-limit",
    title: "Add rate limiting + input validation",
    impact: "Blocks abuse",
    time: "3h on live API",
    cat: "Stability",
  },
  {
    id: "cors-r2",
    title: "Lock CORS + R2 presigned uploads",
    impact: "Prevents leaks",
    time: "2h",
    cat: "Security",
  },
  {
    id: "webhook-idempotency",
    title: "Stripe webhook idempotency + retries",
    impact: "No lost payments",
    time: "4h",
    cat: "Revenue",
  },
  {
    id: "sentry-ci",
    title: "Sentry + env validation + CI tests",
    impact: "Ship with confidence",
    time: "3h",
    cat: "DX",
  },
];

export const STACK: StackRow[] = [
  {
    layer: "Frontend",
    original: "vanilla HTML: buyer.html / seller.html",
    preview: "TanStack Start + React + Tailwind",
    target: "Shopify-grade catalog, embedded checkout",
    risk: "High",
  },
  {
    layer: "Auth",
    original: "JWT in localStorage (XSS risk)",
    preview: "httpOnly session cookies (Better Auth)",
    target: "Refresh rotation + admin TOTP",
    risk: "Critical",
  },
  {
    layer: "Payments",
    original: "Buyer pays platform. You touch money.",
    preview: "Direct Charges + 10% application fee",
    target: "Live Stripe Connect Express + Connect webhooks",
    risk: "High",
  },
  {
    layer: "Data",
    original: "Flat products, boolean in-stock",
    preview: "Catalog + inventory counts + atomic decrement",
    target: "Variants, ledger, reserved carts",
    risk: "High",
  },
  {
    layer: "Storage",
    original: "R2 planned, uploads_enabled: false",
    preview: "Static product photos",
    target: "Presigned R2 + CDN + EXIF strip",
    risk: "High",
  },
  {
    layer: "Ops",
    original: "No monitoring, no backups",
    preview: "Typed server functions + preview QA",
    target: "Sentry + Neon PITR + status page",
    risk: "Med",
  },
];

export const PHASES: Phase[] = [
  {
    id: "phase-0",
    num: "0",
    title: "Harden & Stabilize",
    duration: "Now — Weeks 1–2",
    goal: "Make the MVP unbreakable. No security holes, flaky payments, or env surprises. Earn trust before features.",
    accent: "amber",
    progress: 42,
    ship: "You can take real orders without worrying.",
    columns: [
      {
        label: "Frontend",
        items: [
          { id: "p0-f1", text: "Remove JWT from localStorage → httpOnly cookies", shipped: true },
          { id: "p0-f2", text: "Centralize API client with 401 refresh logic" },
          { id: "p0-f3", text: "Global error boundary + loading states", shipped: true },
          { id: "p0-f4", text: "Env guard: zod validation at build time" },
        ],
      },
      {
        label: "Backend",
        items: [
          { id: "p0-b1", text: "Rate limiting: 100 req/min IP + auth buckets" },
          { id: "p0-b2", text: "Zod input validation on every mutation", shipped: true },
          { id: "p0-b3", text: "CORS allowlist + R2 presigned URL hardening" },
          { id: "p0-b4", text: "Stripe webhooks: idempotency keys + retry log" },
          { id: "p0-b5", text: "Sentry + structured logs + request IDs" },
        ],
      },
      {
        label: "Trust",
        items: [
          { id: "p0-t1", text: "TOS, Privacy, Refund policy pages", shipped: true },
          { id: "p0-t2", text: "CI: lint, typecheck, tests on PR" },
          { id: "p0-t3", text: "Secret scan + env parity check" },
          { id: "p0-t4", text: "Runbook: refund + failed payout" },
        ],
      },
    ],
    metrics: [
      { label: "Security", target: "0 critical vulns", why: "Snyk + manual audit" },
      { label: "Payments", target: "99.9% webhook success", why: "No lost revenue" },
      { label: "Uptime", target: "99.5% on a status page", why: "Baseline" },
    ],
  },
  {
    id: "phase-1",
    num: "1",
    title: "Shopify-Grade Core",
    duration: "Weeks 3–6",
    goal: "Rebuild buying as a real catalog. Persistent cart, real inventory, Direct Charges, seller payouts that just work.",
    accent: "cherry",
    progress: 38,
    ship: "Feels like Shopify, not a demo.",
    columns: [
      {
        label: "Frontend",
        items: [
          { id: "p1-f1", text: "Typed app shell + design tokens", shipped: true },
          { id: "p1-f2", text: "Product tiles with stock counts", shipped: true },
          { id: "p1-f3", text: "Single-seller cart (required for Direct Charges)", shipped: true },
          { id: "p1-f4", text: "Stripe Elements + Apple Pay / GPay" },
          { id: "p1-f5", text: "Order states: paid → packing → ready → picked up", shipped: true },
        ],
      },
      {
        label: "Backend",
        items: [
          { id: "p1-b1", text: "Atomic inventory decrement (no oversell)", shipped: true },
          { id: "p1-b2", text: "Stripe Connect Express onboarding", shipped: true },
          { id: "p1-b3", text: "Direct Charge + application fee on checkout", shipped: true },
          { id: "p1-b4", text: "Image pipeline: Sharp + CDN + blurhash" },
          { id: "p1-b5", text: "Postgres FTS + neighborhood filters" },
        ],
      },
      {
        label: "Trust",
        items: [
          { id: "p1-t1", text: "Seller desk: queue, stock, payout snapshot", shipped: true },
          { id: "p1-t2", text: "Transparent 10% fee on every receipt", shipped: true },
          { id: "p1-t3", text: "Buyer pickup codes + order history", shipped: true },
          { id: "p1-t4", text: "5 seller walkthroughs, top 10 UX papercuts" },
        ],
      },
    ],
    metrics: [
      { label: "Conversion", target: "2.5%+ guest → paid", why: "Shopify baseline" },
      { label: "Cart", target: "<15% abandon on tech", why: "Reliability" },
      { label: "Payout", target: "T+2 days to sellers", why: "Trust" },
    ],
  },
  {
    id: "phase-2",
    num: "2",
    title: "Amazon-Grade Discovery",
    duration: "Weeks 7–10",
    goal: "Make it easy to discover, trust, and repeat. Reviews, coupons, and ops to handle disputes at neighborhood scale.",
    accent: "mint",
    progress: 6,
    ship: "Feels like a marketplace, not a listing page.",
    columns: [
      {
        label: "Frontend",
        items: [
          { id: "p2-f1", text: "Instant search + category facets" },
          { id: "p2-f2", text: "Reviews with photos + helpful votes" },
          { id: "p2-f3", text: "Coupons, promos, bundles" },
          { id: "p2-f4", text: "Installable PWA + order push" },
        ],
      },
      {
        label: "Backend",
        items: [
          { id: "p2-b1", text: "Neighborhood trending + co-purchase recs" },
          { id: "p2-b2", text: "Notification queue (email + SMS)" },
          { id: "p2-b3", text: "Dispute / refund state machine" },
          { id: "p2-b4", text: "Fee analytics, holds, audit trail" },
        ],
      },
      {
        label: "Trust",
        items: [
          { id: "p2-t1", text: "Phone + ID + kitchen checklist" },
          { id: "p2-t2", text: "Review moderation + fraud basics" },
          { id: "p2-t3", text: "City playbook: 1 zip → 5 blocks" },
        ],
      },
    ],
    metrics: [
      { label: "Search", target: "<120ms p95 query", why: "Amazon feel" },
      { label: "NPS", target: "45+ buyer, 40+ seller", why: "Retention" },
      { label: "Refund", target: "<2% orders, <24h", why: "Ops" },
    ],
  },
  {
    id: "phase-3",
    num: "3",
    title: "Scale & Moat",
    duration: "Weeks 11+",
    goal: "Scale beyond one neighborhood without breaking. Observe everything, rank on Google, stay legally a marketplace.",
    accent: "ink",
    progress: 0,
    ship: "Ready for city-wide and fundraising.",
    columns: [
      {
        label: "Frontend",
        items: [
          { id: "p3-f1", text: "Lighthouse 90+ on every route" },
          { id: "p3-f2", text: "A/B: pricing, checkout copy, rec slots" },
          { id: "p3-f3", text: "SEO: structured data + neighborhood pages" },
        ],
      },
      {
        label: "Backend",
        items: [
          { id: "p3-b1", text: "Read replicas + Redis cache" },
          { id: "p3-b2", text: "Queue jobs off the request path" },
          { id: "p3-b3", text: "OpenTelemetry + seller rate limits" },
        ],
      },
      {
        label: "Trust",
        items: [
          { id: "p3-t1", text: "GDPR delete/export + TOS tracking" },
          { id: "p3-t2", text: "Insurance + food-safety checklist" },
          { id: "p3-t3", text: "Candy Club + fundraising metrics deck" },
        ],
      },
    ],
    metrics: [
      { label: "Performance", target: "Lighthouse 90+ & <1.5s LCP", why: "SEO + conv" },
      { label: "Scale", target: "500 RPS with p95 <300ms", why: "City ready" },
      { label: "Growth", target: "35% MoM GMV for 3 months", why: "Moat" },
    ],
  },
];

export const STATUS_TRACKS: StatusTrack[] = [
  {
    id: "photos-identity",
    title: "Seller photos + Stripe Identity",
    state: "done",
    detail: "Merged on Candy_App (PR #11). Live identity_enabled: true. R2 uploads still off until the bucket exists.",
  },
  {
    id: "phase0-ci",
    title: "Pin dependencies + backend CI",
    state: "waiting",
    detail: "phase0-and-phase1.patch is ready and tested (69 passed). origin/main is still unpinned. Needs a merge decision.",
  },
  {
    id: "android-ci",
    title: "Android CI on candy-droid",
    state: "waiting",
    detail: "Workflow landed via PR #1. Pass/fail not re-checked after the first run.",
  },
  {
    id: "play-console",
    title: "Google Play closed testing",
    state: "blocked",
    detail: "Production access needs 12 opted-in testers for 14 days. Currently 0. Calendar-bound — not an engineering problem.",
  },
  {
    id: "direct-charges",
    title: "Direct Charges (never hold funds)",
    state: "next",
    detail: "This preview runs the target money flow. Live Flask still charges the platform account. Wire Connect Express next.",
  },
  {
    id: "soc2",
    title: "SOC 2 Type I evidence",
    state: "next",
    detail: "Policies, MFA screenshots, backup restore log, and a 1-page incident plan. Collect starting this quarter.",
  },
];

export const HARDENING = [
  {
    group: "Authentication",
    items: [
      "httpOnly, Secure, SameSite cookies (this preview)",
      "15 min access / 7 day refresh on the live API",
      "5 logins / 15 min / IP, lock after 10 fails",
      "Admin TOTP on admin.html",
      "Force logout on password change",
    ],
  },
  {
    group: "API & payments",
    items: [
      "Reject Connect webhooks with a bad signature (401, not 503)",
      "Idempotency keys on order create",
      "HSTS + CSP + X-Frame-Options: DENY",
      "DELETE /me requires password re-entry",
    ],
  },
  {
    group: "Data & storage",
    items: [
      "Neon SSL required + encryption at rest",
      "R2 private bucket, public CDN only",
      "Presigned PUT: jpeg/png, 8MB, no list for anon",
      "Pickup codes from crypto-secure random (CL-XXXXX)",
    ],
  },
];

export const SOC2_NOW = [
  "Folder: /compliance/evidence/2026-Q4/",
  "SECURITY.md in the repo with the hardening checklist",
  "GitHub Action: pip-audit + npm audit",
  "Neon PITR on, Render log retention 1 year",
  "1-page Incident Response Plan in a private doc",
  "Screenshot MFA on Render, Vercel, Neon, Stripe, GitHub",
];
