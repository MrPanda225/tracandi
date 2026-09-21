---
name: add-scraper-adapter
description: >
  Procédure pour ajouter un nouveau type de source à la veille des offres (nouvel ATS ou site carrières).
  Utiliser quand le candidat veut surveiller une entreprise dont le système de recrutement n'est pas encore supporté.
---

# Ajouter un adaptateur de source

Objectif : respecter ENF-MAI-03 — seuls le nouveau fichier et le registre sont modifiés (plus l'`ENUM` via migration).

## Avant de coder
1. Vérifier que l'ATS publie une **API publique de job board** (endpoint JSON sans authentification, prévu pour l'intégration
   sur des sites tiers). Si le seul moyen est de simuler un navigateur ou de contourner une protection : **refuser** (scraping.md).
2. Vérifier `robots.txt` et les conditions d'utilisation de l'ATS.
3. Enregistrer une réponse réelle anonymisée dans `backend/tests/fixtures/ats/<adapter>.json`.

## Étapes
1. **Migration** : ajouter la valeur à `watched_sites.adapter` (`/project:new-migration add_<adapter>_adapter`).
2. **Fichier** `backend/src/scraper/adapters/<adapter>.ts` exportant :
   ```ts
   export const <adapter>Adapter: SourceAdapter = {
     id: '<adapter>',
     label: '<Nom affiché>',
     identifierHint: '<aide de saisie en français>',
     identifierSchema: z.string().regex(SLUG_PATTERN),   // ou schéma d'URL https spécifique (RG-08)
     async fetchOffers(identifier, deps) { ... }          // deps.fetch = politeFetch injecté
   };
   ```
   - Parser la réponse avec un schéma zod de la réponse brute, puis mapper vers `NormalizedOffer`.
   - `externalId` stable (identifiant de l'ATS), `url` absolue https, description tronquée.
3. **Registre** : ajouter l'adaptateur dans `backend/src/scraper/adapters/index.ts`.
4. **Règle RG-08** : compléter le cahier des charges avec le format d'identifiant.
5. **Tests** : parsing de la fixture, identifiant invalide rejeté, erreur HTTP propagée proprement, aucune requête réelle.
