import { ApiRequestError } from "@/lib/api";
import { sentence } from "@/components/orders/use-order-actions";

/** Flask's error as a sentence for the screen, or a fallback. */
export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  // Flask's 503s name its own environment variables, which mean nothing to a seller.
  if (error instanceof ApiRequestError && error.status === 503 && /not configured/i.test(error.message)) {
    return "That isn't switched on for this site yet.";
  }
  if (error instanceof ApiRequestError) return sentence(error.message);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
