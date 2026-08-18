import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // Le driver HTTP de Neon n'offre pas de transaction interactive : les
    // opérations d'authentification sont exécutées séquentiellement.
    transaction: false,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Pas de vérification d'e-mail au démarrage : elle demande un service
    // d'envoi, qui n'apporte rien tant que l'application n'est pas déployée.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  // Le provider n'est déclaré que si les identifiants existent : sans cela,
  // Better Auth expose une route Google qui échoue à l'exécution.
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  // `nextCookies` doit rester le dernier plugin : il intercepte la réponse pour
  // poser les cookies depuis les server actions.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
