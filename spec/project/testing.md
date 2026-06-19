---
name: testing
description: Local test strategy — unit, regression, cache-empirical, continuity, and compaction tests across the milestones
tags: [testing, vitest, cache-empirical]
updated: 2026-06-17
related:
  - PRD.md §11
---

# Testing Strategy

Mirrors PRD §11. Unit + regression tests are pure (no network) and gate M1.
Cache-empirical / continuity / compaction tests drive a real loop and land in M3.

## Unit (M1, pure)

Synthetic `messages` array with a tagged skill block →
- assert the stub replaces the body,
- assert every other block is **byte-identical** (`toEqual` on untouched indices),
- assert correct `tokensFreed` / `skillsEvicted`.

`tests/clearSkillUses.test.ts` already encodes the M1 cases — make them pass.

## Regression (M1/M2, pure)

An `ephemeral: false` skill is **never** touched by any policy trigger. (Explicit
`opts.target` is a separate, deliberate path — see
[eviction-triggers](../concepts/eviction-triggers.md).)

## Cache-empirical (M3, real API)

Drive a real Agent SDK loop with prompt caching on: fat skill → do work → evict →
continue. Assert per-subsequent-step `cache_read_input_tokens` drops by ≈ `ρ·s`,
and a one-time `cache_creation_input_tokens` spike ≈ `ω·X` at the eviction
request. Compare measured `Δ` to the predicted break-even
([docs/cost-model.md](../../docs/cost-model.md)).

## Continuity (M3)

After eviction, assert the model still has file-read / tool context (ask it to
reference a file read **before** the skill ran) — proves we dropped only the
skill, not the surrounding work.

## Compaction (M3)

Force compaction after an eviction; assert the evicted skill is **not**
re-attached (the `evicted` flag is honored — see
[cache-correctness](../concepts/cache-correctness.md) and PRD §9).
