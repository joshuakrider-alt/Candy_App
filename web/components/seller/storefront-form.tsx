"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, Panel } from "@/components/panel";
import { errorText } from "@/lib/error-text";
import { useSellerId, useSellerShop, useSetSellerShop } from "@/components/seller/seller-shop";
import { ShopLogo } from "@/components/shop/shop-logo";
import { api } from "@/lib/api";
import { isHexColor } from "@/lib/format";
import type { Seller, SellerTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

// The rules storefront.py applies, checked here first so a typo gets a
// message before the round trip. Flask still checks everything.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAGLINE_MAX = 140;
const DEFAULT_COLORS = { primary: "#ff4d6d", accent: "#ff8a3d" };

/** Black or white text, whichever reads better: storefront.readable_text_on. */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#1a1a1a";
}

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:" && !/\s/.test(value);
  } catch {
    return false;
  }
};

function Preview({ seller, tagline, logoUrl, theme }: { seller: Seller; tagline: string; logoUrl: string; theme: SellerTheme }) {
  const style = theme.primary ? { background: theme.primary, color: theme.on_primary ?? "#ffffff" } : undefined;
  return (
    <div
      aria-label="Preview of your shop page"
      className={cn("flex flex-col gap-3 rounded-xl p-5 shadow-candy", !theme.primary && "bg-white text-cola")}
      style={style}
    >
      <div className="flex items-center gap-3">
        <ShopLogo
          name={seller.shop_name}
          logoUrl={isHttpsUrl(logoUrl) ? logoUrl : null}
          theme={theme}
          className="size-16 ring-4 ring-white/70"
        />
        <div className="min-w-0">
          <p className="font-heading text-2xl leading-tight font-extrabold">{seller.shop_name}</p>
          {tagline && <p className="opacity-90">{tagline}</p>}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
        <span className="flex items-center gap-1">
          <MapPin aria-hidden className="size-4" /> {seller.neighborhood}
        </span>
        <span className="flex items-center gap-1">
          <Clock aria-hidden className="size-4" /> Pickup: {seller.pickup_window}
        </span>
      </p>
      {theme.accent && (
        <span
          className="self-start rounded-full px-4 py-1.5 text-sm font-extrabold"
          style={{ background: theme.accent, color: theme.on_accent ?? "#ffffff" }}
        >
          Add to cart
        </span>
      )}
    </div>
  );
}

/** The shop's public page: link, tagline, logo and colours, with a live preview. */
export function StorefrontForm() {
  const sellerId = useSellerId();
  const seller = useSellerShop();
  const setShop = useSetSellerShop();

  const [slug, setSlug] = useState(seller.slug ?? "");
  const [tagline, setTagline] = useState(seller.tagline ?? "");
  const [logoUrl, setLogoUrl] = useState(seller.logo_url ?? "");
  const [custom, setCustom] = useState(isHexColor(seller.theme.primary) || isHexColor(seller.theme.accent));
  const [primary, setPrimary] = useState(isHexColor(seller.theme.primary) ? seller.theme.primary : DEFAULT_COLORS.primary);
  const [accent, setAccent] = useState(isHexColor(seller.theme.accent) ? seller.theme.accent : DEFAULT_COLORS.accent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const theme: SellerTheme = custom
    ? { primary, accent, on_primary: readableOn(primary), on_accent: readableOn(accent) }
    : { primary: null, accent: null, on_primary: null, on_accent: null };
  const live = seller.status === "approved" && seller.storefront_path;
  const link = seller.storefront_path ? `${origin}${seller.storefront_path}` : null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug && (!SLUG.test(cleanSlug) || cleanSlug.length < 3 || cleanSlug.length > 48)) {
      setError("Use 3 to 48 lowercase letters, numbers and single dashes for the address.");
      return;
    }
    if (logoUrl.trim() && !isHttpsUrl(logoUrl.trim())) {
      setError("The logo must be an https:// link to an image.");
      return;
    }
    const body: Record<string, unknown> = {
      tagline: tagline.trim(),
      logo_url: logoUrl.trim(),
      theme_primary: custom ? primary : null,
      theme_accent: custom ? accent : null,
    };
    // An address can be changed but not cleared (Flask refuses that).
    if (cleanSlug) body.slug = cleanSlug;
    setBusy(true);
    setError(null);
    try {
      setShop(await api.put<Seller>(`/sellers/${sellerId}/storefront`, body));
      toast.success("Shop page saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast(`Copy this link: ${link}`);
    }
  }

  return (
    <>
      <Panel title="Your shop's link">
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="font-bold break-all text-cola">{link}</p>
            {live ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copyLink} className="rounded-full font-bold">
                  Copy link
                </Button>
                <Link href={seller.storefront_path!} className="inline-flex h-8 items-center px-2 font-bold text-cherry-deep underline">
                  Open your shop page
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">It goes live when your shop is approved.</p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">You get a link when your shop is approved.</p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Panel title="Shop page">
          <form onSubmit={save} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              Address (the part after /s/)
              <Input
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ms-kikis-snack-spot"
                autoCapitalize="none"
                className="h-11 bg-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              Tagline ({tagline.length}/{TAGLINE_MAX})
              <Input
                name="tagline"
                value={tagline}
                maxLength={TAGLINE_MAX}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Fresh hot chips after school"
                className="h-11 bg-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
              Logo link (optional, https://)
              <Input
                name="logo_url"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="h-11 bg-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-cola">
              <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="size-4" />
              Use my own colours
            </label>
            {custom && (
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-bold text-cola">
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 rounded" />
                  Main colour
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-cola">
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-14 rounded" />
                  Button colour
                </label>
              </div>
            )}
            <FormMessage error>{error}</FormMessage>
            <Button type="submit" disabled={busy} className="self-start rounded-full px-6 font-extrabold">
              Save shop page
            </Button>
          </form>
        </Panel>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-muted-foreground">Preview</p>
          <Preview seller={seller} tagline={tagline.trim()} logoUrl={logoUrl.trim()} theme={theme} />
        </div>
      </div>
    </>
  );
}
