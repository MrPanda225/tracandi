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
- Couleurs des statuts de candidature (EF-CAN-22), tokens `--application-*` de `styles/tokens.css`, composant
  `StatusTag` (et `FollowUpDueTag`), libellé toujours affiché, fonds opaques :

  | Statut | Famille | Texte / fond | Contraste |
  |---|---|---|---|
  | À postuler | jaune | `#6b5400` / `#faefc2` | 6,29:1 |
  | Envoyée, Accusé reçu, Test technique, Entretien | orange « en cours » | `#8f3f0a` / `#fde3d0` | 5,92:1 |
  | Proposition | vert | `#2b6a3d` / `#dcf0e1` | 5,44:1 |
  | Refusée | rouge | `#b0262c` / `#fce3e3` | 5,46:1 |
  | Repère « À relancer » (RG-06) | rouge foncé plein « sans réponse » | `#ffffff` / `#741b21` | 10,93:1 |

  La couleur du texte sert aussi aux graphiques (≥ 6:1 sur le fond de page). Graphique hebdomadaire : Envoyées
  orange clair `#d0701c` (3,30:1), Entretiens orange « en cours » (6,89:1), Refusées rouge vif `#d9454a` (4,06:1),
  trois clartés distinctes pour que des barres voisines se distinguent même en gris. Les tokens `--status-*` restent ceux
  des messages d'état (succès, attente, erreur), sans lien avec les statuts de candidature.
- Accessibilité : éléments interactifs natifs (`button`, `a`), `aria-label` sur les contrôles sans texte, contraste AA.
- Tests : Testing Library, requêtes par rôle ou texte visible, pas par classe CSS.
