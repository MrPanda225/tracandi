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

## Fournisseur local et modes d'exécution (v1.35, ADR-16)
- Le fournisseur **`local`** est un modèle que l'exploitant héberge lui-même (Ollama, API compatible OpenAI) : adresse,
  modèle, jeton, délai et plafond viennent de la configuration du serveur (`LOCAL_LLM_*`), jamais de l'utilisateur
  ni du code. Une adresse hors réseau privé doit être en `https` ; ni l'adresse ni le jeton ne sont renvoyés ni
  journalisés (ENF-SEC-24, ENF-SEC-25).
- **Deux tables de routes** : `TASK_ROUTES` pour une exécution dont quelqu'un attend le résultat à l'écran (le local n'y
  figure jamais, EF-IA-09), `SCHEDULED_ROUTES` pour un passage planifié ou un traitement en file sans personne devant
  l'écran (le local en tête pour `score_offers`, `extract_offers`, `deduce_profile`, `extract_offer_traits`). On choisit
  par `router.forMode('scheduled')` ; les hébergés prennent le relais en cas d'échec (EF-IA-08).
- Le modèle local est lent (processeur seul) : délai de 600 s par appel, lots de 5 offres et 800 caractères,
  `reasoning_effort: "none"` pour couper la réflexion, sonde `GET /models` de 10 s avant chaque appel, deux échecs de
  connexion consécutifs et il est laissé de côté pour le reste du passage (EF-IA-10 à 14).
- **Ce que le modèle ne fait jamais** : fournir un nombre d'années (le code compte les mois des périodes, RG-29) ni un
  niveau (RG-28) ; choisir une adresse à joindre (ENF-COL-06) ; recevoir un nom, une adresse e-mail, un téléphone, un
  message Gmail ou une candidature (ENF-RGP-13) — le texte d'un CV passe par `readCv` (coordonnées à part), celui
  d'une offre par `withoutContacts`.
- **Ce qui n'est jamais écrit** : le texte d'un CV, d'une offre, d'un prompt ou d'une réponse du modèle, ni dans la base,
  ni dans les journaux (`llm/quoted.ts` retient le message d'un fournisseur qui cite la demande), ni dans `job_runs`,
  `job_run_counters`, `llm_calls` (ENF-RGP-12, ENF-RGP-14). Ce que le modèle propose pour validation reste 30 minutes en
  mémoire (`createAnalysisResults`), effacé avec le CV type ou le compte.
