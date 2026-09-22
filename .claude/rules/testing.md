---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "backend/tests/**"
---
# Règles de test

## Principe : développer et tester au fur et à mesure
1. Lire les exigences de la tâche dans `docs/CAHIER_DES_CHARGES.md`.
2. **Écrire d'abord les tests** traduisant les critères d'acceptation, les voir échouer.
3. Implémenter le minimum pour les faire passer, puis refactorer.

## Nommage et traçabilité
- Le titre de chaque test commence par l'identifiant d'exigence ou de règle couverte :
  `it('[RG-04] keeps interview status when a late acknowledgement arrives', ...)`.
- `describe` = unité testée (fonction, route, composant).

## Types de tests
| Type | Emplacement | Contraintes |
|---|---|---|
| Unitaire backend | `src/**/x.test.ts` à côté du code | aucun réseau, aucune base, dépendances injectées simulées |
| Intégration backend | `tests/integration/` | PostgreSQL local `tracandi_test` (Docker), Supertest sur `createApp()`, jamais Neon |
| Composant frontend | `src/**/X.test.tsx` | Testing Library, requêtes par rôle/texte, API simulée |

## Doubles de test
- Jamais d'appel réel à Claude, Gemini, Gmail ou un site carrières dans les tests.
- Réponses enregistrées dans `tests/fixtures/` (`emails/`, `ats/`, `llm/`), anonymisées (aucune donnée personnelle réelle).
- L'horloge est injectée (`now: () => Date`) pour tester les règles temporelles (RG-06).

## Qualité
- Couverture ≥ 80 % des lignes sur `modules/`, `llm/`, `scraper/` (seuil vitest, ENF-MAI-01).
- Chaque branche d'une règle de gestion a son test (y compris les cas « sinon »).
- Chaque route : au moins un cas nominal, un cas 400 (validation), un cas 404 si applicable.
- Interdit : `it.skip`/`it.only` commités, assertions affaiblies pour faire passer un test, snapshot fourre-tout.
