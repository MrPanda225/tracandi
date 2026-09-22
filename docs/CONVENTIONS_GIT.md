# Conventions Git

Branches, commits et pull requests. Commits au format [Conventional Commits](https://www.conventionalcommits.org/),
adapté au suivi par tâche (`docs/ROADMAP.md`).

## Cycle d'une tâche

1. Partir de `main` à jour : `git checkout main && git pull`.
2. Créer la branche dédiée : `git checkout -b feat/T-103-applications-screen`.
3. Travailler et commiter sur la branche (format ci-dessous).
4. Tâche finie (définition de fini de `CLAUDE.md` satisfaite) : `git push -u origin <branche>` puis ouvrir une pull request
   vers `main` avec le modèle `.github/pull_request_template.md`.
5. Le Business Owner relit et fusionne en **« Squash and merge »** : `main` garde un commit par tâche, dont le message
   est le titre de la PR. La branche est supprimée après fusion.

`main` ne reçoit jamais de commit ni de push direct, et jamais de `push --force`.

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
  fusion sur `main`.
- **Description** : le modèle `.github/pull_request_template.md`, entièrement rempli. Aucune case cochée sans vérification.
- Une PR = une tâche. Un changement d'interface joint ses captures (1440 px et 390 px).
- Revue et fusion : Business Owner uniquement.

## Interdits

- Commit ou push direct sur `main`, `push --force`, réécriture d'un historique déjà poussé.
- Plusieurs tâches dans la même branche ou la même PR.
- Type inventé hors de la liste, résumé vague (« update », « fix stuff »).
