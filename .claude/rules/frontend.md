---
paths:
  - "frontend/**"
---
# Règles frontend

- React 18 + TypeScript strict, React Router. Pas de gestionnaire d'état global tant qu'un besoin concret n'existe pas (YAGNI).
- Un composant = une responsabilité ; composants de page dans `src/pages/`, composants partagés dans `src/components/`.
- Props d'événement `on*`, implémentations `handle*`.
- Tous les textes en français (ENF-UTI-01). Mise en page utilisable dès 360 px (ENF-UTI-02).
- Toute action > 1 s affiche un état d'attente et désactive son bouton (ENF-UTI-03) ; toute erreur est affichée
  dans un message lisible, jamais silencieuse.
- Couleurs des statuts alignées sur les libellés Gmail : Refusée rouge foncé, Entretien vert, En attente jaune.
- Accessibilité : éléments interactifs natifs (`button`, `a`), `aria-label` sur les contrôles sans texte, contraste AA.
- Tests : Testing Library, requêtes par rôle ou texte visible, pas par classe CSS.
