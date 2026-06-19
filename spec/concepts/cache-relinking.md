---
name: cache-relinking
description: A visual walkthrough of what eviction does to the prompt-prefix KV cache — the block chain, the snip-and-rebuild at the stub, and a turn-by-turn usage trace showing the one-time cache_creation spike and the recurring cache_read drop
tags: [prompt-caching, kv-cache, visualization, cache-correctness]
updated: 2026-06-19
anchors:
  - src/clearSkillUses.ts:clearSkillUses
  - src/clearSkillUses.ts:makeStub
  - src/loop.ts:buildAnthropicMessages
related:
  - spec/concepts/cache-correctness.md
  - docs/cost-model.md
  - PRD.md §8
---

# Re-linking the KV Cache

A picture-first companion to [cache-correctness](cache-correctness.md). That doc
states the invariants; this one *shows* them — what physically happens to the
prompt-prefix cache when `clearSkillUses` evicts a skill, and what the per-turn
`usage` numbers look like as it happens. Hand this to someone who needs to *see*
the mechanism.

## 1. The KV cache is a prefix chain

Prompt caching is a **prefix match**. The API stores the attention key/value
tensors for a span of the prompt and keys them by the exact bytes up to a
`cache_control` breakpoint (render order: `tools` → `system` → `messages`). Each
turn the project drops one breakpoint on the **last block** of the conversation
(`src/loop.ts:buildAnthropicMessages`), so the whole transcript so far becomes
one cached prefix the next turn reads back cheaply.

Think of it as a chain of links, each link cached on the one before it:

```
  system + CLAUDE.md      skill body         work while using it     later turns
 ┌────────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
 │       P        │──▶│      S        │──▶│   x₁ … x_L  (X)   │──▶│  y₁ … y_M    │
 └────────────────┘   └──────────────┘   └──────────────────┘   └──────────────┘
   stable prefix         SKILL.md           "lived band"             the tail
   (~4,000 tok)          (~2,000 tok)        (~1,500 tok)          breakpoint ↑ here
```

Every turn, the chain up to the breakpoint is **read** at the cache-read price
`ρ ≈ 0.1×`; only the new tail tokens are processed fresh and written at the
cache-write price `ω ≈ 1.25×`. Carrying `S` forward costs just `ρ·s` per turn —
cheap, which is exactly why the eviction hurdle is steep (see
[cost-model](../../docs/cost-model.md)).

## 2. Eviction snips one link and rebuilds the chain below it

`clearSkillUses` replaces the `S` body with a ~30-token stub
(`src/clearSkillUses.ts:makeStub`) and leaves **every other block
byte-identical**. Because the cache is a prefix match, changing the bytes at
`S` invalidates the cached chain *from `S` onward* — but **not** `P`, which sits
before the cut and is still byte-for-byte identical.

```
        BEFORE (turn N, steady state)                AFTER eviction (turn N+1)

  P ──▶ S ──▶ X ──▶ (breakpoint)            P ──▶ ░░ ──▶ X ──▶ (breakpoint)
  ▓▓    ▓▓    ▓▓                            ▓▓    ▒▒     ▒▒
  warm  warm  warm                         warm  rebuilt rebuilt
  read  read  read                         read  ─── one write pass ω·X ───▶

      ▓▓ = cache HIT (read, ρ)      ░░ = stub (tiny, fresh)     ▒▒ = reprocessed + re-cached this turn
```

The link from `P` holds — `P` stays warm and is read at `ρ`. The links below the
snip (`stub`, then `X`, then this turn) are recomputed **once** and written into
a *new* cached prefix on the **same request**. That single rebuild is the
all-in `ω·X` penalty — not `(1+ω)·X`; re-caching on the eviction request covers
the processing.

From the next turn on, the tail re-links onto the new, shorter warm prefix
`[P][stub][X]` — `S` is simply gone from the chain, so every tail read is
`ρ·s` cheaper.

```
   turn N+2 onward (new steady state)
   P ──▶ stub ──▶ X ──▶ y₁ ──▶ y₂ …
   ▓▓     ▓▓      ▓▓     ▓▓
   all warm again — but S (2,000 tok) no longer in the read prefix
```

## 3. What the `usage` block actually shows

