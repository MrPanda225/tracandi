---
paths:
  - "backend/src/modules/**/routes.ts"
  - "backend/src/app.ts"
  - "frontend/src/api/**"
---
# Conventions d'API REST

- Préfixe `/api`, ressources au pluriel en anglais : `/api/applications`, `/api/offers`, `/api/sites`, `/api/cv`, `/api/gmail`, `/api/stats`.
- JSON en entrée et en sortie, champs en camelCase dans l'API (conversion depuis snake_case dans le repository).
- Codes : `200` lecture, `201` création (renvoie `{ id }`), `204` modification/suppression sans corps,
  `400` validation (`{ error, details }`), `404` ressource absente, `409` conflit d'unicité, `415` mauvais type de contenu,
  `502` fournisseur externe indisponible, `500` erreur inattendue (message générique).
- Actions non-CRUD en sous-ressource verbale : `POST /api/offers/:id/apply`, `POST /api/gmail/sync`, `POST /api/sites/run`.
- Dates en ISO 8601 UTC.
- Listes : bornées (`LIMIT` max 500), tri stable explicite.
- Chaque route documente dans son JSDoc les exigences couvertes (`@req EF-CAN-07`).
- Le client frontend (`frontend/src/api/`) est typé ; un seul point d'entrée `request()` gère JSON, erreurs et message
  « API injoignable ».
