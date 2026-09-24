# Conventions Git

Branches, commits et pull requests. Commits au format [Conventional Commits](https://www.conventionalcommits.org/),
adapté au suivi par tâche (`docs/ROADMAP.md`).

## Branches permanentes (depuis le 24/09/2026, BES-29)

| Branche | Rôle | Reçoit |
|---|---|---|
| `dev` | Intégration : tous les développements, toutes fonctionnalités activées (`ENABLED_FEATURES=watch,cv`) | Les PR de tâche, en « Squash and merge » |
| `main` | Versions déployables : même code que `dev`, déployé avec `ENABLED_FEATURES` vide (tableau de bord, candidatures, réglages Gmail) | Uniquement la PR de version `dev` → `main`, en **« Create a merge commit »**, et les correctifs urgents |

Une fonctionnalité n'est pas retirée de `main` : elle y est **désactivée** par la configuration (ENF-MAI-07, ADR-14).
L'ouvrir en production revient à ajouter son nom à `ENABLED_FEATURES` du déploiement, sans changer le code.

## Cycle d'une tâche

1. Partir de `dev` à jour : `git checkout dev && git pull`.
2. Créer la branche dédiée : `git checkout -b feat/T-103-applications-screen`.
3. Travailler et commiter sur la branche (format ci-dessous).
4. Tâche finie (définition de fini de `CLAUDE.md` satisfaite) : `git push -u origin <branche>` puis ouvrir une pull request
   **vers `dev`** avec le modèle `.github/pull_request_template.md`.
5. Le Business Owner relit et fusionne en **« Squash and merge »** : `dev` garde un commit par tâche, dont le message
   est le titre de la PR. La branche est supprimée après fusion.

## Cycle d'une version

1. `dev` est verte (`npm run check`, `npm run test:coverage`) et les écrans du périmètre ont été montrés au Business Owner.
2. PR `dev` → `main`, titre `release: <résumé>` ; le corps liste les tâches incluses et les fonctionnalités actives en
   production.
3. Fusion par le Business Owner en « Create a merge commit » : l'historique de `dev` est conservé et la version
   suivante reste sans conflit.
4. Un correctif urgent de production part de `main` (`fix/<résumé>`), revient dans `main` par PR, puis `main` est
   fusionnée dans `dev`.

`main` et `dev` ne reçoivent jamais de commit ni de push direct, et jamais de `push --force`.

## Branches

```
<type>/T-xxx-<résumé-en-kebab-case>     tâche de la roadmap
<type>/<résumé-en-kebab-case>           hors tâche (dépendance, correctif ponctuel, documentation)
```

- `type` : un des types de commit ci-dessous (`feat`, `fix`, `docs`…).
- Résumé en anglais, minuscules, 2 à 5 mots séparés par des tirets.
- Une branche = une tâche. Pas de travail sur deux tâches dans la même branche.

Exemples : `feat/T-103-applications-screen`, `feat/T-201-llm-router`, `fix/session-cookie-expiry`, `docs/git-conventions`.

## Commits

```
[T-xxx ]<type>(<module>): <résumé>

[corps optionnel : contexte, exigences couvertes]
```

- **`T-xxx `** (avec l'espace) : préfixe obligatoire si le commit sert une tâche de `docs/ROADMAP.md`, absent sinon.
- **`type`** : voir la liste ci-dessous, toujours en minuscules.
- **`module`** : `backend`, `frontend`, `db`, `docker`, `scripts`, `docs`, `ci`. Omis si le commit est transverse.
- **`résumé`** : en anglais, à l'impératif (`add`, `fix`, `remove`), en minuscules, sans point final, 72 caractères au plus
  pour toute la ligne.

### Types

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité visible (route, écran, comportement) |
| `fix` | Correction de bug |
| `docs` | Documentation seule (`docs/`, `README.md`, commentaires) |
| `style` | Formatage, sans changement de comportement (espaces, ordre des imports, Prettier) |
| `refactor` | Restructuration du code sans changement de comportement observable |
| `perf` | Amélioration de performance |
| `test` | Ajout ou correction de tests seuls |
| `build` | Dépendances et build (`package.json`, `tsconfig.json`, `vite.config.ts`, `Dockerfile`) |
| `ci` | Intégration continue, hooks |
| `chore` | Entretien hors des catégories ci-dessus (configuration, scripts d'exploitation) |
| `release` | PR de version `dev` → `main` uniquement |
| `revert` | Annulation d'un commit précédent |

### Exemples

```
T-001 feat(backend): bootstrap Express API with security guards
T-002 feat(db): add drizzle schema and initial postgres migration
T-101 test(backend): cover RG-03 and RG-04 branches
T-006 fix(frontend): keep focus inside the auth form on error
docs: requirements v1.1 — Neon PostgreSQL, Drizzle ORM, contract types
chore(docker): least-privilege containers
build(backend): add drizzle-kit and pg dependencies
```

### Corps

Pour un commit de tâche, lister les exigences couvertes (`EF-xxx`, `ENF-xxx`, `RG-xxx`) :

```
T-102 feat(backend): add applications CRUD routes

Covers EF-CAN-02, 03, 04, 06 to 10, 12 to 14, ENF-SEC-04.
```

## Pull requests

- **Titre** : au format d'un commit (`T-103 feat(frontend): add applications screen`). C'est le message du commit de
  fusion sur `dev`.
- **Description** : le modèle `.github/pull_request_template.md`, entièrement rempli. Aucune case cochée sans vérification.
- Une PR = une tâche. Un changement d'interface joint ses captures (1440 px et 390 px).
- Revue et fusion : Business Owner uniquement.

## Interdits

- Commit ou push direct sur `main` ou `dev`, `push --force`, réécriture d'un historique déjà poussé.
- PR de tâche vers `main` : seules les PR de version et de correctif urgent y vont.
- Plusieurs tâches dans la même branche ou la même PR.
- Type inventé hors de la liste, résumé vague (« update », « fix stuff »).
