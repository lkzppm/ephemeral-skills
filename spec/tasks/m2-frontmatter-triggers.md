---
milestone:
  id: M2
  state: Done
  blockedBy: [M1]
title: "M2 — Frontmatter + triggers"
name: m2-frontmatter-triggers
description: "Parse ephemeral/evict-after/evict-keep-tokens; wire evict-after:used and threshold triggers into an Agent SDK loop."
tags: [milestone, frontmatter, triggers, loop, m2]
updated: 2026-06-17
related:
  - spec/concepts/eviction-triggers.md
  - spec/project/architecture.md
---

# M2 — Frontmatter + triggers

> Milestone M2 · state: **Blocked by M1** (don't start until M1 tests are green).

## Goal

Parse skill frontmatter and wire the triggers into an Agent SDK loop. This is the
first milestone that touches `@anthropic-ai/sdk` — at the edges only.

## Scope

In:
- Parse `ephemeral`, `evict-after` (`used | <N>-steps | <T>-tokens`),
  `evict-keep-tokens` from SKILL.md frontmatter into `SkillRecord` defaults.
- Implement `estimateTail` (default: `remainingTokenBudget / avgStepTokens`,
  pluggable).
- The **`clear_skill` model tool** (first-class): a tool definition + handler that
  resolves a skill name to its `invocationId` and calls `clearSkillUses` with
  `target` (never `force`).
- Wire `evict-after: used` (evict at first request after output is consumed) and
  the automatic token-threshold trigger into a reference loop that calls
  `clearSkillUses` before each send and places the cache breakpoint after `P`.
- Enforce the strict `ephemeral` gate (`force` only via the human `--force` path).

Out:
- Empirical cost validation (M3).

## Acceptance Criteria

- [ ] Frontmatter parses into side-table records; `ephemeral` defaults `false`.
- [ ] `evict-after: used` fires exactly once, on the first request after the
      skill's output is consumed.
- [ ] Threshold trigger evicts ephemeral skills oldest-first, respecting
      per-skill exclusion.
- [ ] The loop imports the SDK; the core stays SDK-free (lint/grep check).

## Notes

- Cache-breakpoint placement is the loop's responsibility, per
  [cache-correctness](../concepts/cache-correctness.md) — the core only returns
  rewritten messages + accounting.
