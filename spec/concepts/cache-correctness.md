---
name: cache-correctness
description: The prefix-cache invariants eviction must honor (breakpoint after P, one write pass ω·X), the AppliedEdits accounting, and the no-mutation purity rule
tags: [prompt-caching, cache-correctness, applied-edits, purity]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:AppliedEdits
  - src/clearSkillUses.ts:ClearSkillUsesResult
related:
  - PRD.md §8, §9
  - docs/cost-model.md
---

# Cache Correctness

## The invariant

Eviction rewrites a message in the middle of the array, which breaks the cached
prefix at the stub. Prompt caching is a **prefix match** — any byte change
invalidates everything after it. To remain a net token win the implementation
MUST (PRD §8):

- Place the cache breakpoint immediately **after the stable prefix `P`** so `P`
  stays warm; only the post-stub region reprocesses.
- Re-cache the reprocessed region on the **same request** — one write pass
  `ω·X`, all-in. Do **not** pay fresh `1×` then write separately; that would be
  `(1+ω)·X`. (See the subtlety note in [docs/cost-model.md](../../docs/cost-model.md).)
- Leave every non-targeted block **byte-identical** so the region below the cut
  is reusable on the next turn.
- Mark `record.evicted = true` so **auto-compaction does not resurrect** the
  skill (PRD §9). Compaction's re-attach logic must skip flagged records.

## AppliedEdits accounting

`clearSkillUses` returns `appliedEdits` so callers can verify the cost model
empirically (M3):

| field | meaning |
|---|---|
| `skillsEvicted` | count of skill bodies replaced this pass |
| `tokensFreed` | Σ`s` − stub — the recurring per-tail-step saving (≈ `ρ·s` per step over the tail `M`) |
| `tokensReprocessed` | `X`, the lived band that reprocesses once at the cut (the one-time `ω·X` penalty) |

In M3 these are cross-checked against measured `usage.cache_read_input_tokens`
and `usage.cache_creation_input_tokens` deltas: per-tail-step `cache_read` should
drop by ≈ `ρ·s`, with a one-time `cache_creation` spike ≈ `ω·X` at the eviction
request.

## Purity

`clearSkillUses` must **not mutate its inputs** — return new arrays/objects.
Breakpoint placement and the actual API send happen in the loop (the edges), not
in the core. The core only computes the rewritten `messages` and the accounting.
