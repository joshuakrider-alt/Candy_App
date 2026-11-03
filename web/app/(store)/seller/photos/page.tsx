import type { Metadata } from "next";
import { PhotosPanel } from "@/components/seller/photos-panel";

export const metadata: Metadata = { title: "Photos" };

export default function SellerPhotosPage() {
  return <PhotosPanel />;
}