This is the live signal the showcase panel reads (`loop.ts` records
`cache_read_input_tokens` / `cache_creation_input_tokens` per send; the field
shape is exactly what the Databricks-backed Haiku endpoint returns):

```jsonc
"usage": {
  "input_tokens": 12,                 // uncached, full price
  "output_tokens": 240,
  "cache_creation_input_tokens": 0,   // tokens WRITTEN this turn  (ω)
  "cache_read_input_tokens": 0,       // tokens READ from cache    (ρ)
  "cache_creation": { "ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 0 }
}
```

Trace across the eviction, with the block sizes from §1
(`P=4,000`, `S=2,000`, stub≈30, `X=1,500`, ~200 new tokens/turn):

| turn | event | `cache_read` | `cache_creation` | what you're seeing |
|---|---|---:|---:|---|
| N−1 | skill in use | ~7,500 | ~200 | reads `[P][S][X]` warm; writes the turn's delta |
| **N** | **/clear-skill fires before send** | **~4,000** | **~1,730** | only `[P]` still matches; **stub+X rebuilt → the one-time `ω·X` spike** |
| N+1 | first tail turn | ~5,730 | ~200 | reads `[P][stub][X]` warm; `S` gone |
| N+2 | tail turn | ~5,930 | ~200 | … each tail read ≈ **1,970 lower** than the no-evict baseline |

Two fingerprints make the mechanism unmistakable in the panel:

- **One spike** in `cache_creation` at the eviction turn ≈ `ω·X` (here ~1,730 = stub + reprocessed lived band).
- **A permanent step-down** in `cache_read` on every tail turn afterward ≈ `s − stub` (~1,970 tokens), i.e. the `ρ·s`-per-step saving.

```
 cache_read (vs the counterfactual "never evict")
   7.7k ┤▓▓▓▓▓▓▓▓ baseline (S stays in prefix forever) ▓▓▓▓▓▓▓▓▓▓▓▓
        │        ╲
   5.7k ┤         ╲____ evicted: S dropped from the read prefix ____
        │              (gap ≈ ρ·s saved every tail turn)
        └────┬────┬────┬────┬────┬────┬────▶ turns
             N-1  N    N+1  N+2  N+3  N+4
                  ▲
 cache_creation   └─ one-time ω·X spike here, then back to baseline
```

## 4. Reading it back: numbers → `appliedEdits` → the decision

`clearSkillUses` reports the same two quantities the trace shows, so the panel's
prediction can be checked against measured `usage` (M3):

| `appliedEdits` field | trace fingerprint | value here |
|---|---|---|
| `tokensFreed` | the recurring `cache_read` step-down | `s − stub` ≈ **1,970** |
| `tokensReprocessed` | the one-time `cache_creation` spike | `X` ≈ **1,500** |

The whole picture is the decision rule from [cost-model](../../docs/cost-model.md):

```
Δ = ρ·s·M − ω·X        evict ⟺ Δ > 0        break-even  M* = ω·X / (ρ·s)
```

Recurring saving (`ρ·s` × tail length `M`) versus one-time re-link cost (`ω·X`).
With these blocks, `M* ≈ 1.25·1500 / (0.1·2000) ≈ 9.4` — eviction pays for itself
once ~10+ tail turns remain. The diagram is that inequality made physical: the
spike is paid once; the step-down repeats every turn for the rest of the session.

## 5. Why `P` never reprocesses (the load-bearing rule)

The whole win depends on the cut landing **after** the stable prefix. Two things
guarantee it:

- **`P` is left byte-identical.** `clearSkillUses` rewrites only the targeted
  skill block and returns new arrays without touching anything above it
  (`src/clearSkillUses.ts:clearSkillUses`, the no-mutation rule). If P's bytes
  shifted, the cut would move up to P and the rebuild would be `ω·(p+X)` — often
  swamping the saving.
- **The breakpoint is dropped after the stable region**, so `[P]` remains a
  valid, readable cache entry on the eviction turn.

Caveat for very long single turns: a breakpoint walks back at most ~20 content
blocks to find a prior entry. If the lived band between the stub and the new
breakpoint exceeds that, place an intermediate breakpoint so the tail can still
re-link to the rebuilt prefix instead of silently missing.
