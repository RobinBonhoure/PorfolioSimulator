"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Créé dans un état plutôt qu'au niveau du module : un client partagé entre
  // requêtes serveur ferait fuiter les données d'un utilisateur vers un autre.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Les cours ne bougent qu'une fois par jour : rafraîchir à chaque
            // retour d'onglet ne ferait que solliciter Yahoo pour rien.
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
