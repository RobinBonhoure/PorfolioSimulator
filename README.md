# Simulateur de portefeuille

Application de backtest et de comparaison de stratégies d'investissement sur
données historiques réelles, orientée investisseur français : elle répond à la
question « qu'aurait donné cette allocation, et vaut-elle mieux en PEA ou en
compte-titres ? ».

## Démarrage

```bash
npm install
cp .env.example .env.local     # puis renseigner DATABASE_URL et BETTER_AUTH_SECRET
npx drizzle-kit migrate        # crée les tables et l'index de recherche floue
npm run seed                   # catalogue de 38 actifs curatés
npm run dev
```

`BETTER_AUTH_SECRET` se génère avec :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Google OAuth est optionnel : sans `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`,
le bouton correspondant est simplement masqué et la connexion par e-mail reste
pleinement fonctionnelle.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm test` | Suite Vitest du moteur de calcul |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run seed` | Insère ou met à jour le catalogue d'actifs |
| `npm run verify:catalog` | Confronte le catalogue à Yahoo Finance |
| `npx tsx scripts/smoke-backtest.ts` | Backtest de bout en bout sur données réelles |
| `npx tsx scripts/update-inflation-data.ts` | Régénère les séries d'inflation |

## Architecture

```
src/
  app/            Routes App Router, route handlers, proxy.ts
  actions/        Server actions (CRUD stratégies, ajout d'actif)
  components/     Interface : éditeur, résultats, graphiques, comparaison
  lib/
    engine/       Moteur de backtest — TypeScript pur, sans dépendance
    backtest/     Glu entre la base et le moteur
    data-fetching/ Yahoo Finance, cache, inflation
    db/           Schéma Drizzle, requêtes, seed
    validation/   Schémas zod partagés client et serveur
```

### Le moteur

`src/lib/engine/` est une fonction pure : mêmes entrées, mêmes sorties, aucun
accès réseau ni base de données. C'est ce qui le rend testable sur des séries
synthétiques dont on connaît le résultat à la main — et c'est le seul endroit du
projet où une erreur produirait des chiffres faux mais crédibles.

Quelques choix qui méritent d'être connus avant de le modifier :

- **Les métriques de risque reposent sur les rendements pondérés par le temps**,
  pas sur la valeur brute du portefeuille. Un portefeuille alimenté par
  versements mensuels voit sa valeur monter grâce à l'argent frais ; mesurer un
  drawdown dessus le sous-estimerait, et la volatilité dépendrait du montant des
  versements plutôt que du comportement des actifs.
- **Le calendrier ne retient que les jours de semaine**, week-ends écartés même
  pour les crypto-actifs. Les conserver ferait passer l'année de 252 à 365
  observations et gonflerait artificiellement la volatilité annualisée d'un
  portefeuille contenant du bitcoin.
- **Le TER est prorata temporis en jours calendaires**, et non divisé par 252.
  Le calendrier compte environ 261 jours ouvrés : la formule usuelle
  surfacturerait les frais d'environ 3,5 % de leur montant.
- **Les ratios de Sharpe, Sortino et Calmar valent `null`** quand leur
  dénominateur est nul. Retourner zéro ferait passer un portefeuille sans risque
  mesuré pour le pire du lot, alors que son ratio n'est simplement pas défini.
- **`ENGINE_VERSION` entre dans le hash de paramètres.** Toute modification
  susceptible de changer un résultat doit l'incrémenter, faute de quoi les
  résultats calculés par la version précédente resteront en cache.

### Données

Les cours viennent de `yahoo-finance2` — API non officielle, sans garantie de
disponibilité. Ils sont mis en cache en base au premier backtest, puis
rafraîchis par delta au-delà de vingt-quatre heures.

Deux limites structurelles, à connaître avant de s'étonner d'une période
tronquée :

- **La série EUR/USD de Yahoo ne remonte qu'à décembre 2003.** Tout backtest
  contenant un actif libellé en dollars est donc plafonné à cette antériorité,
  quelle que soit l'ancienneté de l'actif lui-même.
- **L'éligibilité PEA n'existe dans aucune API.** C'est une donnée curatée à la
  main dans `src/lib/db/seed/assets.seed.ts`, et c'est la raison d'être de ce
  fichier. Les tickers, devises et dates de première cotation y sont vérifiés
  auprès de Yahoo par `npm run verify:catalog` ; l'éligibilité, les TER et les
  répartitions sectorielles ne le sont pas et relèvent d'une relecture humaine.

### Ce qui n'est pas persisté

Seules les **métriques** d'un backtest sont mises en cache. Les séries
quotidiennes représenteraient plusieurs méga-octets par exécution pour une
donnée entièrement redérivable du cache de cours, alors que le moteur traite
trente ans sur dix actifs en moins de deux cents millisecondes. Un test de
performance (`src/lib/engine/performance.test.ts`) garde ce budget : s'il
échoue, c'est la décision de stockage qu'il faut rouvrir, pas le seuil qu'il
faut relever.

## Points de vigilance

- **Le schéma Better Auth est corrigé à la main.** La CLI publiée est en retard
  sur la bibliothèque et omet `account.issuer`. Voir l'en-tête de
  `src/lib/db/schema/auth.ts` avant toute montée de version.
- **L'autorisation est revérifiée dans chaque server action.** `src/proxy.ts` ne
  fait qu'un contrôle superficiel de présence du cookie ; il ne valide pas la
  session, et une server action est une requête POST qu'un ajustement de
  `matcher` peut soustraire au filtre sans que rien ne le signale.
