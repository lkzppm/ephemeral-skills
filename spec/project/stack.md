---
name: stack
description: Toolchain, package scripts, dependencies, and the SDK-only-at-edges dependency boundary
tags: [stack, build, tooling, typescript]
updated: 2026-06-17
---

# Stack

## Toolchain

| Concern | Tool |
|---|---|
| Language | TypeScript 5 (`tsconfig.json`), `strict: true`, ESM (`"type": "module"`) |
| Target / module | `ES2022` / `ESNext`, `moduleResolution: Bundler` |
| Tests | Vitest 2 (`vitest run`) |
| Typecheck | `tsc --noEmit` |
| Package manager | npm (`package.json`) |

## Scripts

```bash
npm test          # vitest run — the M1 gate
npm run test:watch
npm run typecheck # tsc --noEmit
```

## Dependencies

| Package | Role |
|---|---|
| `@anthropic-ai/sdk` (^0.30) | runtime dep — **edges only** (client instances + Messages API requests in the M2 loop and M3 cost harness) |
| `typescript`, `vitest` | dev deps |

## The dependency boundary

The core transform (`src/clearSkillUses.ts`) imports **nothing from the SDK** and
does no I/O — it is a pure `(messages, sideTable, opts) → { messages,
appliedEdits }` function. `@anthropic-ai/sdk` is imported only by the loop and
the cost harness that wrap the core. This keeps the core trivially testable and
harness-agnostic. See [architecture.md](architecture.md) for the rationale and
the rule.

> When adding code: if a file under `src/` that is part of the core transform
> reaches for `@anthropic-ai/sdk`, that's a smell — the SDK belongs at the edges.
