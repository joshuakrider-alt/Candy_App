import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/password-reset";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
