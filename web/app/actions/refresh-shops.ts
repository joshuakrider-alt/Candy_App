"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

/**
 * The shop list, the home page and the shop pages are cached (30 to 60 seconds)
 * and refreshed in the background, so the first visit after a change still
 * gets the old copy (and a cold Render API can make the refresh fail and keep
 * it longer). After an admin approves a shop or a seller edits theirs, this
 * drops those copies so the next visit is built fresh.
 *
 * Only a signed-in seller or admin can ask; Flask already decided the change.
 * Callers ignore a failure: the change is saved, and the copies still expire.
 */
export async function refreshShopPages() {
  const me = await getSession();
  if (me?.user.role !== "admin" && me?.user.role !== "seller") return;
  revalidatePath("/");
  revalidatePath("/shops");
  revalidatePath("/s/[slug]", "page");
  revalidatePath("/sitemap.xml");
}
