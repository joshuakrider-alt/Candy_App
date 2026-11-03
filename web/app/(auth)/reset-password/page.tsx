import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/password-reset";

// no-referrer: nothing on this page should tell another site it was visited
// from a reset link.
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
