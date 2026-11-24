#!/usr/bin/env bash
# Lance les tests du backend de la copie de travail courante sur la base de test des copies (scripts/test-db/db.sh),
# sans .env. Les variables TEST_DB_* passées ici priment sur un éventuel .env (test-database.ts).
# Usage :
#   scripts/test-db/run.sh                      tests d'intégration (npm run test:integration)
#   scripts/test-db/run.sh --coverage           tous les tests avec couverture (npm run test:coverage)
#   scripts/test-db/run.sh tests/integration/x.test.ts   un fichier précis
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/test-db/env.sh
source "$here/env.sh"

"$here/db.sh" up
args=("$@")
if [[ ${#args[@]} -eq 0 ]]; then args=(--project integration); fi

cd "$here/../../backend"
exec env TEST_DB_HOST=127.0.0.1 TEST_DB_PORT="$TEST_COPIES_PORT" TEST_DB_NAME="$TEST_COPIES_NAME" \
  TEST_DB_USER="$TEST_COPIES_USER" TEST_DB_PASSWORD="$TEST_COPIES_PASSWORD" \
  VITEST_MAX_FORKS="${VITEST_MAX_FORKS:-1}" npx vitest run "${args[@]}"
