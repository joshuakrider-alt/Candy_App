import { RemoteImage } from "@/components/remote-image";
import { isHexColor } from "@/lib/format";
import type { SellerTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The shop's logo, or its initials on its own colour when it has none. */
export function ShopLogo({
  name,
  logoUrl,
  theme,
  className,
}: {
  name: string;
  logoUrl: string | null;
  theme: SellerTheme;
  className?: string;
}) {
  const base = cn("relative size-14 shrink-0 overflow-hidden rounded-md", className);
  if (logoUrl) {
    return (
      <div className={cn(base, "bg-white")}>
        <RemoteImage src={logoUrl} alt="" fill sizes="96px" className="object-contain" />
      </div>
    );
  }
  const primary = isHexColor(theme.primary) ? theme.primary : null;
  const initials = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className={cn(base, "flex items-center justify-center font-heading text-xl font-extrabold", !primary && "bg-lemon text-cola")}
      style={primary ? { background: primary, color: theme.on_primary ?? "#ffffff" } : undefined}
    >
      {initials}
    </div>
  );
}
