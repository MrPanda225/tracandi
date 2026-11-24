# shellcheck shell=bash
# Réglages communs du harnais de recette locale. Sourcé par les autres scripts de scripts/recette/ ; ne s'exécute pas
# seul. Rien ici ne lit le .env de l'exploitant : la recette ne voit jamais Neon ni une clé réelle.

RECETTE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RECETTE_ROOT
readonly RECETTE_SCRIPTS="$RECETTE_ROOT/scripts/recette"
# Fichiers produits pendant la recette (e-mails captés, appels IA, appels bloqués) : jamais commités.
RECETTE_RUN_DIR="${RECETTE_RUN_DIR:-$RECETTE_SCRIPTS/.run}"
readonly RECETTE_RUN_DIR

# Base PostgreSQL propre à la recette : son conteneur, son volume et son port, distincts du service `db` de
# docker-compose.yml (tests d'intégration) pour ne jamais dépendre de la façon dont ce volume-là a été initialisé.
readonly RECETTE_DB_CONTAINER=tracandi-recette-db
readonly RECETTE_DB_VOLUME=tracandi-recette-data
readonly RECETTE_DB_IMAGE=postgres:18
readonly RECETTE_DB_PORT="${RECETTE_DB_PORT:-5435}"
readonly RECETTE_DB_NAME=tracandi_recette
readonly RECETTE_DB_USER=recette
# Mot de passe fictif : base jetable, sans donnée réelle, joignable seulement depuis 127.0.0.1.
readonly RECETTE_DB_PASSWORD=recette
readonly RECETTE_DB_URL="postgresql://${RECETTE_DB_USER}:${RECETTE_DB_PASSWORD}@127.0.0.1:${RECETTE_DB_PORT}/${RECETTE_DB_NAME}"

# Ports de l'API et de l'interface : 4000 et 5173 par défaut ; d'autres valeurs permettent une seconde recette en
# parallèle (l'interface relaie alors /api vers RECETTE_API_PORT, scripts/recette/vite.config.mjs).
readonly RECETTE_API_PORT="${RECETTE_API_PORT:-4000}"
readonly RECETTE_WEB_PORT="${RECETTE_WEB_PORT:-5173}"

recette_log() { printf '[recette] %s\n' "$*"; }
recette_fail() {
  printf '[recette] ERREUR : %s\n' "$*" >&2
  exit 1
}

# Un port venu de l'environnement entre tel quel dans une URL : sans ce contrôle, « 5435@hote-distant:5432 » ferait
# viser un autre serveur tout en passant assert_recette_url.
for recette_port in "$RECETTE_DB_PORT" "$RECETTE_API_PORT" "$RECETTE_WEB_PORT"; do
  [[ "$recette_port" =~ ^[0-9]{1,5}$ ]] || recette_fail "port refusé : « $recette_port » (chiffres seulement)"
done
unset recette_port

# Refuse toute URL qui ne vise pas la base locale de la recette : garde contre une erreur de copier-coller qui
# viserait Neon (données réelles).
assert_recette_url() {
  local url="$1"
  [[ "$url" =~ ^postgres(ql)?://[^@/]+@(127\.0\.0\.1|localhost):${RECETTE_DB_PORT}/${RECETTE_DB_NAME}$ ]] \
    || recette_fail "URL de base refusée : seule la base locale de recette (127.0.0.1:${RECETTE_DB_PORT}/${RECETTE_DB_NAME}) est admise"
}
