import type { Metadata } from "next";
import { PhotoReview } from "@/components/admin/photo-review";

export const metadata: Metadata = { title: "Photo review" };

export default function AdminPhotosPage() {
  return <PhotoReview />;
}
