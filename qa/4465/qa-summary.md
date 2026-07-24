# Self-QA — PR #4465 (feat(customers): make quick-add deal probability configurable)

- Branch pod testem: `carry/pr-4420-ready` @ `7aaa1d292`
- Runner: local (worktree cezara `645a9138…`), app na `http://localhost:3015` (3010/3011 zajęte przez inne sesje)
- Baza: świeża `mercato_qa4465` (docker `mercato-postgres`), `yarn workspace @open-mercato/app initialize`
- Użytkownik: `superadmin@acme.com` / `secret`, pipeline „Default Pipeline" (8 etapów) z seeda
- Narzędzia: Playwright (`qa-4465.mjs`), weryfikacja danych przez `GET /api/customers/deals?search=…`

## Wyniki

| Scenariusz | Oczekiwane | Zaobserwowane | Wynik |
|---|---|---|---|
| P0 — quick-add bez konfiguracji (domyślne) | pole Probability = 25, deal zapisany z probability 25 | pole = `25`; API: `probability = 25` | PASS |
| P1 — użytkownik czyści pole Probability | payload bez `probability`, deal bez wartości | API: `probability = null` | PASS |
| P2 — override `propsTransform` (`defaultProbability: null`) z `widgets/components.ts` aplikacji | pole puste bez ruszania kodu strony, deal bez probability | (uzupełniane) | (uzupełniane) |

## Zrzuty

- `shots/default-01-board.png` — tablica kanban
- `shots/default-02-dialog-more-details.png` — dialog „Quick deal" z rozwiniętą grupą „More details", Probability = 25
- `shots/default-03-filled.png` — wypełniony tytuł, probability nietknięte
- `shots/default-04-after-create.png` — po utworzeniu
- `shots/default-05-probability-cleared.png` — pole Probability wyczyszczone przez użytkownika
- `shots/override-*.png` — przebieg z override'em rejestru komponentów

## Uwagi z przebiegu

- Pola `CrudForm` nie mają `id`/`name`/`for` — selektory Playwrighta muszą lecieć po placeholderach.
- Baner „Demo Environment" (fixed, `z-banner`) przechwytuje kliknięcia w stopkę dialogu — w skrypcie usuwany z DOM przed submitem.
- Placeholder pola Probability pozostaje literalnym `25` niezależnie od `defaultProbability` — potwierdza uwagę nr 3 z code review.
- Pułapka cezara: nieśledzony katalog `apps/mercato/src/modules/qa_probability/` został skasowany przez autosave; override QA trafił finalnie do wersjonowanego `apps/mercato/src/modules/example/widgets/components.ts` (do cofnięcia po QA).
