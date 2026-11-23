# shellcheck shell=bash
# Fonctions communes aux scripts de sauvegarde (T-701). Sourcé par backup.sh, restore-check.sh et restore.sh ;
# ne s'exécute pas seul.
#
# Garanties :
# - un secret (mot de passe d'une URL de connexion) n'est jamais écrit dans le journal ni passé en argument d'un
#   processus (visible par `ps`) : il voyage dans PGPASSWORD, lisible seulement par l'utilisateur courant ;
# - `.env` n'est jamais sourcé : seule la clé demandée y est lue (read_setting) ;
# - une base distante n'est jointe qu'en `sslmode=verify-full` (ENF-SEC-15).

# Codes de retour communs (documentés dans docs/DEPLOIEMENT.md, section Sauvegardes).
readonly EXIT_OK=0
readonly EXIT_USAGE=1
readonly EXIT_CONFIG=2
readonly EXIT_DATABASE=3
readonly EXIT_VERIFY=4
readonly EXIT_RETENTION=5

# Version majeure de PostgreSQL de Neon et de l'image Docker locale (ADR-12) : pg_dump doit être au moins aussi récent.
readonly PG_MAJOR=18
readonly PG_IMAGE="postgres:${PG_MAJOR}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
# Fichier de réglages de l'exploitant ; TRACANDI_ENV_FILE le remplace (tests : fichier vide, jamais le vrai .env).
ENV_FILE="${TRACANDI_ENV_FILE:-$REPO_ROOT/.env}"
readonly ENV_FILE
# Nom des archives : tracandi_<AAAA-MM-JJTHH-MM-SSZ>.dump (UTC, tri alphabétique = tri chronologique).
readonly ARCHIVE_PREFIX="tracandi_"
readonly ARCHIVE_SUFFIX=".dump"

# Journal horodaté (UTC) sur la sortie standard, et dans LOG_FILE s'il est défini.
log() {
  local line
  line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  printf '%s\n' "$line"
  if [[ -n "${LOG_FILE:-}" ]]; then printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true; fi
}

# Message d'erreur dans le journal (sortie d'erreur), puis sortie avec le code donné.
fail() {
  local code="$1"
  shift
  local line
  line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR $*"
  printf '%s\n' "$line" >&2
  if [[ -n "${LOG_FILE:-}" ]]; then printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true; fi
  exit "$code"
}

