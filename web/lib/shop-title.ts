// Shop titles: how a shop is labeled ("Candy Lady", "Candy Shop", or the
// seller's own wording). The rules mirror storefront.py so a typo gets a
// message before the round trip; Flask still checks everything, including
// the word filter, which lives only there.

export const SHOP_TITLE_PRESETS = ["Candy Lady", "Candy Woman", "Candy Guy", "Candy Man", "Candy Shop"] as const;
/** Preselected for new shops. Shops from before titles existed are "Candy Lady". */
export const DEFAULT_SHOP_TITLE = "Candy Shop";
export const SHOP_TITLE_MIN = 2;
export const SHOP_TITLE_MAX = 24;

const ALLOWED = /^[\p{L}\p{N}](?:[\p{L}\p{N} '’&.-]*[\p{L}\p{N}]\.?)?$/u;

export const isPresetTitle = (title: string) => (SHOP_TITLE_PRESETS as readonly string[]).includes(title);

export const cleanShopTitle = (raw: string) => raw.replace(/\s+/g, " ").trim();

/** Why a typed title won't be accepted, or null if it looks fine to send. */
export function shopTitleProblem(raw: string): string | null {
  const title = cleanShopTitle(raw);
  if (!title) return "Pick a title for your shop.";
  if (isPresetTitle(title)) return null;
  if (title.length < SHOP_TITLE_MIN || title.length > SHOP_TITLE_MAX)
    return `Keep your own title to ${SHOP_TITLE_MIN}-${SHOP_TITLE_MAX} characters.`;
  if (!ALLOWED.test(title)) return "Use letters, numbers, spaces and ' & . - only.";
  return null;
}
