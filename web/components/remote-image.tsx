import Image, { type ImageProps } from "next/image";

const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

function isOurStorage(src: string) {
  try {
    return !!imageHost && new URL(src).hostname === imageHost;
  } catch {
    return false;
  }
}

/**
 * next/image for pictures from Flask. Photos in our own storage are resized
 * for the screen; a seller's logo on another site (storefront.py accepts any
 * https URL) is shown unresized, since Next.js only resizes listed hosts.
 */
export function RemoteImage({ src, alt, ...props }: Omit<ImageProps, "src"> & { src: string }) {
  return <Image src={src} alt={alt} unoptimized={!isOurStorage(src)} {...props} />;
}
