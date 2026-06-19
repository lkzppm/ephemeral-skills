---
name: regex-cookbook
description: A working reference for building and debugging regular expressions — anchors, classes, quantifiers, groups, lookarounds, ready-made patterns, and the common traps. Load it to write a pattern, then drop it.
ephemeral: true
evict-after: used
evict-keep-tokens: 30
---

# Regex Cookbook

A reference for writing and debugging regular expressions. Pull it in when you
need to build a pattern; once the pattern is written and working, this body has
served its purpose and can be evicted.

## How to approach a pattern

1. Write down 3–5 strings that must match and 3–5 that must *not*. Build against
   both sets — most regex bugs are over-matching, not under-matching.
2. Anchor it. An unanchored pattern matches anywhere in the string; decide
   whether you mean "contains" or "is exactly".
3. Prefer explicit character classes over `.` — `.` is the main source of
   accidental matches.
4. Test against the failing inputs, not just the passing ones.

## Anchors & boundaries

| Token | Matches |
|-------|---------|
| `^` / `$` | start / end of string (or line, in multiline mode) |
| `\b` / `\B` | word boundary / not-a-word-boundary |
| `\A` / `\z` | absolute start / end of string (no multiline ambiguity) |

## Character classes

| Token | Matches |
|-------|---------|
| `\d` `\D` | digit / non-digit |
| `\w` `\W` | word char `[A-Za-z0-9_]` / non-word |
| `\s` `\S` | whitespace / non-whitespace |
| `[abc]` `[^abc]` | any of / none of |
| `[a-z]` | range |

## Quantifiers (greedy vs lazy)

| Token | Meaning |
|-------|---------|
| `*` `+` `?` | 0+, 1+, 0-or-1 (greedy — match as much as possible) |
| `*?` `+?` `??` | lazy — match as little as possible |
| `{n}` `{n,}` `{n,m}` | exactly n / n-or-more / between n and m |

Greedy `<.*>` over `<a><b>` matches the whole string; lazy `<.*?>` matches just
`<a>`. Reach for lazy whenever a delimiter repeats.

## Groups & references

- `(…)` capturing group; `(?:…)` non-capturing — use it when you only need
  grouping, not a capture (keeps capture numbers clean).
- `(?<name>…)` named capture; back-reference with `\k<name>` (or `\1` by index).
- Alternation: wrap it — `(?:cat|dog)s` — because `|` binds wider than you expect.

## Lookarounds (match without consuming)

| Form | Meaning |
|------|---------|
| `(?=…)` | lookahead — followed by |
| `(?!…)` | negative lookahead — not followed by |
| `(?<=…)` | lookbehind — preceded by |
| `(?<!…)` | negative lookbehind — not preceded by |

Example: `\d+(?= kg)` matches the number in `42 kg` but not the ` kg`.

## Ready-made patterns

> Pragmatic, not RFC-perfect — validate exact semantics elsewhere when it matters.

- Email (good enough): `[\w.+-]+@[\w-]+\.[\w.-]+`
- HTTP(S) URL: `https?://[^\s/$.?#].[^\s]*`
- ISO date `YYYY-MM-DD`: `\d{4}-\d{2}-\d{2}`
- Time `HH:MM(:SS)`: `\d{2}:\d{2}(?::\d{2})?`
- IPv4 (range-check octets separately): `(?:\d{1,3}\.){3}\d{1,3}`
- UUID: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
- Hex color: `#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b`
- Semver: `\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?`
- Quoted string (handles escapes): `"(?:[^"\\]|\\.)*"`
- Integer with thousands separators: `\d{1,3}(?:,\d{3})*`

## Flags

| Flag | Effect |
|------|--------|
| `i` | case-insensitive |
| `m` | `^`/`$` match per line |
| `s` | `.` also matches newline (dotall) |
| `x` | verbose — ignore whitespace, allow `# comments` |

## Common traps

- **Catastrophic backtracking.** Nested quantifiers over overlapping classes —
  `(a+)+$` — can hang on long non-matching input. Make subpatterns disjoint, or
  use atomic groups / possessive quantifiers where supported.
- **`.` eats too much.** It matches anything but newline by default; scope it
  (`[^"]`) instead of trusting greediness.
- **Escaping in the host language.** A backslash usually must be doubled in a
  normal string (`"\\d"`); use raw/verbatim literals (`r"\d"`, `@"\d"`, backticks)
  to avoid the double-escape.
- **Unicode.** `\w` and `\d` are often ASCII-only unless you set a unicode flag;
  `é` or `٤` won't match `\w`/`\d` without it.
- **Don't parse nested structures** (HTML, balanced parens) with regex — use a
  parser. Regex is for tokens, not trees.
