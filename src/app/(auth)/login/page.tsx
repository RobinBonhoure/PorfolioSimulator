import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { isGoogleAuthEnabled } from "@/lib/env";

export const metadata = { title: "Connexion — Simulateur de portefeuille" };

export default function LoginPage() {
  return (
    // `useSearchParams` impose une frontière Suspense côté serveur.
    <Suspense>
      <AuthForm mode="login" googleEnabled={isGoogleAuthEnabled()} />
    </Suspense>
  );
}
