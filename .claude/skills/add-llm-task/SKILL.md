---
name: add-llm-task
description: >
  Procédure pour ajouter une nouvelle tâche IA à JobPilot (classement, notation, extraction, rédaction)
  en passant par le routeur Claude/Gemini. Utiliser dès qu'une fonctionnalité doit appeler un modèle de langage.
---

# Ajouter une tâche IA

Une tâche IA = **un nom**, **un prompt**, **un schéma de sortie**, **une route de fournisseurs**. Les fournisseurs
eux-mêmes ne sont jamais modifiés (ENF-MAI-04).

## Étapes

1. **Nommer la tâche** en camelCase anglais (`summarizeOffer`) et vérifier l'exigence qui la justifie.
2. **Route** : ajouter l'entrée dans `TASK_ROUTES` (`backend/src/llm/router.ts`).
   - Volume élevé, extraction, classification → `['gemini', 'claude']`.
   - Rédaction en français destinée au candidat → `['claude', 'gemini']`.
   - Mettre à jour RG-13 dans le cahier des charges si la répartition change.
3. **Schéma** : définir le schéma zod de la sortie dans le module métier. Bornes explicites
   (entiers 0–100, longueurs max, énumérations). Le schéma est la seule barrière contre une sortie aberrante.
4. **Prompt** : créer `backend/src/llm/prompts/<task>.ts` exportant une fonction pure `(input) => { system, prompt }`.
   - Instruction système en français, décrit le format JSON attendu.
   - Tout contenu externe entre balises (`<email>`, `<offer>`, `<page_text>`) + phrase standard `UNTRUSTED_CONTENT_NOTICE`.
   - Tronquer les entrées longues (constante nommée) pour maîtriser le coût.
5. **Appel** : dans le service métier, `const { data, provider } = await runTask('<task>', { ...buildPrompt(input), schema })`.
   Traiter par lots si plusieurs éléments.
6. **Tests** :
   - Prompt : le contenu externe est bien encadré ; la troncature s'applique.
   - Service : fournisseurs simulés renvoyant (a) une sortie valide, (b) une sortie hors schéma → bascule,
     (c) deux échecs → `LlmUnavailableError`.
   - Fixture de réponse dans `backend/tests/fixtures/llm/<task>.json`.

## Anti-patterns
- Demander à l'IA de faire respecter une règle métier critique (RG-12) : c'est au code de la vérifier.
- Interpoler une donnée utilisateur dans l'instruction système.
- Appeler `@anthropic-ai/sdk` ou `@google/genai` hors de `llm/providers/`.
