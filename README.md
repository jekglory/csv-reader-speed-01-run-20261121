# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/jekglory/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/jekglory/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` is a
dependency-free ES module whose `run(input)` returns exactly what csv-reader
1.0.0 returns for every `{text, header}` input — the same `{columns, rows,
errors}`, including its broken-row policy (BOM, stray CRs, quoted fields with
doubled quotes and embedded line breaks, quote junk, unterminated quotes,
short and long rows). It is faster because it scans with `indexOf` instead of
one character at a time: an unquoted field ends at the next comma or line
break, and a quoted field ends at the next quote that is not doubled, so each
field is found by a few native scans and taken as one slice.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## Run it

```sh
node main.ts
```

## Local verification

- Differential test against csv-reader 1.0.0: practice set 6/6 exact, 95
  hand-built edge cases, 150 cases drawn from the published generator —
  251 checks, 0 failures.
- Practice-set parse time, median of 15 rounds on this machine: ~151 ms
  against csv-reader 1.0.0's ~558 ms (~3.7x faster).

---

<sub>Entered on [make.fun](https://make.fun/?ref=wkrc9se2&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
