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

# Des dépendances installées qui ne sont plus celles de package-lock.json (dev a avancé depuis le dernier npm ci) font
# échouer les tests sur des erreurs trompeuses (« z.config is not a function » après le passage à zod 4).
stale_deps="$(node -e '
  const fs = require("fs");
  const path = require("path");
  const dir = process.argv[1];
  const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const pkg = read("package.json");
  const locked = read("package-lock.json").packages ?? {};
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const wanted = locked[`node_modules/${name}`]?.version;
    let installed = "absent";
    try { installed = read(`node_modules/${name}/package.json`).version; } catch {}
    if (installed !== wanted) console.log(`${name} ${installed} au lieu de ${wanted}`);
  }
' "$backend")"
[[ -z "$stale_deps" ]] || test_db_fail "dépendances de $backend à réinstaller (« npm ci » dans backend) :
$stale_deps"

# Les tests de lecture des CV appellent les vrais programmes, comme l'image de l'API : sans eux, cv-ocr et cv-one-page
# échouent. Simple avertissement, les autres tests restent utiles.
missing_tools=()
for tool in pdftoppm tesseract soffice; do command -v "$tool" >/dev/null || missing_tools+=("$tool"); done
[[ -x /usr/bin/time ]] || missing_tools+=(/usr/bin/time)
if command -v tesseract >/dev/null; then
  ocr_languages="$(tesseract --list-langs 2>/dev/null || true)"
  for language in fra eng; do grep -qx "$language" <<<"$ocr_languages" || missing_tools+=("tesseract ($language)"); done
fi
if [[ ${#missing_tools[@]} -gt 0 ]]; then
  ci_packages="$(sed -n 's/.*apt-get install -y --no-install-recommends \(.*tesseract.*\)$/\1/p' "$here/../../.github/workflows/ci.yml")"
  test_db_log "ATTENTION : absent de cette machine : ${missing_tools[*]} ; cv-ocr et cv-one-page échoueront."
  test_db_log "  paquets de la CI : sudo apt-get install -y --no-install-recommends ${ci_packages:-(voir .github/workflows/ci.yml)}"
fi

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
