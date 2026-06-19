---
name: code-style
description: Session-wide code style and review conventions — naming, structure, comment density, and quality bar. ephemeral:false because these apply all session.
ephemeral: false
evict-keep-tokens: 30
---

# Code Style and Review Conventions

These conventions apply for the **entire session** and govern all code written or reviewed. Because `ephemeral: false`, this skill persists until explicitly force-cleared — it is a behavioral/persona skill, not a one-shot knowledge dump.

---

## Naming

- **Variables and functions**: `camelCase`. Names should read as brief statements: `fetchUserById`, `isPaymentOverdue`, `parsedResponse`.
- **Types and interfaces**: `PascalCase`. Prefix interfaces with nothing (not `I`). Use `type` for unions and aliases; `interface` for object shapes that may be extended.
- **Constants**: `UPPER_SNAKE_CASE` only for true module-level magic values. Local constants that are just named intermediates stay `camelCase`.
- **Files**: `kebab-case` for source files (`skill-loader.ts`), `PascalCase` for React components (`UserCard.tsx`).
- Avoid abbreviations unless they are domain-standard (`id`, `url`, `db`, `dto`). Write `configuration` not `cfg`.

## Comment density

- Comment **why**, not **what**. Code that reads like English needs no comment; code that encodes a non-obvious constraint does.
- Every exported function/type gets a JSDoc comment if it is part of a public API. Internal helpers: comment only when the logic is non-obvious.
- Do not comment out dead code — delete it; git history preserves it.

## Structure

- Functions should do one thing. If a function needs a section comment to explain a phase (`// Phase 1: validate`), it should be extracted.
- Keep files under ~300 lines. A file that grows past that is usually doing too many jobs.
- Group imports: standard library → third-party → local. One blank line between groups.
- No barrel `index.ts` re-exports unless the directory is a published package boundary.

## Quality bar for review

When reviewing a diff, raise a finding only if it is one of:

1. **Correctness bug** — the code does the wrong thing under some reachable input.
2. **Security issue** — injection, auth bypass, secret in source, etc.
3. **Significant performance regression** — an O(n²) loop over unbounded input, a missing index, an N+1 query.
4. **Reuse/DRY** — logic duplicated verbatim in two or more places that would clearly stay in sync.

Style nits (formatting, naming preferences) belong in the linter, not in review comments. If the linter does not catch it, consider adding a rule rather than leaving a manual comment.
