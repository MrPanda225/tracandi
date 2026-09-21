#!/bin/sh
# Préparation locale, à lancer une seule fois après le clonage (ENF-POR-01, ENF-SEC-03).
# - crée .env depuis .env.example avec des mots de passe MySQL et une clé de chiffrement aléatoires ;
# - crée database/conf/backup.cnf et restore.cnf avec les mots de passe correspondants (droits 600) ;
# - n'écrase jamais un fichier existant et n'affiche aucun secret.
# Les clés d'API (Anthropic, Gemini) et les identifiants OAuth Google restent à saisir à la main dans .env.
# Usage : scripts/setup.sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
CONF_DIR="$ROOT/database/conf"

random_secret() { openssl rand -hex "$1"; }

# Remplace la valeur vide d'une clé de .env (ex. `KEY=`) par une valeur générée.
set_env_value() {
  sed -i.bak "s|^$1=\$|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
}

# Lit une valeur de .env sans l'afficher.
get_env_value() {
  sed -n "s|^$1=||p" "$ENV_FILE" | head -n 1
}

write_cnf() {
  target="$CONF_DIR/$1"
  if [ -d "$target" ]; then
    # Créé par Docker lorsque le fichier manquait au premier `docker compose up`.
    rmdir "$target" 2>/dev/null || { echo "ERROR $target is a non-empty directory" >&2; exit 1; }
  fi
  if [ -e "$target" ]; then
    echo "Kept existing database/conf/$1"
    return
  fi
  umask 077
  printf '[client]\nuser     = %s\npassword = %s\n' "$2" "$3" > "$target"
  chmod 600 "$target"
  echo "Created database/conf/$1"
}

if [ -e "$ENV_FILE" ]; then
  echo "Kept existing .env"
else
  umask 077
  cp "$ROOT/.env.example" "$ENV_FILE"
  for key in MYSQL_ROOT_PASSWORD MYSQL_APP_PASSWORD MYSQL_MIGRATOR_PASSWORD MYSQL_BACKUP_PASSWORD MYSQL_TEST_PASSWORD; do
    set_env_value "$key" "$(random_secret 24)"
  done
  set_env_value TOKEN_ENCRYPTION_KEY "$(random_secret 32)"
  chmod 600 "$ENV_FILE"
  echo "Created .env (MySQL passwords and encryption key generated)"
fi

write_cnf backup.cnf jobpilot_backup "$(get_env_value MYSQL_BACKUP_PASSWORD)"
write_cnf restore.cnf jobpilot_migrator "$(get_env_value MYSQL_MIGRATOR_PASSWORD)"

echo "Still to fill in .env by hand: ANTHROPIC_API_KEY and/or GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SCRAPER_CONTACT_EMAIL"
