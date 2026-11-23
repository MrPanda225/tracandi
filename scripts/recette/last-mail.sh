#!/usr/bin/env bash
# Affiche le dernier e-mail capté par la recette (.run/mails.jsonl) : destinataire, objet, lien d'activation ou code
# de connexion à 6 chiffres. Aucun e-mail n'est réellement envoyé pendant une recette.
# Usage : scripts/recette/last-mail.sh
set -euo pipefail
# shellcheck source=scripts/recette/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

mails="$RECETTE_RUN_DIR/mails.jsonl"
[[ -s "$mails" ]] || recette_fail "aucun e-mail capté pour l'instant ($mails)"
tail -n 1 "$mails" | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const mail = JSON.parse(raw);
    const html = String(mail.html ?? "");
    const link = (html.match(/href="([^"]*activation[^"]*)"/) ?? [])[1];
    const code = (html.replace(/<[^>]+>/g, " ").match(/\b\d{6}\b/) ?? [])[0];
    console.log(`À      : ${[].concat(mail.to).join(", ")}`);
    console.log(`Objet  : ${mail.subject}`);
    if (link) console.log(`Lien   : ${link.replace(/&amp;/g, "&")}`);
    if (code) console.log(`Code   : ${code}`);
  });
'
