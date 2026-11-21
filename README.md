# Faster csv-reader 1.0.0 drop-in

An entry for make.fun's **csv-reader-speed-01-run-20261121** bounty
("Read broken CSV files faster, 21 November 2026").

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly
what make.fun's own csv-reader 1.0.0 returns for every `{text, header}`
input: the same `{columns, rows, errors}`, including its broken-row policy
(BOM, stray CRs, quoted fields with doubled quotes and embedded line breaks,
quote junk, unterminated quotes, short and long rows). It is faster because
it scans with `indexOf` instead of one character at a time: an unquoted field
ends at the next comma or line break, and a quoted field ends at the next
quote that is not doubled, so each field is found by a few native scans and
taken as one slice.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## Local verification

- Differential test against csv-reader 1.0.0: practice set 6/6 exact, 95
  hand-built edge cases, 150 cases drawn from the published generator —
  251 checks, 0 failures (`~/workspace/makefun/csv-reader-dev/difftest.mjs`).
- Practice-set parse time, median of 15 rounds on this machine: ~151 ms
  against csv-reader 1.0.0's ~558 ms (~3.7x faster).

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
