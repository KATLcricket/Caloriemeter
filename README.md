# Calorie Meter — QA tests

Automated tests that open `index.html` in an iPhone-sized browser and use the app
like you do: logging food, editing, calculators, backup/restore and CSV export.

## How changes go live

    edit index.html ──► git push ──► GitHub Actions runs QA tests
                                          │
                              all pass ───┴─── any fail
                                  │                │
                     deploys to GitHub Pages   nothing is published;
                     (main branch only)        the live app stays as it was

Other branches and pull requests are tested but never published, so you can try
a change on a branch and merge it into `main` once it's green.

## Run the tests on your laptop before pushing

First time only:

    cd qa
    npm ci
    npm run setup

Every time:

    cd qa
    npm test            # about 1–2 minutes
    npm run report      # opens the results with screenshots of any failure

## Reading results on GitHub

Actions tab → latest "Test and deploy" run. Red **QA tests** means the deploy was
skipped. The **qa-report** download at the bottom of the run has screenshots.
Data warnings (rows to check in your Excel sheet) appear in the run summary.

## Test files

| File | Covers |
|---|---|
| 01-smoke | Every tab loads without errors, works offline, 5 meal slots, 198 foods |
| 02-logging | Add / edit / remove, on-screen totals, decimals, reload, past days, midnight |
| 03-food-data | Database integrity; data warnings; duplicate items log correctly |
| 04-calculators | Katch-McArdle, Mifflin-St Jeor, goal modes, weekly rate, Navy tape, Deurenberg |
| 05-data-safety | Backup, restore, invalid backup files, CSV export |

Formulas are checked against independent implementations in `tests/refs.js`.

## Options

- `STRICT_DATA=1 npm test` — make the Excel data warnings fail instead of warn
- `MACRO_CSV=path/to/Macro_List.csv npm test` — compare every food against your
  sheet (columns: name,unit,qty,protein,carbs,fat,kcal, same row order as the app)
