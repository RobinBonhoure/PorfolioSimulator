import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis (chaîne de connexion Neon)"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET doit faire au moins 16 caractères"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  // Google OAuth est optionnel : le provider n'est activé que si les deux
  // variables sont présentes, pour qu'un environnement sans identifiants
  // Google reste parfaitement fonctionnel en email/mot de passe.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Variables d'environnement invalides ou manquantes :\n${details}\n` +
        `Copiez .env.example vers .env.local et renseignez les valeurs.`,
    );
  }

  cached = parsed.data;
  return cached;
}

export function isGoogleAuthEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
