"use client";

import { api } from "@/lib/api";

// Ported from the old app.js. Photos go from the browser straight to storage
// with a short-lived signed link from POST /uploads/sign, so a large phone
// photo never passes through the proxy or the Render API.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export type UploadPurpose = "candy_photo" | "profile_photo";

/** What the confirm calls (POST /sellers/<id>/photos, PUT .../profile-photo) take. */
export type UploadedImage = { key: string; content_type: string };

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = url;
  });
}

/**
 * Redraws the photo on a canvas and saves it again as a JPEG.
 *
 * This is mostly for privacy. A phone photo carries EXIF data, which usually
 * includes the GPS position of the seller's home; a re-encoded canvas keeps
 * only the pixels. Shrinking to 1600 px also turns a 4 MB photo into about
 * 300 KB. It is not a security check: Flask re-checks type and size, and an
 * admin reviews every photo before buyers see it.
 */
export async function prepareImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  const image = await readImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("That image could not be processed."))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
  return { blob, contentType: "image/jpeg" };
}

/** Signs, uploads, and returns the key for the caller to confirm with Flask. */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<UploadedImage> {
  const { blob, contentType } = await prepareImage(file);
  const signed = await api.post<{ upload_url: string; key: string }>("/uploads/sign", {
    purpose,
    content_type: contentType,
    byte_size: blob.size,
  });
  let res: Response;
  try {
    res = await fetch(signed.upload_url, { method: "PUT", headers: { "content-type": contentType }, body: blob });
  } catch {
    // Also what a missing UPLOAD_ORIGIN looks like: the browser's security
    // policy blocks the request before it leaves (see middleware.ts).
    throw new Error("The photo could not be uploaded. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(`The photo could not be stored (${res.status}).`);
  return { key: signed.key, content_type: contentType };
}
