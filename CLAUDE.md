# Zasady pracy w tym repo (DataLab)

DataLab to rozszerzenie VS Code wydzielone z Logic Spec (2026-11-15:
„to już nie będzie brudnopis tylko nowe rozszerzenie o nazwie DataLab").
Zasady są te same co w repozytorium `beatahumeniuk/extensions` — niżej
to, co dotyczy tego repo.

## PowerShell — zakaz

**Nie twórz skryptów PowerShella. Nigdy, w żadnej formie** — ani `.ps1`,
ani nakładki, ani `powershell -Command`, ani przykładu w README.
Właścicielka pracuje w terminalu VS Code i uruchamia wyłącznie bash.
Skrypty `.sh` zgodne z **bashem 3.2** (bez `mapfile`, `wait -n`, tablic
asocjacyjnych).

## GitHub Actions — nic nie uruchamia się samo

Żadnych workflow uruchamianych automatycznie („nie stać mnie na ani jeden
więcej"). Kontrole robisz w sesji: `npm test`,
`scripts/check-version-bump.sh origin/main HEAD`.

## Zmieniasz rozszerzenie → podbij wersję

**Zawsze** (`version` w `package.json` i `package-lock.json`, wpis na
górze `CHANGELOG.md`). Instalator rozpoznaje aktualność po
`beatahumeniuk.data-lab@wersja` — zmiana bez podbicia zostaje po cichu
pominięta.

## Pull requesty scalasz sam, wydajesz od razu

- Nową pracę zaczynasz od `git checkout -B <gałąź> origin/main`.
- PR scalasz sam (squash, tytuł z `(#NN)` na końcu), gdy `npm test`
  i `check-version-bump.sh` przechodzą — bez pytania.
- **Zaraz po scaleniu wydajesz**: `release/push-to-releases.sh` buduje
  paczkę i wypycha ją do `beatahumeniuk/extensions-releases` jako
  `data-lab.vsix`, z linią w `versions.txt` i w `all-extensions.zip` —
  obok pozostałych rozszerzeń. Właścicielce podajesz adres
  `https://raw.githubusercontent.com/beatahumeniuk/extensions-releases/main/data-lab.vsix`
  dopiero, gdy wersja jest w `versions.txt`.
- Nic nie zostaje na gałęziach: przed końcem `git status`,
  `git stash list`, gałąź względem `main`.
- Nigdy nie odsyłasz właścicielki do ręcznego wgrywania, edycji JSON-a ani
  innych plików — czego nie da się wyklikać, to brak w rozszerzeniu.

## Silnik — kopia z Logic Spec

`src/flowRun.js`, `src/mappingRun.js`, `src/sampleFormats.js`,
`src/howKinds.js`, `src/fragments.js`, `src/mapCore.js`, `src/miniXml.js`,
`src/themeScheme.js` to kopie plików z `extensions/logic-spec/src/` — ten
sam wynik kroku tu i we flow. Poprawka silnika idzie do obu repozytoriów
(z podbiciem wersji w obu). Klucze komunikatów silnika (`how.*`, `run.*`,
`op.*`, `fr.why.*`) w `src/nls.js` mają to samo brzmienie co w Logic Spec.

„Otwórz jako projekt flow" otwiera projekt flow laboratorium w Logic Spec
poleceniem `logicSpec.openLabFlow` ({ id, name, inputs }) — projekt flow
mieszka w pamięci Logic Spec, DataLab tylko przekazuje dane.

## Rozszerzenie nie zmienia kodu

Zapis wyłącznie do pamięci rozszerzenia (`globalStorage/labs/<id>/lab.json`).
Nic w projekcie, nic w `.vscode/settings.json`. Pliki Logic Spec
(`globalStorage/beatahumeniuk.logic-spec/scratch`) DataLab tylko czyta,
przy jednorazowym przejęciu brudnopisów.

## Kod uniwersalny, bez kodu z pracy właścicielki

Reguły działają na tym, co mówią same dane, nie na nazwach z jednego
projektu. Testy i przykłady na zmyślonych danych; nic ze zrzutów ekranu
z pracy właścicielki nie trafia do repo. Nie prosisz o jej dane.

## Usuwasz napis — nie funkcję

Gdy właścicielka każe usunąć tekst z ekranu, znika tylko tekst. Jeśli po
zmianie czegoś nie da się wyklikać — pytasz przed.

## Widok

- Teksty dla użytkownika: angielski bazą, polski tłumaczeniem
  (`src/nls.js`, `package.nls.json` + `package.nls.pl.json`); kod
  i komentarze po angielsku.
- Bez narzuconych kolorów i motywu; wartości zapasowe kolorów to kolory
  systemowe (`Field`, `Canvas`, `CanvasText`) — pilnuje
  `test/theme-scheme-test.js`.
- Zrzuty ekranu w ciemnym motywie VS Code: `test/webviewTheme.js`,
  `themed(html, 'dark')`.
- Elementy list numerowane od 0 (indeks).
- Teksty bezosobowe, bez zbędnych słów, bez słowa „inaczej", bez emoji.
