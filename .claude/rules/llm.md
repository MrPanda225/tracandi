---
paths:
  - "backend/src/llm/**"
  - "backend/src/modules/**/*classif*.ts"
  - "backend/src/modules/cv/**"
---
# Règles IA (Groq, Gemini, Claude)

- Tout appel passe par `runTask(task, { system, prompt, schema })` du routeur ; jamais d'appel direct à un SDK hors `llm/providers/`.
- Routage (RG-13) défini dans une seule table `TASK_ROUTES`. Ajouter une tâche = une entrée + un prompt + un schéma
  (skill projet `add-llm-task`).
- Délai maximum 60 s par appel ; réponse non conforme au schéma = échec → fournisseur suivant (EF-IA-02).
- Chaque appel est journalisé dans `llm_calls` sans contenu (EF-IA-06).
- Prompts dans `llm/prompts/<task>.ts`, en français, contenu externe encadré de balises et déclaré non fiable (ENF-SEC-06).
- Traitements par lots (10 mails, 15 offres) pour limiter le coût (ENF-COU-01) ; pré-filtre sans IA avant tout lot (RG-10).
- CV : l'IA ne fait que reformuler ; le contrôle de fidélité RG-12 est du code déterministe, pas une consigne de prompt.
- Modèles configurés par variables d'environnement (`GROQ_MODEL_1/2/3`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`), jamais en dur.
- Les trois entrées `groq_1/2/3` de RG-13 sont des **emplacements**, pas des familles de modèles : le catalogue gratuit
  change (modèles retirés), seul le nom du modèle configuré bouge. Un service parlant le format OpenAI se branche par
  `llm/providers/openaiCompatible.ts` (URL de base), sans nouvelle dépendance.