# Valeur d'un réglage : la variable d'environnement si elle est définie et non vide, sinon la ligne `CLÉ=` de ENV_FILE,
# sinon la valeur par défaut. Guillemets englobants et fin de ligne Windows retirés. Rien n'est exécuté.
read_setting() {
  local key="$1" default="${2:-}" value="${!1:-}"
  if [[ -z "$value" && -r "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
    value="${value%$'\r'}"
    if [[ ${#value} -ge 2 && ( "${value:0:1}" == '"' || "${value:0:1}" == "'" ) && "${value: -1}" == "${value:0:1}" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "${value:-$default}"
}

# Découpe une URL postgresql:// sans jamais l'afficher. Renseigne :
#   DB_URL      URL sans mot de passe (celui-ci passe par PGPASSWORD, exporté)
#   DB_HOST     hôte, DB_NAME nom de la base (pour le journal)
#   DB_IS_LOCAL 1 si l'hôte est la boucle locale
# Refuse (EXIT_CONFIG) une URL invalide, ou distante sans sslmode=verify-full (ENF-SEC-15). Le nom de la variable
# d'origine ($2) sert au message d'erreur, jamais sa valeur.
parse_database_url() {
  local url="$1" name="$2"
  local pattern='^(postgres(ql)?)://([^@/?#]*@)?([^/?#]*)(/([^?#]*))?(\?[^#]*)?$'
  [[ -n "$url" ]] || fail "$EXIT_CONFIG" "$name is empty"
  [[ "$url" =~ $pattern ]] || fail "$EXIT_CONFIG" "$name is not a valid postgresql:// URL"
  local scheme="${BASH_REMATCH[1]}" userinfo="${BASH_REMATCH[3]%@}" hostport="${BASH_REMATCH[4]}"
  local query="${BASH_REMATCH[7]}" user password=""
  DB_NAME="${BASH_REMATCH[6]}"
  [[ -n "$DB_NAME" ]] || fail "$EXIT_CONFIG" "$name has no database name"
  [[ -n "$userinfo" ]] || fail "$EXIT_CONFIG" "$name has no user"
  user="${userinfo%%:*}"
  if [[ "$userinfo" == *:* ]]; then password="${userinfo#*:}"; fi
  if [[ "$hostport" == \[* ]]; then DB_HOST="${hostport%%]*}]"; else DB_HOST="${hostport%%:*}"; fi
  case "$DB_HOST" in
    localhost | 127.0.0.1 | '[::1]') DB_IS_LOCAL=1 ;;
    *) DB_IS_LOCAL=0 ;;
  esac
  if [[ "$DB_IS_LOCAL" == 0 && ! "$query" =~ [?\&]sslmode=verify-full(\&|$) ]]; then
    fail "$EXIT_CONFIG" "$name must contain sslmode=verify-full (ENF-SEC-15)"
  fi
  # libpq cherche par défaut ~/.postgresql/root.crt ; Neon est signé par une autorité du magasin du système.
  if [[ "$DB_IS_LOCAL" == 0 && ! "$query" =~ [?\&]sslrootcert= && -z "${PGSSLROOTCERT:-}" ]]; then
    export PGSSLROOTCERT=system
  fi
  # Décodage des %XX du mot de passe (caractères réservés d'une URL).
  printf -v PGPASSWORD '%b' "${password//%/\\x}"
  export PGPASSWORD
  DB_URL="${scheme}://${user}@${hostport}/${DB_NAME}${query}"
}

# Choisit les outils PostgreSQL : ceux du poste s'ils sont en version >= PG_MAJOR, sinon ceux de l'image Docker
# postgres:PG_MAJOR (réseau de l'hôte, échanges par l'entrée et la sortie standard, aucun fichier monté).
# PG_CLIENT=local ou PG_CLIENT=docker force le choix.
select_pg_client() {
  local mode="${PG_CLIENT:-auto}" major=""
  if [[ "$mode" == auto ]]; then
    if command -v pg_dump >/dev/null 2>&1; then
      major="$(pg_dump --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
    fi
    if [[ -n "$major" && "$major" -ge "$PG_MAJOR" ]]; then mode=local; else mode=docker; fi
  fi
  case "$mode" in
    local) command -v pg_dump >/dev/null 2>&1 || fail "$EXIT_CONFIG" "pg_dump not found (PG_CLIENT=local)" ;;
    docker) command -v docker >/dev/null 2>&1 || fail "$EXIT_CONFIG" "pg_dump >= $PG_MAJOR and docker both missing" ;;
    *) fail "$EXIT_CONFIG" "PG_CLIENT must be auto, local or docker" ;;
  esac
  PG_CLIENT_MODE="$mode"
}

# Lance un outil PostgreSQL (pg_dump, pg_restore, psql, pg_isready) selon select_pg_client.
pg_tool() {
  local tool="$1"
  shift
  if [[ "$PG_CLIENT_MODE" == local ]]; then
    "$tool" "$@"
  else
    docker run --rm -i --network host -e PGPASSWORD -e PGSSLROOTCERT -e PGCONNECT_TIMEOUT \
      "$PG_IMAGE" "$tool" "$@"
  fi
}

# Archive quotidienne la plus récente de $1 (vide si aucune) ; les copies de sécurité de restore.sh sont exclues.
latest_archive() {
  find "$1" -maxdepth 1 -type f -name "${ARCHIVE_PREFIX}????-??-??T??-??-??Z${ARCHIVE_SUFFIX}" -printf '%f\n' 2>/dev/null \
    | sort | tail -n 1 | sed "s|^|$1/|"
}

# Nombre de tables d'une archive, lu dans sa table des matières (pg_restore --list).
archive_table_count() {
  pg_tool pg_restore --list <"$1" | grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE [^ ]+ [^ ]+ ' || true
}

# Durée écoulée depuis $1 (horodatage en millisecondes) au format « 12.345 s ».
elapsed_since() {
  local ms=$(($(date +%s%3N) - $1))
  printf '%d.%03d s' $((ms / 1000)) $((ms % 1000))
}
