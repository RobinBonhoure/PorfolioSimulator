-- Recherche floue du catalogue d'actifs.
--
-- L'autocomplétion doit trouver un ETF aussi bien par "world" que par "cw8" ou
-- par son ISIN "FR0010315770". Un index trigram sur `search_text` (nom +
-- libellé court + ISIN + ticker + alias, concaténés à l'écriture) couvre les
-- trois voies avec un seul index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "assets_search_trgm_idx"
  ON "assets" USING gin ("search_text" gin_trgm_ops);
