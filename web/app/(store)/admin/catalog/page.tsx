import type { Metadata } from "next";
import { CatalogPanel } from "@/components/admin/catalog";

export const metadata: Metadata = { title: "Catalog" };

export default function AdminCatalogPage() {
  return <CatalogPanel />;
}
