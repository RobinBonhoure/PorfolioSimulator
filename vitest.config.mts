import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Le moteur est du TypeScript pur sans DOM : pas d'environnement de
    // navigateur à simuler, les tests tournent en Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
