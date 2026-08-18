import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Les migrations sont relues avant application : c'est une base de production
  // potentielle, on n'y applique rien à l'aveugle.
  verbose: true,
  strict: true,
});
