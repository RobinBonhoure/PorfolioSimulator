import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  // Import différé : les modules de base de données lisent l'environnement à
  // l'import, il doit donc être chargé avant.
  const { seedAssets } = await import("@/lib/db/seed/run-seed");

  const { upserted, proxiesLinked } = await seedAssets();
  console.log(
    `Catalogue seedé : ${upserted} actifs insérés ou mis à jour, ${proxiesLinked} proxys reliés.`,
  );
}

main().catch((error) => {
  console.error("Échec du seed :", error);
  process.exit(1);
});
