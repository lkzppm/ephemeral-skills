---
name: csv-wrangling
description: A working reference for cleaning and reshaping tabular / CSV data — robust reading, type coercion, dedupe, reshape, join, and the encoding traps. Load it for a data task, then drop it.
ephemeral: true
evict-after: used
evict-keep-tokens: 30
---

# CSV / Tabular Data Wrangling

A reference for getting messy tabular data into a clean, analyzable shape. Pull
it in for a data-cleaning task; once the transform is done, this body has served
its purpose and can be evicted.

## Read it robustly first

Most "bad data" bugs are really *parsing* bugs. Before transforming:

1. **Delimiter** — comma isn't guaranteed. Check for `,` `;` `\t` `|`. European
   exports often use `;` because the locale decimal separator is `,`.
2. **Quoting** — fields containing the delimiter, a quote, or a newline are
   wrapped in `"`, and embedded quotes are doubled (`""`). Use a real CSV parser,
   never `split(",")`.
3. **Encoding** — assume UTF-8, but watch for a BOM (`﻿`) glued to the first
   header, and for Latin-1/Windows-1252 (smart quotes; `é` showing up as `Ã©`).
4. **Header** — confirm there's exactly one, names are unique, and trim
   surrounding whitespace from each.
5. **Line endings** — `\r\n` vs `\n`; newlines *inside* quoted fields are legal
   and must survive parsing.

## Type coercion

- Decide each column's type explicitly; don't trust inference.
- Numbers: strip thousands separators and currency symbols; handle locale
  decimal commas (`1.234,56` → `1234.56`).
- Booleans: map a known set (`yes/no`, `1/0`, `true/false`, `y/n`) after
  case-folding.
- Dates: parse to ISO `YYYY-MM-DD`; never accept ambiguous `MM/DD` vs `DD/MM`
  without knowing the source locale.
- **Leading-zero IDs** (zip codes, SKUs, phone numbers): keep them as *strings*.
  Coercing to int silently drops the zero and can hit float precision.

## Missing & dirty values

- Normalize the many spellings of "missing" to one null: `""`, `NA`, `N/A`,
  `null`, `-`, `NaN`, whitespace-only.
- Trim whitespace; collapse internal runs of spaces if it affects keys.
- Normalize case and unicode (NFC) before comparing or grouping text keys.
- Decide *per column* whether to drop the row, fill a default, or leave null —
  don't apply one rule blindly to every column.

## Dedupe

- Define the key for "duplicate": the full row, or a subset of columns?
- When duplicates differ in their other columns, choose a rule — keep first,
  keep last, or aggregate — and sort by a tiebreaker (e.g. updated-at) first.

## Reshape

- **Wide → long (unpivot/melt):** one row per `(id, variable, value)`. Do this
  before aggregating across many value columns.
- **Long → wide (pivot):** one column per category; decide the aggregation for
  collisions (sum, mean, first) up front.
- **Split / combine columns:** split a `full_name`, or build a `date` from
  separate year/month/day columns.

## Join / merge

- Confirm the join key has the same type and normalization on both sides — a
  string `"01"` won't match an int `1`.
- Know the cardinality (1:1, 1:many, many:many). A surprise many:many join
  multiplies rows — check the row count after joining.
- Use a left join when you must keep all rows of the primary table, and inspect
  the non-matching keys rather than letting them silently vanish.

## Aggregate

- Group by the key columns; state the aggregation per measure (sum, mean, count,
  min/max).
- Count nulls separately — most aggregations skip them, which can mislead.

## Validate before you ship

- Row count in vs. out — and be able to explain any delta.
- Per column: null rate, distinct count, min/max, and a few sample values.
- Re-check that the key is unique if it's supposed to be.

## Write it back out

- Quote any field containing the delimiter, a quote, or a newline; double the
  embedded quotes.
- Pick and document the encoding (UTF-8) and the line ending.
- **Excel traps:** leading zeros and long numeric IDs get mangled on open, and
  values like `=1+1` or `+1` are read as formulas. Prefix-protect them or tell
  consumers to import-as-text rather than double-click the file.
