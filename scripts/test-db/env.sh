# shellcheck shell=bash
# Réglages de la base de test des copies de travail. Sourcé par db.sh et run.sh ; ne lit aucun .env.

readonly TEST_COPIES_CONTAINER=tracandi-test-copies-db
readonly TEST_COPIES_VOLUME=tracandi-test-copies-data
readonly TEST_COPIES_IMAGE=postgres:18
# Port distinct de 5432 (service `db` de docker-compose.yml) et de 5435 (recette) : la mise en place des tests
# d'intégration efface le schéma, deux bases séparées ne se gênent jamais.
readonly TEST_COPIES_PORT="${TEST_COPIES_PORT:-5436}"
# Valeurs par défaut fictives de backend/tests/integration/test-database.ts.
readonly TEST_COPIES_NAME=tracandi_test
readonly TEST_COPIES_USER=tracandi_test
readonly TEST_COPIES_PASSWORD=tracandi_test

test_db_log() { printf '[test-db] %s\n' "$*"; }
test_db_fail() {
  printf '[test-db] ERREUR : %s\n' "$*" >&2
  exit 1
}

[[ "$TEST_COPIES_PORT" =~ ^[0-9]{1,5}$ ]] || test_db_fail "port refusé : « $TEST_COPIES_PORT » (chiffres seulement)"
