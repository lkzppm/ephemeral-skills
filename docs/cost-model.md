# Cost model: when does evicting a skill pay off?

This formalizes the prefix-cache economics of evicting a `SKILL.md` body
mid-session. It is the trigger policy behind `clear_skill_uses`.

## Price tiers (base input = 1)

| tier | symbol | value |
|------|--------|-------|
| cache-read | ρ | ≈ 0.1× |
| cache-write | ω | ≈ 1.25× (5-min TTL) / 2.0× (1-hr TTL) |
| fresh input | — | 1× |
| output | δ | separate axis |

**Assumption (load-bearing):** the model's generated trajectory is identical with
and without eviction — you only evict a skill you're *done* using, so it doesn't
change subsequent generations. Therefore all output cost `δ` is identical across
regimes and cancels. We model the input side only.

## Blocks (KV order)

```
[ P ][ S ][ x_1 … x_L ][ y_1 … y_M ]
```

- `P` (p tokens) — stable prefix (CLAUDE.md, prior turns). Cached, read every
  request in **both** regimes ⇒ cancels.
- `S` (s tokens) — the skill body.
- `X = Σ|x_j|` — the **lived band**: steps generated while the skill is in context
  and being used. Eviction happens right after `x_L`.
- `M` — number of subsequent requests (the **tail**) after eviction.

## Per-request KV state

**Persistent (normal skill):** `S` is written once, then read on the requests
generating `x_2…x_L` and `y_1…y_M` ⇒ `(L−1) + M` reads.

**Ephemeral (evict `S` after `x_L`):** `S` read on `x_2…x_L` only `(L−1)`, then gone.
The cut breaks the prefix above `x_1`, so the lived band reprocesses once → `ω·X`.

## Closed forms (non-cancelling terms only)

```
C_persist = ω·s + ρ·s·(L−1+M)
C_ephem   = ω·s + ρ·s·(L−1) + ω·X
```

Note `ω·s` (the skill's injection write) cancels — both regimes pay it once. `L`
cancels except through `X`. The difference:

```
Δ = C_persist − C_ephem = ρ·s·M − ω·X
```

## Decision rule

```
evict ⟺ Δ > 0 ⟺ ρ·s·M > ω·X ⟺ s·M > (ω/ρ)·X
```

`ω/ρ ≈ 12.5` (5-min) or `20` (1-hr). The **hurdle is steep** precisely because cache
reads are cheap: carrying a skill costs little per step, so eviction only wins when
the skill is large (`s`), lives long into the tail (`M`), and the lived band (`X`) is
small.

Break-even tail length:

```
M* = ω·X / (ρ·s)
```

### One subtlety the difference-formula hides

The lived band `X` is paid **twice** in absolute terms: once in the common baseline
(in-phase write+reads, cancels) and once as the `ω·X` penalty. Only the second
payment is a *regime difference*, so only it appears in `Δ`. (And it's `ω·X` — a
single write pass, all-in — **not** `(1+ω)·X`; re-caching on the eviction request
covers processing.)

## Worked examples (`s = 2000`, `X = 1500`, 5-min TTL)

| tail `M` | save `ρ·s·M` | spend `ω·X` | Δ | verdict |
|----------|--------------|-------------|-----|---------|
| 50 | 10,000 | 1,875 | **+8,125** | evict |
| 10 | 2,000 | 1,875 | +125 | ~break-even |
| 5  | 1,000 | 1,875 | −875 | keep |

`M* = 1875 / 200 ≈ 9.4` → need ~10+ tail requests for eviction to pay off on tokens.

## The non-token reason to evict anyway

The model above prices only tokens and usually makes eviction a *marginal* win.
But a large `SKILL.md` lingering in the prefix also degrades quality
("lost in the middle," attention dilution) for the whole tail. That effect is
outside this formula and can justify eviction even when `Δ < 0`. Treat `Δ` as the
token price of a context-hygiene decision, not the sole criterion.

## Timing corollary

Since the penalty is `ω·X` and `X` only grows the longer the skill lives, **evict the
instant the skill's output is consumed.** `evict-after: used` is the default for
exactly this reason.

## Empirical validation (M3)

The harness in `tests/` (to be built) drives a real Agent SDK loop with prompt
caching on and records `usage.cache_read_input_tokens` and
`usage.cache_creation_input_tokens` per step, before and after eviction, to confirm:

- per-tail-step `cache_read` drops by ≈ `ρ·s`,
- a one-time `cache_creation` spike ≈ `ω·X` at the eviction request,
- measured `Δ` matches the prediction within tokenizer noise.
