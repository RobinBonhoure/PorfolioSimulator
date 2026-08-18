import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";

/**
 * Session courante, ou `null`.
 *
 * `src/proxy.ts` ne fait qu'un contrôle superficiel de présence du cookie ;
 * c'est ici que la session est réellement validée. Toute lecture ou écriture de
 * données appartenant à un utilisateur doit passer par `requireUser`.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Utilisateur authentifié, ou redirection vers la page de connexion.
 *
 * À appeler dans chaque server action et chaque route protégée, et pas seulement
 * dans le layout : les server actions sont des requêtes POST sur la route
 * hôte, qu'un simple ajustement de `matcher` peut soustraire au proxy sans que
 * rien ne le signale.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}
