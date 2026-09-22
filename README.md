# Tracandi

Carnet de candidatures automatisé : suivi Gmail, veille des sites carrières, CV adaptés (Claude + Gemini).
Projet **structuré pour être développé par Claude Code**, tâche par tâche, avec tests à chaque étape.

## Ce qui est déjà en place (socle)
| Élément | Emplacement | État |
|---|---|---|
| Cahier des charges v1.1 (11 besoins, 127 exigences, 14 règles de gestion) | `docs/CAHIER_DES_CHARGES.md` | à valider |
| Roadmap en 8 lots / 32 tâches, avec définition de fini | `docs/ROADMAP.md` | prêt |
| Architecture, décisions, modèle de données | `docs/ARCHITECTURE.md` | prêt |
| Modèle de données de référence (9 tables, index justifiés) | `database/migrations/001_initial_schema.sql` | version MySQL, converti en schéma Drizzle/PostgreSQL en T-002 |
| Rôles à moindre privilège | `docs/ARCHITECTURE.md` §5 | créés en T-002 (Neon) |
| Sauvegarde + restauration de contrôle | `scripts/db/` | version MySQL, réécrite pour PostgreSQL en T-701 |
| Outillage backend (TS strict, ESLint, Vitest unit/intégration, couverture 80 %) | `backend/` | vide de code métier |
| Outillage frontend (React, TS strict, Vitest, Testing Library) | `frontend/` | page provisoire |
| Configuration Claude Code | `CLAUDE.md`, `.claude/` | prêt |

## Démarrer
```bash
nvm use                        # Node 22 (.nvmrc)
scripts/setup.sh               # crée .env (droits 600), génère le mot de passe de test et la clé de chiffrement
                               # puis saisir à la main dans .env : URL Neon (3 rôles), clés IA, OAuth Google, SCRAPER_CONTACT_EMAIL
docker compose up -d db        # base locale de test (PostgreSQL à partir de T-002)
(cd backend && npm ci) && (cd frontend && npm ci)
```
> Le hook qui protège les migrations s'appuie sur Git : le dépôt doit exister avant de lancer Claude Code.

## Travailler avec Claude Code
```bash
claude                      # dans le dossier du projet
/project:next-task          # réalise la prochaine tâche (ou /next-task selon ta version)
/project:review             # revue du diff contre les règles
/project:check-req EF-CAN-07
/project:change-request "je veux aussi ..."
/project:new-migration add_reminder_date
```
Claude Code s'arrête à la fin de chaque tâche avec un rapport. Tu valides, puis tu relances `/project:next-task`.
En fin de lot, demande une démonstration avant d'ouvrir le suivant.

## Avant le lot 1, à trancher (cahier des charges §12)
- Q-01 photo sur le CV, Q-02 compétences data réelles dans `backend/data/profile.json`, Q-03 RPO, Q-04 fréquence du récap.
- Q-05 à Q-12 : chaque question indique la tâche qu'elle bloque (Q-05, Q-06, Q-07 avant T-101/T-102).

## Neon (avant T-002)
Créer un projet Neon en région UE (Francfort, Q-14), noter la chaîne de connexion du rôle propriétaire.
Les rôles `tracandi_app` et `tracandi_backup` sont créés par la migration initiale (T-002) ; leurs mots de passe se définissent dans la console Neon.

## Gmail (avant le lot 3)
Google Cloud Console → projet → activer **Gmail API** → écran de consentement **Externe** (toi en utilisateur test) →
identifiant OAuth **Application Web**, redirection `http://localhost:4000/api/gmail/callback` → copier ID et secret dans `.env`.
