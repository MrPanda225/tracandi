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
- Les API officielles (France Travail, La bonne alternance, Recherche d'entreprises, découpage administratif) passent
  par le client de `scraper/official/` : conditions d'utilisation, moitié du débit publié, 15 s / 3 Mo, identifiants
  en configuration seulement (ENF-COL-05, ENF-SEC-23). robots.txt ne s'y applique pas ; il s'applique à tout le reste.
- Priorité aux API publiques des ATS (Greenhouse, Lever, SmartRecruiters, Recruitee, Workday, Cegid Talentsoft,
  Teamtailor, Personio, Workable, Ashby) ; la page générique lue par IA est le dernier recours.
- Aucune coordonnée de recruteur conservée : champs de contact jamais lus, e-mails et téléphones retirés du texte
  (ENF-RGP-09). Une requête vers une source officielle ne porte que des critères de recherche (ENF-RGP-11).
- Aucun service payant de recherche, de collecte ou de rendu ; aucun service qui contourne une protection (§5.2).
- Interdits : LinkedIn, Indeed, Welcome to the Jungle (et Welcome Kit, Q-20), contournement de CAPTCHA ou d'authentification,
  navigateur automatisé, rotation d'IP ou d'agent utilisateur.
- Ajouter un type de source = un fichier dans `scraper/adapters/` + une entrée dans le registre (ENF-MAI-03, skill projet
  `add-scraper-adapter`). Chaque adaptateur renvoie `NormalizedOffer[]` validé par zod.
- L'échec d'une source est enregistré sur la source et n'interrompt jamais les autres (ENF-FIA-02).
