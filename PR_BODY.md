# PR / RFC body draft

> Use this as (a) a comment reviving issue #21583, and/or (b) the description of a
> draft PR. Adjust the "What's in this PR" section to match what you actually land.

---

## Ephemeral skills: selective, cache-aware eviction of a `SKILL.md` from context

### Summary

Knowledge-delivery skills (e.g. a `/backend-knowledge` skill that explains how to
implement something) currently persist in context for the entire session after a
single invocation. Per the docs, an invoked skill's body "enters the conversation
as a single message and stays there for the rest of the session," and the only
relief is lossy, budget-driven auto-compaction (re-attaches ~5k tokens/skill,
25k combined). There is no way to deliberately drop *one* skill's body once it has
served its purpose while keeping file reads, tool results, and chat.

This proposes `clear_skill_uses` — the skill analogue of the existing
`clear_tool_uses_20250919` context edit: replace the skill body with a short
placeholder, keep the record that it ran.

### Why this isn't a duplicate of existing issues

This consolidates and *completes* a cluster of related requests, with a mechanism
none of them specify:

- **#21583 — Remove skills from context when not in use.** This is the canonical
  request and is currently stale. This work is its reference implementation +
  cost model. (I'm commenting there rather than opening a new issue.)
- **#39749 — Skill activation/deactivation per session.** Load-time enable/disable;
  orthogonal to *mid-session* eviction of an already-used skill.
- **#45091 — Clear context before skill execution.** Coarse `/clear` at the wrong
  boundary (before, all-or-nothing) vs. surgical single-skill excision after use.
- **#35150 — Programmatic clear + continuation injection.** Whole-context reset, not
  targeted.
- **#17283 — `context: fork` ignored on Skill tool.** Forking sheds the skill *and*
  history; this keeps history and sheds only the skill.

### The novel contribution: a cache-aware trigger

The reason this is more than "please add a button": eviction is **not always a
token win**, and naively dropping skills can cost more than it saves. With
prefix-cache pricing (read `ρ≈0.1`, write `ω≈1.25`/`2.0`), evicting a skill of `s`
tokens that would persist for `M` more requests, at the cost of reprocessing a
lived band of `X` tokens, nets out as:

```
saved   = ρ·s·M      (cheap reads avoided over the tail)
spent   = ω·X        (one-time reprocess of the lived band)
net win ⟺ ρ·s·M > ω·X ⟺ s·M > (ω/ρ)·X ≈ 12.5·X (5-min TTL)
```

So eviction should fire for **fat, long-lived** skills with a **small lived band**,
**as early as possible** (X grows the longer the skill lingers). The full
derivation, with empirical cache-token validation, is in the linked repo.

This turns "evict skills" from a blunt instinct into a policy the harness can apply
deterministically — and explains why behavioral/persona skills should *not* be
evicted (they're cheap to keep and you want them all session).

### Proposed shape

Frontmatter, opt-in (default `ephemeral: false`):

```yaml
ephemeral: true
evict-after: used          # used | <N>-steps | <T>-tokens
evict-keep-tokens: 30      # placeholder budget
```

Plus, ideally, a `clear_skill_uses` strategy under the existing
`context-management-2025-06-27` beta for API symmetry, and an optional
model-invocable `evict_skill(name)` for model-decided drops (gated).

Eviction leaves a stub ("skill X was invoked; re-invoke to reload"), marks the
skill so auto-compaction won't resurrect it, and returns an `applied_edits`-style
result (`skills_evicted`, `tokens_freed`, `tokens_reprocessed`).

### What's in this PR / repo

- A pure-function reference implementation of the `clear_skill_uses` transform on the
  Agent SDK (`src/clearSkillUses.ts`) + unit tests.
- The cost model and an empirical harness that measures real cache-token deltas.
- A PRD specifying frontmatter, triggers, placeholder semantics, the
  compaction-interaction fix, and edge cases.

### Honest scoping

I recognize core context-management behavior is sensitive and that the interactive
harness isn't community-developed, so I'm **not** expecting a direct merge. This is
an RFC + working reference implementation to (a) show #21583's demand is real and
met with a concrete, cache-correct design, and (b) give the team something to react
to. Happy to reshape toward whatever native form fits — including landing it purely
as a new `context-management` strategy type.

Repo: <link>
Cost model: <link>/docs/cost-model.md
