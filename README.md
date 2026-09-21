# JobPilot

Carnet de candidatures automatisé : suivi Gmail, veille des sites carrières, CV adaptés (Claude + Gemini).
Projet **structuré pour être développé par Claude Code**, tâche par tâche, avec tests à chaque étape.

## Ce qui est déjà en place (socle)
| Élément | Emplacement | État |
|---|---|---|
| Cahier des charges (9 besoins, 124 exigences, 14 règles de gestion) | `docs/CAHIER_DES_CHARGES.md` | à valider |
| Roadmap en 8 lots / 32 tâches, avec définition de fini | `docs/ROADMAP.md` | prêt |
| Architecture, décisions, modèle de données | `docs/ARCHITECTURE.md` | prêt |
| Schéma MySQL initial (9 tables, index justifiés) | `database/migrations/001_initial_schema.sql` | testé sur MySQL 8 |
| Comptes MySQL à moindre privilège | `database/init/01-create-users.sh` | testé |
| Sauvegarde + restauration de contrôle | `scripts/db/` | testé |
| Outillage backend (TS strict, ESLint, Vitest unit/intégration, couverture 80 %) | `backend/` | vide de code métier |
| Outillage frontend (React, TS strict, Vitest, Testing Library) | `frontend/` | page provisoire |
| Configuration Claude Code | `CLAUDE.md`, `.claude/` | prêt |

## Démarrer
```bash
nvm use                        # Node 22 (.nvmrc)
scripts/setup.sh               # crée .env et database/conf/*.cnf (mots de passe générés, droits 600)
                               # puis saisir à la main dans .env : clés IA, OAuth Google, SCRAPER_CONTACT_EMAIL
docker compose up -d db        # après setup.sh : sinon Docker crée des dossiers à la place des .cnf
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

## Gmail (avant le lot 3)
Google Cloud Console → projet → activer **Gmail API** → écran de consentement **Externe** (toi en utilisateur test) →
identifiant OAuth **Application Web**, redirection `http://localhost:4000/api/gmail/callback` → copier ID et secret dans `.env`.
