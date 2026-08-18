import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Remplace l'ancien `middleware.ts`, déprécié depuis Next 16.
 *
 * Ne fait qu'un contrôle superficiel : présence d'un cookie de session, pour
 * rediriger tôt un visiteur non connecté sans payer un appel base de données à
 * chaque navigation. Il ne valide **pas** la session — cette responsabilité
 * appartient au layout du groupe `(app)` et à `requireUser` dans chaque server
 * action. Un cookie forgé passe donc ce filtre et se fait rejeter juste après,
 * ce qui est le comportement voulu.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = getSessionCookie(request);

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // Mémorise la destination pour y revenir après authentification.
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/strategies/:path*", "/compare/:path*"],
};
