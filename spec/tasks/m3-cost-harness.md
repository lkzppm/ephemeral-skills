---
milestone:
  id: M3
  state: In Progress
  blockedBy: [M2]
title: "M3 — Empirical cost harness"
name: m3-cost-harness
description: "Real API calls with prompt caching on; record cache_read/cache_creation before/after eviction to validate ρ·s·M vs ω·X. Emit CSV + break-even plot."
tags: [milestone, empirical, cost, caching, m3]
updated: 2026-06-17
related:
  - docs/cost-model.md
  - spec/project/testing.md
  - spec/concepts/cache-correctness.md
---

# M3 — Empirical cost harness

> Milestone M3 · state: **Todo** · blocked by M2.

## Goal

Validate the cost model against real usage. Drive a real Agent SDK loop with
prompt caching on, recording `usage.cache_read_input_tokens` and
`usage.cache_creation_input_tokens` per step, before and after eviction.

## Scope

In:
- A runnable harness (fat skill → do work → evict → continue) against the live
  Messages API with caching enabled.
- Per-step usage capture; CSV output; a break-even plot.
- Cross-check `appliedEdits.tokensFreed` / `tokensReprocessed` against measured
  deltas.

Out:
- Productionizing the loop (M2 owns the loop; M3 only measures).

## Acceptance Criteria

- [ ] Per-tail-step `cache_read` drops by ≈ `ρ·s` after eviction.
- [ ] A one-time `cache_creation` spike ≈ `ω·X` appears at the eviction request.
- [ ] Measured `Δ` matches the prediction within tokenizer noise.
- [ ] Continuity holds: post-eviction, the model still references work done
      before the skill (file reads / tool results).
- [ ] Forced compaction does not resurrect the evicted skill.
- [ ] CSV + break-even plot committed.

## Notes

- This is the evidence that backs the M4 RFC. Keep raw captures so the numbers
  in `ISSUE_COMMENT_BODY.md` are reproducible.
