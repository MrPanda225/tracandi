---
description: Vérifie qu'une exigence du cahier des charges est implémentée et couverte par des tests
argument-hint: "<EF-xxx-nn | ENF-xxx-nn | RG-nn>"
allowed-tools: Bash(npx vitest:*), Bash(npm run test:*)
---
Exigence à vérifier : **$ARGUMENTS**

1. Cite l'énoncé exact et le critère d'acceptation depuis `docs/CAHIER_DES_CHARGES.md`.
2. Cherche les tests dont le titre contient `[$ARGUMENTS]` (backend et frontend) et exécute-les
   (`npx vitest run -t "$ARGUMENTS"` dans chaque package).
3. Vérifie que ces tests couvrent réellement le critère d'acceptation, y compris les cas limites et alternatifs.
4. Vérifie la ligne correspondante de `docs/TRACABILITE.md`.
5. Conclus : **Couverte**, **Partiellement couverte** (ce qui manque) ou **Non couverte**. Ne corrige rien sans accord.
