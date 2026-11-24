#!/usr/bin/env bash
# Lance un agent de l'équipe (.claude/agents/<agent>.md) en ligne de commande, hors de l'application de bureau.
# Usage : scripts/equipe/lancer-agent.sh <agent> <nom> "<brief>" [dossier-de-travail]
#         scripts/equipe/lancer-agent.sh --etat
# Garanties : refuse si moins de MIN_DISPO_MO de mémoire disponible ou si MAX_AGENTS agents tournent déjà ;
# journal dans .claude/equipe/rapports/<nom>.log, rapport attendu dans <nom>.md (même dossier).
set -euo pipefail

MIN_DISPO_MO="${MIN_DISPO_MO:-3000}"
MAX_AGENTS="${MAX_AGENTS:-3}"

racine="$(cd "$(dirname "$0")/../.." && pwd)"
depot_principal="$(cd "$(git -C "$racine" rev-parse --git-common-dir)/.." && pwd)"
rapports="$depot_principal/.claude/equipe/rapports"
mkdir -p "$rapports"

memoire_dispo() { awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo; }
agents_en_cours() { pgrep -fa -- "--name equipe-" | grep -v pgrep || true; }

if [[ "${1:-}" == "--etat" ]]; then
  echo "Mémoire disponible : $(memoire_dispo) Mo (minimum pour lancer : $MIN_DISPO_MO Mo)"
  en_cours="$(agents_en_cours)"
  if [[ -z "$en_cours" ]]; then echo "Aucun agent en cours."; else
    echo "Agents en cours :"; sed -E 's/^([0-9]+) .*--name (equipe-[^ ]+).*/  pid \1  \2/' <<<"$en_cours"; fi
  exit 0
fi

if [[ $# -lt 3 ]]; then
  echo "Usage : $0 <agent> <nom> \"<brief>\" [dossier-de-travail]   |   $0 --etat" >&2
  exit 64
fi
agent="$1"; nom="$2"; brief="$3"; dossier="${4:-$depot_principal}"

[[ "$nom" =~ ^[a-z0-9-]+$ ]] || { echo "Nom invalide (minuscules, chiffres, tirets) : $nom" >&2; exit 64; }
definition="$racine/.claude/agents/$agent.md"
[[ -f "$definition" ]] || { echo "Agent inconnu : $agent ($(ls "$racine/.claude/agents" | sed 's/\.md$//' | tr '\n' ' '))" >&2; exit 64; }
[[ -d "$dossier" ]] || { echo "Dossier de travail introuvable : $dossier" >&2; exit 66; }

dispo="$(memoire_dispo)"
if (( dispo < MIN_DISPO_MO )); then
  echo "Refusé : $dispo Mo disponibles, il en faut $MIN_DISPO_MO. Attendre la fin d'un agent." >&2; exit 75
fi
nb="$(agents_en_cours | grep -c . || true)"
if (( nb >= MAX_AGENTS )); then
  echo "Refusé : $nb agents tournent déjà (maximum $MAX_AGENTS)." >&2; exit 75
fi

# La définition est passée par --agents : l'agent fonctionne même dans une copie de travail plus ancienne que
# .claude/agents (branche d'une PR ouverte avant l'ajout de l'équipe).
json="$rapports/.$nom.agents.json"
node - "$definition" "$agent" > "$json" <<'NODE'
const fs = require('fs');
const [file, name] = process.argv.slice(2);
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(fs.readFileSync(file, 'utf8'));
if (!match) { console.error(`Front matter absent : ${file}`); process.exit(65); }
const meta = Object.fromEntries(match[1].split('\n').map((line) => {
  const i = line.indexOf(':');
  return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
}));
const def = { description: meta.description, prompt: match[2] };
if (meta.model) def.model = meta.model;
if (meta.tools) def.tools = meta.tools.split(',').map((t) => t.trim());
process.stdout.write(JSON.stringify({ [name]: def }));
NODE

options=()
[[ "$agent" == "testeur-ecran" ]] && options+=(--chrome)
consigne="$brief

Ton rapport : $rapports/$nom.md (crée-le dès le début et tiens-le à jour). Rédige en français."

cd "$dossier"
nohup claude -p --agents "$json" --agent "$agent" --name "equipe-$nom" --permission-mode auto \
  --add-dir "$rapports" "${options[@]}" --output-format text "$consigne" > "$rapports/$nom.log" 2>&1 &
pid=$!
# Un échec immédiat (connexion expirée, option refusée) ne doit pas passer pour un lancement réussi.
sleep 8
if ! kill -0 "$pid" 2>/dev/null; then
  echo "Échec : l'agent s'est arrêté aussitôt. Journal :" >&2
  cat "$rapports/$nom.log" >&2
  grep -qi 'authenticate\|login' "$rapports/$nom.log" && echo "Reconnectez la ligne de commande : lancez « claude » dans un terminal, puis /login." >&2
  exit 70
fi
echo "Agent $agent lancé (pid $pid) dans $dossier"
echo "Journal : $rapports/$nom.log"
echo "Rapport : $rapports/$nom.md"
