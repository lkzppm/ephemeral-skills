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
- The **`invoke_skill` model tool**: a tool definition + handler (in the loop) that
  loads a skill's full SKILL.md body into context on demand (progressive
  disclosure). Eviction is **not** a model tool — see
  [eviction-triggers § Why eviction is not a model tool](../concepts/eviction-triggers.md).
- Wire `evict-after: used` (evict deterministically at the end of the turn that
  consumes the skill) and the automatic token-threshold trigger into a reference
  loop that calls `clearSkillUses` and places the cache breakpoint after `P`.
- Enforce the strict `ephemeral` gate (`force` only via the human `--force` path).

Out:
- Empirical cost validation (M3).

## Acceptance Criteria

- [ ] Frontmatter parses into side-table records; `ephemeral` defaults `false`.
- [ ] `evict-after: used` fires exactly once, at the end of the turn that consumes
      the skill (reprocess paid on the next request).
- [ ] Threshold trigger evicts ephemeral skills oldest-first, respecting
      per-skill exclusion.
- [ ] The loop imports the SDK; the core stays SDK-free (lint/grep check).

## Notes

- Cache-breakpoint placement is the loop's responsibility, per
  [cache-correctness](../concepts/cache-correctness.md) — the core only returns
  rewritten messages + accounting.
