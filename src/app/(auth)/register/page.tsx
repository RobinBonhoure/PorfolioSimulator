import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { isGoogleAuthEnabled } from "@/lib/env";

export const metadata = { title: "Créer un compte — Simulateur de portefeuille" };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={isGoogleAuthEnabled()} />
    </Suspense>
  );
}
