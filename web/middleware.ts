import { NextRequest, NextResponse } from "next/server";

// Kept in step with SESSION_COOKIE in lib/session.ts, which is server-only
// and so cannot be imported here.
const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-cl_session" : "cl_session";

/** Pages that need a signed-in visitor. Flask still checks every permission. */
const SIGNED_IN = ["/account", "/seller", "/admin"];

/**
 * Pages that get a per-request nonce in their Content Security Policy.
 *
 * A nonce only works on a page rendered for each request, so it cannot go on
 * the public pages, which are cached and refreshed every 30 to 60 seconds so
 * they never wait on a sleeping Render API. Those get a fixed policy instead
 * (see `publicPolicy`). Every route listed here must render dynamically: the
 * signed-in layouts read the session, and the sign-in pages opt in with
 * `dynamic = "force-dynamic"`.
 */
const NONCE_PATHS = [...SIGNED_IN, "/login", "/signup", "/checkout"];

const isUnder = (pathname: string, roots: string[]) =>
  roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));

const dev = process.env.NODE_ENV !== "production";
// Vercel's preview toolbar and comments load from vercel.live.
const preview = process.env.VERCEL_ENV === "preview";

function policy(scriptSrc: string) {
  const live = preview ? " https://vercel.live" : "";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${dev ? " 'unsafe-eval'" : ""}${live}`,
    // Shop colours and next/font use inline styles.
    `style-src 'self' 'unsafe-inline'${live}`,
    // Seller logos may be on any https host (storefront.py accepts any), so
    // images are allowed from any https source.
    "img-src 'self' data: blob: https:",
    `font-src 'self'${live}`,
    `connect-src 'self'${live}`,
    `frame-src 'self'${live}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Public, cached pages. Next.js writes small inline scripts into every page
 * it renders, and a cached page cannot carry a fresh nonce, so inline scripts
 * are allowed here. What still protects these pages: React escapes all text,
 * `dangerouslySetInnerHTML` is banned by lint, scripts from other sites are
 * refused, and connect-src 'self' stops a script sending data anywhere else.
 */
const publicPolicy = policy("'self' 'unsafe-inline'");

function noncePolicy(nonce: string) {
  return policy(`'self' 'nonce-${nonce}' 'strict-dynamic'`);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isUnder(pathname, SIGNED_IN) && !req.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (!isUnder(pathname, NONCE_PATHS)) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", publicPolicy);
    return res;
  }

  // Next.js reads the nonce from the request's policy header and adds it to
  // the scripts it renders for this request.
  const nonce = btoa(crypto.randomUUID());
  const csp = noncePolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Everything except API routes and Next.js's own static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)"],
};
