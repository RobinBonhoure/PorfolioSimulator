# Données d'inflation

`dataset-fr.json` et `dataset-ea.json` contiennent l'indice des prix à la
consommation harmonisé (HICP) mensuel, respectivement pour la France et la zone
euro, depuis janvier 1996. Base 100 en 2015.

## Pourquoi des fichiers statiques

L'indice est publié une fois par mois et révisé rarement. Interroger Eurostat à
chaque backtest ajouterait une dépendance réseau, une latence et un point de
panne pour une donnée qui bouge douze fois par an.

Le versionnement a un second effet, plus important : il rend les backtests
**reproductibles**. Deux exécutions à six mois d'intervalle donnent le même
rendement réel tant que ces fichiers n'ont pas changé — ce qui ne serait pas le
cas avec un appel en direct, où une révision d'indice modifierait
silencieusement un résultat déjà consulté.

## Mise à jour

Environ une fois par trimestre :

```bash
npx tsx scripts/update-inflation-data.ts
```

Le script interroge Eurostat, vérifie que la série n'est pas anormalement courte
— garde-fou contre un changement de format côté source — et réécrit les deux
fichiers.

## Que se passe-t-il si les données sont périmées

Au-delà du dernier mois publié, le moteur reporte le dernier indice connu : le
rendement réel des mois récents devient donc identique au rendement nominal.
Ce n'est pas silencieux — `inflationCoverageWarning` produit un avertissement
affiché sur l'écran de résultats, indiquant le mois d'arrêt et rappelant la
commande à lancer.

## Source

Eurostat, jeu de données [`prc_hicp_midx`](https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_midx),
ensemble des postes (COICOP CP00), unité `I15` (indice base 100 = 2015).
