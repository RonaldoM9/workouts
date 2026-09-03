# Workouts

Logging structuré des séances d'entraînement. Chaque séance est un fichier daté dans `logs/`, rempli depuis le template.

## Structure

```
workouts/
├── README.md
├── profile.md
├── templates/workout-template.md
├── logs/YYYY/MM/YYYY-MM-DD.md
└── stats/
    ├── personal-records.md
    └── exercise-index.md
```

## Usage

Créer une séance pour aujourd'hui :

```bash
npm run workout:new
```

Créer une séance pour une date précise :

```bash
npm run workout:new -- --date 2026-09-01
```

Le script génère `logs/YYYY/MM/YYYY-MM-DD.md` depuis le template et **ne remplace jamais un fichier existant** (erreur si la séance existe déjà).

## Site (GitHub Pages)

**https://ronaldom9.github.io/workouts/** — app statique qui lit les logs **en direct** depuis le repo (aucune régénération nécessaire) :

- **Accueil** : état du jour, stats, meilleurs lifts, semaine
- **Séances** : détail de chaque log (Completed = source de vérité)
- **Logger** : saisie des séries (exercice, reps, poids kg, RPE, notes) → publication directe dans le repo via l'API GitHub (token fine-grained optionnel, créé depuis le site en ~1 min ; sans token : brouillon local ou copie markdown)
- **Progression** : graphiques charge max / 1RM estimé / volume par exercice (auto, depuis Completed uniquement)
- **Profil / PRs / Exercices** : rendu des fichiers markdown de référence

Les fichiers `index.html`, `styles.css`, `app.js` sont l'app ; les logs restent des fichiers markdown dans `logs/`. À chaque push sur `main`, Pages se met à jour (l'app sert les données en direct, donc rien à reconstruire après un log).

## Règles de logging

- **`## Planned Workout`** = ce qui était prévu (avant la séance).
- **`## Completed Workout`** = ce qui a réellement été fait (après la séance).
- **`Completed Workout` est la seule source de vérité** pour l'historique, les stats et les PR.
- Une séance sans table Completed remplie n'est pas une séance loggée.
- Remplir `## Review` après chaque séance : RPE global, douleurs, notes pour la suivante.
- Toujours remplir `## Readiness` **avant** la séance (sommeil, énergie, poids, douleurs).

## Convention de noms d'exercices

Noms canoniques (voir `stats/exercise-index.md` pour la liste complète et les alias) :

- Bench Press
- Trap Bar Deadlift
- Landmine Press
- Pull-Up
- KB Swing
- Farmer Carry
- Sandbag Carry
- Rower
- Bike

Toujours utiliser le nom canonique dans les logs. Les alias (ex. "trap bar DL", "kettlebell swing") sont normalisés vers le nom canonique.

## Règles IA (assistant / scripts)

1. **Lire les derniers workouts** avant de proposer une nouvelle séance.
2. **Utiliser uniquement `Completed Workout`** pour l'historique, les stats et les PR — jamais le Planned.
3. **Tenir compte de la fatigue et des douleurs** (Readiness + Review) dans les propositions.
4. **Utiliser l'historique pour proposer les charges** : partir des dernières charges réellement effectuées.
5. **Détecter progression/stagnation** : comparer les Completed Workout dans le temps, signaler les plateaux.
6. **Ne jamais inventer un PR** — un PR n'existe que s'il est prouvé par une entrée Completed Workout.
7. **Ne jamais modifier une ancienne séance** sans demande explicite — les logs passés sont immuables (corriger uniquement sur demande, ou par une nouvelle entrée).
