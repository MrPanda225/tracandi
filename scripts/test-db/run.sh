#!/usr/bin/env bash
# Lance les tests du backend de la copie de travail qui contient ce script sur la base de test des copies (scripts/test-db/db.sh),
# sans .env. Les variables TEST_DB_* passées ici priment sur un éventuel .env (test-database.ts).
# Usage :
#   scripts/test-db/run.sh                      tests d'intégration (npm run test:integration)
#   scripts/test-db/run.sh --coverage           tous les tests avec couverture (npm run test:coverage)
#   scripts/test-db/run.sh backend/tests/integration/x.test.ts   un fichier précis (chemin depuis le dossier d'appel)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
caller_dir="$PWD"
# shellcheck source=scripts/test-db/env.sh
source "$here/env.sh"

backend="$(cd "$here/../../backend" && pwd)"
vitest="$backend/node_modules/.bin/vitest"
# Jamais npx : sans node_modules, il téléchargerait une version de vitest non verrouillée et l'exécuterait.
[[ -x "$vitest" ]] || test_db_fail "vitest introuvable dans $backend : lancez d'abord « npm ci » dans backend"

# Une seule exécution à la fois sur cette base, toutes copies confondues : la mise en place des tests efface le schéma.
# Le verrou reste tenu par vitest (exec garde le descripteur) jusqu'à la fin des tests.
exec 9>"$TEST_COPIES_LOCK"
if ! flock -n 9; then
  test_db_log "une autre copie de travail lance ses tests sur cette base : attente de la fin"
  flock 9
fi

"$here/db.sh" up

# Un chemin de fichier donné depuis le dossier d'appel devient absolu : vitest le lirait sinon depuis backend/, ne
# trouverait rien, et réussirait sans aucun test (passWithNoTests).
args=()
for arg in "$@"; do
  if [[ "$arg" != -* && -e "$caller_dir/$arg" ]]; then args+=("$(realpath -- "$caller_dir/$arg")"); else args+=("$arg"); fi
done
if [[ ${#args[@]} -eq 0 ]]; then args=(--project integration); fi

cd "$backend"
exec env TEST_DB_HOST=127.0.0.1 TEST_DB_PORT="$TEST_COPIES_PORT" TEST_DB_NAME="$TEST_COPIES_NAME" \
  TEST_DB_USER="$TEST_COPIES_USER" TEST_DB_PASSWORD="$TEST_COPIES_PASSWORD" \
  VITEST_MAX_FORKS="${VITEST_MAX_FORKS:-1}" "$vitest" run "${args[@]}"
