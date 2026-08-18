import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `yahoo-finance2` est ESM-only et charge des schémas de validation à
  // l'exécution : le laisser hors du bundle serveur évite que l'empaquetage
  // casse ses imports dynamiques en environnement serverless.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
