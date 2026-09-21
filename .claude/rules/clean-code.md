---
paths:
  - "backend/**/*.ts"
  - "frontend/**/*.{ts,tsx}"
---
# Règles de code (skill `clean-code`)

Référence complète : `.claude/skills/clean-code/SKILL.md`. Ce fichier fixe les choix **propres au projet**.

## Langue et nommage
- Code, identifiants, commentaires, messages d'erreur internes : **anglais**. Textes affichés à l'utilisateur : **français**.
- camelCase (variables, fonctions), PascalCase (types, composants), UPPER_SNAKE_CASE (constantes de configuration uniquement).
- Booléens préfixés `is`, `has`, `should`, `can`. Fonctions : verbe + contexte (`getApplicationById`, `fetchGreenhouseJobs`).
- Pas de préfixe `I` sur les interfaces, pas de mots vides (`Data`, `Info`, `Manager`).

## Fonctions
- Une responsabilité ; si une section a besoin d'un commentaire-titre, elle devient une fonction.
- 3 paramètres maximum, sinon un objet d'options (règle ESLint `max-params`).
- Séparation commande / requête : une fonction modifie OU renvoie.
- Jamais de mutation d'un paramètre ; renvoyer une nouvelle valeur.
- Aucun nombre magique : constante nommée (`FOLLOW_UP_DAYS`, `CLASSIFY_BATCH_SIZE`).
- `async/await` uniquement ; appels indépendants en `Promise.all` ; aucune promesse flottante.

## Types
- `any` interdit. Données externes (requête HTTP, réponse d'API, réponse IA, fichier JSON) typées `unknown` puis parsées avec `zod`.
- Les types métier sont dérivés des schémas : `type Application = z.infer<typeof ApplicationSchema>`.

## Structure d'un module (`backend/src/modules/<domaine>/`)
| Fichier | Rôle | Dépend de |
|---|---|---|
| `schemas.ts` | Schémas zod + types dérivés | zod |
| `repository.ts` | SQL uniquement, aucune règle métier | `db/` |
| `service.ts` | Règles métier (RG-xx), orchestration | repository, autres services |
| `routes.ts` | HTTP : validation, appel service, code retour | service |
| `*.test.ts` | Tests unitaires co-localisés | — |

Un module n'importe jamais le `repository` d'un autre module : il passe par son `service`.
Les dépendances externes (client Gmail, fournisseurs IA, horloge) sont **injectées** pour être simulées en test.

## Erreurs
- Classes d'erreur dédiées (`HttpError`, `NotFoundError`, `ValidationError`, `LlmUnavailableError`), jamais `throw 'texte'`.
- Aucune erreur avalée : journaliser puis relancer, ou transformer explicitement.
- Échec rapide aux frontières ; confiance dans les données déjà validées en aval.

## Documentation
- JSDoc sur toute fonction exportée : ce qu'elle garantit, cas `null`, exceptions, effets de bord.
- Commentaires = **pourquoi**, jamais **quoi**. Citer l'exigence ou la règle concernée : `// RG-04: a late ack never downgrades an interview`.

## Interdits
- Abstraction « au cas où » (YAGNI). Pattern sans problème concret.
- Désactiver une règle ESLint ou TypeScript pour faire passer le code.
- Code mort, `console.log`, TODO sans identifiant de tâche.
