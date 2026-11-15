#!/usr/bin/env bash
#
# Wydanie DataLab: buduje paczke, gdy wersja w zrodlach rozni sie od tej
# w repozytorium paczek, i wypycha ja tam obok pozostalych rozszerzen —
# pod stala nazwa data-lab.vsix, z linia w versions.txt i w
# all-extensions.zip. Instalator (build-and-install.sh w paczkach) bierze
# wszystko, co wymienia versions.txt, wiec DataLab instaluje sie razem
# z reszta, bez zmian po stronie maszyny docelowej.
#
# Uzycie: release/push-to-releases.sh
#   RELEASE_REMOTE — adres repozytorium paczek (domyslnie https przez GitHuba)
#
# Zgodny z bashem 3.2 (macOS): bez mapfile, bez tablic asocjacyjnych.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${RELEASE_REMOTE:-https://github.com/beatahumeniuk/extensions-releases}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

DIR="data-lab"
ver="$(cd "$ROOT" && node -p "require('./package.json').version")"
id="$(cd "$ROOT" && node -p "const p=require('./package.json');p.publisher+'.'+p.name")"
pkgname="$(cd "$ROOT" && node -p "require('./package.json').name")"

git clone --depth 1 -q "$REMOTE" "$WORK/release-repo"
REL="$WORK/release-repo"

published="$(grep "^$DIR|" "$REL/versions.txt" 2>/dev/null | cut -d'|' -f3 || true)"
if [ "$published" = "$ver" ]; then
  echo "W paczkach jest juz $id@$ver — nic do wydania."
  exit 0
fi

echo "· $DIR: buduje $ver"
(cd "$ROOT" && npm ci --no-audit --no-fund >/dev/null && npm test >/dev/null && npm run package >/dev/null)
vsix="$ROOT/$pkgname-$ver.vsix"
if [ ! -e "$vsix" ]; then echo "nie powstal $vsix" >&2; exit 1; fi
inside="$(unzip -p "$vsix" extension/package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")"
if [ "$inside" != "$ver" ]; then echo "paczka ma w srodku $inside, a zrodla $ver" >&2; exit 1; fi
cp "$vsix" "$REL/$DIR.vsix"
rm -f "$vsix"

# versions.txt: ta linia nowa, reszta jak byla.
: > "$WORK/merged.txt"
printf '%s|%s|%s|%s\n' "$DIR" "$id" "$ver" "$DIR.vsix" >> "$WORK/merged.txt"
while IFS='|' read -r d i v f; do
  [ -n "${d:-}" ] || continue
  [ "$d" = "$DIR" ] && continue
  printf '%s|%s|%s|%s\n' "$d" "$i" "$v" "$f" >> "$WORK/merged.txt"
done < "$REL/versions.txt"
sort "$WORK/merged.txt" > "$REL/versions.txt"

# all-extensions.zip na nowo: wszystkie .vsix i instalator z paczek, staly
# znacznik czasu — ten sam komplet plikow daje ten sam zip.
mkdir -p "$WORK/bundle"
cp "$REL"/*.vsix "$REL/build-and-install.sh" "$WORK/bundle/"
TZ=UTC touch -t 198001010000 "$WORK"/bundle/*
(cd "$WORK/bundle" && zip -q -X -o "$WORK/all-extensions.zip" ./*)
mv "$WORK/all-extensions.zip" "$REL/"

# Kazda paczka ma w srodku wersje, ktora deklaruje versions.txt.
while IFS='|' read -r d i v f; do
  [ -n "${d:-}" ] || continue
  inside="$(unzip -p "$REL/$f" extension/package.json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch(e){console.log('?')}})")"
  if [ "$inside" != "$v" ]; then echo "$f: w srodku $inside, versions.txt mowi $v — przerywam" >&2; exit 1; fi
done < "$REL/versions.txt"

cd "$REL"
echo "W paczkach:" && cat versions.txt
git add -A
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -qm "Update data-lab $ver"
for attempt in 1 2 3; do
  if git push -q origin HEAD:main; then break; fi
  [ "$attempt" = 3 ] && exit 1
  sleep 20
  git pull --rebase -q origin main
done
echo "Wydane: $(git rev-parse --short HEAD)"
