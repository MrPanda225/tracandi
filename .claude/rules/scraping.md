---
paths:
  - "backend/src/scraper/**"
  - "backend/src/modules/sites/**"
  - "backend/src/modules/offers/**"
---
# Règles de collecte (veille des offres)

- Toute requête sortante de collecte passe par `politeFetch()` (`scraper/http.ts`) : robots.txt respecté (ENF-COL-01),
  ≥ 3 s entre deux requêtes sur un même hôte (ENF-COL-02), agent utilisateur avec contact (ENF-COL-03),
  15 s / 3 Mo maximum (ENF-COL-04), https uniquement.
- Priorité aux API publiques des ATS (Greenhouse, Lever, SmartRecruiters, Recruitee, Workday) ; la page générique
  lue par IA est le dernier recours.
- Interdits : LinkedIn, Indeed, Welcome to the Jungle, contournement de CAPTCHA ou d'authentification,
  navigateur automatisé, rotation d'IP ou d'agent utilisateur.
- Ajouter un type de source = un fichier dans `scraper/adapters/` + une entrée dans le registre (ENF-MAI-03, skill projet
  `add-scraper-adapter`). Chaque adaptateur renvoie `NormalizedOffer[]` validé par zod.
- L'échec d'une source est enregistré sur la source et n'interrompt jamais les autres (ENF-FIA-02).
