#!/bin/sh
# Préparation locale (ENF-POR-01, ENF-SEC-03).
# - crée .env depuis .env.example s'il n'existe pas (droits 600) ;
# - remplit les secrets générables restés vides : mot de passe de la base locale de test, clé de chiffrement du jeton OAuth ;
# - ne modifie jamais une valeur déjà saisie et n'affiche aucun secret.
# Restent à saisir à la main dans .env : chaînes de connexion Neon, clés IA, OAuth Google, SCRAPER_CONTACT_EMAIL.
# Usage : scripts/setup.sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

# Remplace une valeur vide (ligne exactement `KEY=`) par une valeur générée ; sans effet si la clé est déjà renseignée.
fill_if_empty() {
  sed -i.bak "s|^$1=\$|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
}

umask 077
if [ -e "$ENV_FILE" ]; then
  echo "Kept existing .env"
else
  cp "$ROOT/.env.example" "$ENV_FILE"
  echo "Created .env from .env.example"
fi
chmod 600 "$ENV_FILE"

fill_if_empty TEST_DB_PASSWORD "$(openssl rand -hex 24)"
fill_if_empty TOKEN_ENCRYPTION_KEY "$(openssl rand -hex 32)"
echo "Generated secrets filled where empty (TEST_DB_PASSWORD, TOKEN_ENCRYPTION_KEY)"

echo "Still to fill in .env by hand: DATABASE_URL_APP, DATABASE_URL_MIGRATOR, DATABASE_URL_BACKUP (Neon, sslmode=verify-full),"
echo "ANTHROPIC_API_KEY and/or GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SCRAPER_CONTACT_EMAIL, RESEND_API_KEY"
