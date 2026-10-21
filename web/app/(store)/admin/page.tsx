import type { Metadata } from "next";
import { Applications } from "@/components/admin/applications";

export const metadata: Metadata = { title: "Applications" };

export default function AdminApplicationsPage() {
  return <Applications />;
}
