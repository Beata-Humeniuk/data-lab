#!/usr/bin/env bash
# Zmiana w rozszerzeniu bez podbicia "version" w package.json przerywa:
# instalator rozpoznaje aktualnosc po wydawca.nazwa@wersja, wiec taka zmiana
# zostalaby po cichu pominieta. Uzycie: scripts/check-version-bump.sh BAZA GLOWA
set -euo pipefail
base="${1:-origin/main}"; head="${2:-HEAD}"
changed="$(git diff --name-only "$base" "$head" -- . ':(exclude)CLAUDE.md' ':(exclude)scripts/**' ':(exclude)release/**' | head -1)"
[ -n "$changed" ] || { echo "Brak zmian w rozszerzeniu."; exit 0; }
v1="$(git show "$base:package.json" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch(e){console.log('')}})")"
v2="$(git show "$head:package.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")"
if [ "$v1" = "$v2" ]; then echo "Zmiana w rozszerzeniu bez podbicia wersji ($v2)." >&2; exit 1; fi
echo "Wersja podbita: $v1 -> $v2"
