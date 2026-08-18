import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

// Driver HTTP plutôt que WebSocket : chaque requête est un aller-retour sans
// connexion persistante, ce qui convient au modèle serverless de Vercel.
// Contrepartie : pas de transaction interactive. Toutes les écritures multiples
// du projet (upserts de prix, seed) sont donc idempotentes par construction,
// de façon à pouvoir être rejouées sans dommage après un échec partiel.
const sql = neon(getServerEnv().DATABASE_URL);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
export { schema };
