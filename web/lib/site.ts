/** The site's own address, from NEXT_PUBLIC_SITE_URL (beta's on candy-beta today). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/**
 * Only the real domain asks search engines in. beta and preview copies say
 * "noindex" so Google never lists them next to (or instead of) the live site.
 * At cutover NEXT_PUBLIC_SITE_URL becomes https://neighborhoodcandylady.com.
 */
export const INDEXABLE = (() => {
  try {
    return ["neighborhoodcandylady.com", "www.neighborhoodcandylady.com"].includes(new URL(SITE_URL).hostname);
  } catch {
    return false;
  }
})();
