# Self-QA — PR #4460 (carry/pr-4449-ready + #4464)

Data: 2026-07-24 · Runner: local (Docker tylko dla Postgresa)
Testowany kod: `origin/carry/pr-4449-ready` (3390bdc55) + `#4464` (1a0f22ddc) — HEAD `qa-4460-merged`
Instancja: świeża baza `mercato_qa4460`, app na :3021, seed `yarn workspace @open-mercato/app initialize`, login `admin@acme.com`.
Artefakty: `.ai/cezar/runs/qa-4460/` (skrypty Playwright + `shots/`).

## Wynik zbiorczy

Wszystkie deklaracje PR-a potwierdzone (12/12). Trzy defekty znalezione po drodze — żaden nie jest regresją tego PR-a,
ale jeden (F2) sprawia, że nagłówkowa obietnica „working timeouts" nie działa po przejściu przez visual editor.

## PASS — deklaracje PR-a

| # | Test | Dowód |
|---|------|-------|
| QA-1 | Activity ID w TransitionsEditor edytowalny (fix #4464) | wpisano `call_billing_api` znak po znaku → wartość pełna, focus utrzymany |
| QA-2 | Niepoprawny pośredni JSON pozostaje edytowalny + błąd inline | tekst zachowany 1:1, komunikat „Unexpected end of JSON input" |
| QA-3 | Poprawny JSON formatuje się po blur | błąd znika, obiekt sparsowany, tekst przeformatowany wielolinijkowo |
| QA-5 | Niepoprawny draft wędruje ze swoją aktywnością przy zmianie kolejności | po przesunięciu draft stoi przy `call_billing_api` na nowej pozycji |
| API-1 | CALL_API bez `endpoint` odrzucone przy zapisie | 400 + `path: definition.transitions.0.activities.0.config.endpoint`, „CALL_API activity requires \"endpoint\"" |
| API-2 | SEND_EMAIL bez `to`/`subject` | 400, obie brakujące ścieżki wymienione osobno |
| API-3 | Poprawna aktywność zapisuje się | 201 |
| API-4 | `timeoutMs` przeżywa zapis (schemat go nie wycina) | odczyt z API zawiera `"timeoutMs":1500` |
| API-5 | Stary `timeout: "PT2S"` (ISO 8601) nadal przyjmowany | 201 |
| T-1 | `timeoutMs=1000` przerywa 6-sekundowe WAIT | instancja FAILED po 1077 ms, „Activity execution timeout after 1000ms" |
| T-2 | `timeoutMs=20000` nie przerywa tej samej aktywności | instancja COMPLETED po 6095 ms |
| T-3 | Stary `timeout: "PT1S"` egzekwowany przy wykonaniu | FAILED po 1054 ms, ten sam komunikat |
| T-4 | Brak timeoutu → aktywność kończy się normalnie | COMPLETED po 6058 ms |

## Znaleziska

### F1 — formularza „Create Workflow" nie da się zapisać z żadną aktywnością (stan zastany)

`TransitionsEditor` zapisuje `retryPolicy: {maxAttempts, retryDelay, backoffMultiplier}` (domyślne wartości nadaje
sam przy „Add Activity"), a `activityRetryPolicySchema` wymaga `{maxAttempts, initialIntervalMs, backoffCoefficient, maxIntervalMs}`.
Efekt: każdy zapis kończy się 400 „definition.transitions.0.activities.0.retryPolicy.initialIntervalMs — expected number, received undefined".
Potwierdzone też przez API (payload w kształcie z edytora → 400).

Stan zastany: na `origin/develop` oba pliki mają w tych miejscach identyczny kod. Nie jest to regresja #4460,
ale **blokuje ścieżkę QA P1 przez formularz definicji** — walidację wymaganych pól configu dało się potwierdzić tylko przez API.
Zrzut: `shots/06-save-blocked-missing-endpoint.png`.

### F2 — visual editor kasuje `timeoutMs` przy zapisie (nowo osiągalne przez ten PR)

`graphToDefinition` (`packages/core/src/modules/workflows/lib/graph-utils.ts:152`) przepisuje wyłącznie stare
`activity.timeout`; `timeoutMs` nie jest przenoszone. `EdgeEditDialog` również edytuje tylko pole `timeout` (string).

Reprodukcja bez żadnej edycji: definicja z `timeoutMs: 1500` → otwarcie visual editora → „Update" → w zapisanej definicji
`timeoutMs` już nie ma. Skutek wykonawczy: ta sama instancja, która wcześniej padała po 1,5 s, teraz przechodzi całe 6 s
(COMPLETED, 6272 ms) — timeout przestał działać, bez żadnego komunikatu.

Przed tym PR-em nie dało się tego stracić, bo schemat i tak wycinał `timeoutMs`. Po tym PR-ze pole jest trwałe wszędzie
poza visual editorem — czyli dokładnie „a timeout is stripped during save" z listy „what can go wrong" w instrukcji QA.

### F3 — visual editor po cichu gubi nowo dodaną aktywność (stan zastany)

W „Edit Transition": 1 aktywność → „Add Activity" → 2 aktywności → „Save Changes" (toast „Transition updated successfully")
→ ponowne otwarcie dialogu → znowu 1. Payload PUT zawiera jedną aktywność. Nowa aktywność nie dociera do walidacji,
więc użytkownik dostaje komunikat sukcesu i traci wprowadzone dane. `EdgeEditDialog.tsx` nie jest zmieniany w tym PR.
Zrzuty: `shots/19-dialog-with-new-activity.png`, `shots/21-dialog-reopened.png`.

Konsekwencja dla QA: komunikatu „Cannot save — …" z `visual-editor/page.tsx` nie da się wywołać przez UI, bo niepoprawna
aktywność nigdy nie trafia do payloadu. Sama walidacja jest potwierdzona na poziomie API (API-1/API-2), przez które
i tak przechodzą obie ścieżki UI.

### F4 — `ActivitiesEditor.tsx` nie ma wywołania produkcyjnego

Jedyne odwołania w repo to sam plik i jego test (`ActivitiesEditor.configJson.test.tsx`, 158 linii dodanych w tym PR).
Produkcyjną ścieżką jest `TransitionsEditor`. Do decyzji autora: podpiąć komponent albo usunąć wraz z testem.

## Rekomendacja

Zakres samego PR-a: PASS. F1/F3/F4 to osobne zgłoszenia. F2 warto naprawić w tym PR-ze albo natychmiastowym
follow-upie — inaczej „working timeouts" trzyma się tylko dopóki nikt nie otworzy definicji w visual editorze.
