# Équipe d'agents Tracandi

Les rôles de l'équipe sont décrits dans `.claude/agents/*.md`. Ils tournent en **ligne de commande** (`claude -p`),
hors de l'application de bureau, lancés par `scripts/equipe/lancer-agent.sh`. L'orchestrateur (la session principale)
assigne les tâches, lit les rapports et fusionne dans `dev` après les quatre portes (CI verte, QA, recette, revue), par
délégation du Business Owner du 23/11/2026 ; aucun agent ne fusionne, et `main` reste au Business Owner.

## Rôles

| Agent | Modèle | Rôle |
|---|---|---|
| `developpeur` | opus | Une tâche de `docs/ROADMAP.md` ou un correctif de recette, en TDD, sur sa branche, jusqu'à la PR vers `dev`. |
| `relecteur` | opus | Revue indépendante d'une PR, en lecture seule : verdict « prêt », « prêt avec réserves mineures » ou « à corriger ». |
| `testeur-technique` | opus | Recette sans navigateur : build, tests, appels HTTP sur le harnais de recette locale. |
| `testeur-ecran` | opus | Recette à l'écran dans Chrome (`--chrome`), sur l'application locale uniquement. |
| `qa-ci` | sonnet | Portes 1 et 2 d'une PR : CI GitHub verte sans exception, forme (description, traçabilité, migrations, secrets). |

## Lancer un agent

```bash
scripts/equipe/lancer-agent.sh <agent> <nom-du-rapport> "<brief>" [dossier-de-travail]
```

- Le script refuse de lancer si moins de 3 Go de mémoire sont disponibles ou si 3 agents tournent déjà.
- Le journal complet va dans `.claude/equipe/rapports/<nom>.log`, le rapport de l'agent dans `<nom>.md`.
- Sans dossier de travail, l'agent démarre dans le dépôt principal ; un `developpeur` crée alors sa propre copie de
  travail sous `.claude/worktrees/`. Pour reprendre une PR, passer la copie de travail existante de sa branche.
- `scripts/equipe/lancer-agent.sh --etat` liste les agents en cours et la mémoire disponible.

## Règles communes à tous les agents

1. **Sources de vérité** : `CLAUDE.md`, `docs/CAHIER_DES_CHARGES.md`, `docs/ROADMAP.md`, `.claude/rules/`.
   Aucune fonctionnalité hors du cahier des charges. Une ambiguïté se note dans le rapport, elle ne s'invente pas.
2. **Interdits** : lire ou afficher `.env`, `backend/data/profile.json`, `database/conf/*.cnf` ; se connecter à Neon ;
   lancer `npm run dev` ou `npm run db:migrate` dans `backend` (ils chargent `../.env`, donc Neon) ; exécuter
   `scripts/db/backup.sh` ou `scripts/db/restore.sh` ; appeler une API réelle (Claude, Gemini, Groq, Gmail, Resend,
   site carrières) ; ajouter une dépendance hors de la liste pré-approuvée de `CLAUDE.md` (et alors pour sa tâche
   seulement) ; modifier une migration commitée ; affaiblir un test ou une règle de lint ;
   modifier `.claude/settings.json` ; commit ou push sur `dev` ou `main` ; `git push --force` ; fusionner une PR.
3. **Mémoire du poste** (14 Go, swap plein vite) : `VITEST_MAX_FORKS=1`, un seul `npm run check` à la fois, aucun
   serveur laissé ouvert en fin de travail. `/tmp` est en mémoire vive : aucune copie de branche ni gros fichier
   dedans ; les copies de travail vont sous `.claude/worktrees/`.
4. **Recette** : uniquement avec le harnais `scripts/recette/` (base locale, Resend et Groq simulés), comptes fictifs
   en `example.test`, aucune donnée réelle.
5. **Commits** : fréquents (un commit de travail vaut mieux qu'un travail perdu), au format
   `T-xxx <type>(<module>): <résumé>` de `docs/CONVENTIONS_GIT.md`, poussés par
   `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branche>`.
   `gh pr edit` échoue sur ce dépôt : modifier une description par
   `gh api -X PATCH repos/MrPanda225/tracandi/pulls/<n> -F body=@<fichier>`.
6. **Rapport** : en français, dans le fichier `.claude/equipe/rapports/<nom>.md` indiqué dans le brief, mis à jour en
   cours de route. Il se termine par une ligne `VERDICT : …` (voir chaque rôle) et, pour un développeur, le hash poussé.
