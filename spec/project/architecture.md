---
name: architecture
description: The two delivery layers, the pure-core / SDK-at-edges contract, the reference CLI, why TypeScript, and the milestone order
tags: [architecture, layers, pure-core, milestones]
updated: 2026-06-17
---

# Architecture

## Two layers

- **Layer A — SDK reference strategy (this repo, built first).** A client-side
  transform over the `messages` array in an Agent SDK loop. This is the faithful
  prototype: the Claude Agent SDK *is* the Claude Code harness exposed as a
  library. It ships with a reference CLI (`cli/cli.tsx`, `npm start`) that
  demonstrates injection → use → eviction with a live cache-usage panel.
- **Layer B — native harness proposal (RFC).** The same selector implemented
  inside the harness as a `context-management` strategy, plus frontmatter and the
  model-invocable `clear_skill` tool. Specified in the RFC (M4), not implemented
  here.

## The pure-core contract

The core transform is a **pure function**:

```
clearSkillUses(messages, sideTable, opts) → { messages, sideTable, appliedEdits }
```

- **No network, no SDK coupling, no mutation of inputs.** Harness-agnostic.
- Skill blocks are their own content category, identified by `invocationId` from
  the side-table, never by content hashing
  ([skill-identification](../concepts/skill-identification.md)).
- `ephemeral: false` skills are never evicted unless a human forces it — the
  strict gate ([eviction-triggers](../concepts/eviction-triggers.md)).
- The SDK (`@anthropic-ai/sdk`) appears **only at the edges** — client instances
  and API requests in the loop, the CLI, and the M3 cost harness ([stack](stack.md)).

This boundary is also the project's provider-neutrality story: the transform just
manipulates a `messages` array, so it has no Anthropic coupling. The *economics*
that justify eviction (manual cache breakpoints, the `ω` write premium,
`cache_creation` / `cache_read` accounting) are Anthropic-specific, so the loop
and the empirical harness bind to the Anthropic SDK — but the core stays clean.

## Why TypeScript

- The typed contract already exists as `src/clearSkillUses.ts`, and M1 is
  `src/clearSkillUses.ts` + `tests/`.
- The harness being mirrored is **Claude Code**, a Node/TypeScript application;
  the `clear_tool_uses_20250919` strategy this parallels lives in that ecosystem.
  Building the prototype in the harness's own language is the lower-friction path
  to the RFC.
- The core is a pure function — trivial in either language — so nothing pulls
  toward Python.

## Milestone order

`M1 → M2 → M3 → M4`, gated. The canonical discipline is **M1 tests green before
M2**; the per-milestone specs live in [spec/tasks/](../tasks/). (Layer A spans
M1's pure core, M2's frontmatter + triggers + loop, and M3's cost harness + CLI;
M4 is the RFC.)
