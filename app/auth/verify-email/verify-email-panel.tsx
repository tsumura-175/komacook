"use client";

import { useRouter } from "next/navigation";
import { ConfirmationPanel } from "../../login/auth-forms";

export function VerifyEmailPanel({ email }: { email: string }) {
  const router = useRouter();
  return <ConfirmationPanel email={email} onBack={() => router.push("/login")} />;
}

