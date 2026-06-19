# clear_skill_uses — let an agent drop a skill's instructions once it's done using them

> Use this as a comment on issue #21583 and/or the description of a draft PR.
> Fill in the repo link at the bottom before posting.

---

**TL;DR.** When a Skill is invoked, its entire `SKILL.md` body is pinned in
context for the rest of the session — even after the skill has finished its job.
There's no way to remove just that one skill. This is an RFC + working reference
implementation for `clear_skill_uses`: the skill analogue of
`clear_tool_uses_20250919`. It swaps a used-up skill body for a one-line stub,
keeps everything else byte-identical, and only fires when prefix-cache math says
it's a net win.

## The problem

Invoking a Skill drops its full `SKILL.md` body into the conversation as a
message. Per the docs, that body then "stays there for the rest of the session."

That's correct for a **persona / behavioral** skill you want active the whole
time. It's pure waste for a **knowledge** skill:

> You invoke `/backend-knowledge`. It injects ~3,000 tokens explaining how to
> wire up a service. The model reads it, writes the code, and moves on. Those
> 3,000 tokens now ride along in **every** subsequent request — re-sent,
> re-attended, never used again.

The only existing relief is global **auto-compaction**: lossy, triggered by a
token budget (not by "I'm done with this skill"), and it re-attaches skills
anyway. There is no surgical "this skill is finished — drop it." Tool results
have had exactly that since `clear_tool_uses_20250919`; skills are simply missing
the equivalent.

And the cost isn't only tokens — a fat skill stranded in the middle of the prompt
also dilutes attention ("lost in the middle") for the rest of the session.

## The solution

`clear_skill_uses` — the skill analogue of `clear_tool_uses`. When a skill is
done, replace its body with a short stub and keep the record that it ran:

```
[skill "backend-knowledge" was invoked earlier and evicted to free context.
 Re-invoke /backend-knowledge to reload it.]
```

Everything above and below stays byte-identical; the model still sees that the
skill ran and can reload it on demand. Opt in per skill, in frontmatter:

```yaml
ephemeral: true        # opt in (default is false)
evict-after: used      # used | <N>-steps | <T>-tokens
evict-keep-tokens: 30  # how small the leftover stub is
```

## The safety gate (the important part)

Eviction is governed by a strict `ephemeral` gate. `ephemeral: false` is the
default, and those skills — personas, guardrails, behavioral instructions — are
**never** evictable by policy or by the model. Only a deliberate human override
can drop them.

So the model can prune its own scratch knowledge, but it can **never** evict the
instructions that govern how it behaves. A skill cannot silently forget its own
rules.

## Why this isn't naive: it's cache-aware

Dropping a skill from the middle of the prompt isn't free — it breaks the
prompt-prefix cache at that point. The prefix **above** the cut stays warm, but
the band **below** it (the `X` tokens of work done while the skill was live) must
be reprocessed once.

So "should I evict?" is arithmetic, not instinct. With prefix-cache pricing
(read `ρ ≈ 0.1×`, write `ω ≈ 1.25×`):

```
recurring saving  =  ρ · s · M     cheap reads of the s-token body avoided, over M tail requests
one-time cost     =  ω · X         reprocess the lived band X, once

evict  ⟺  ρ · s · M  >  ω · X
```

Eviction wins for skills that are **big** (`s`), **long-lived** (`M`), with a
**small lived band** (`X`) — and the earlier you evict, the better, because `X`
only grows the longer the skill lingers. That single inequality is what lets a
harness decide deterministically, and it's exactly why behavioral skills should
*not* be evicted: they're cheap to keep and you want them all session.

The repo includes an empirical harness that checks this model against measured
`cache_read_input_tokens` / `cache_creation_input_tokens` deltas on real
requests.

## Proposed shape

1. **Frontmatter** as above — opt-in, default off.
2. **A `clear_skill_uses` strategy** under the existing
   `context-management-2025-06-27` beta — symmetric with `clear_tool_uses`.
3. **A model-invocable `clear_skill(name)` tool**, so the model can drop its own
   finished knowledge (gated — it can never target an `ephemeral: false` skill).

Each eviction leaves the stub, marks the skill so auto-compaction won't
resurrect it, and returns `{ skills_evicted, tokens_freed, tokens_reprocessed }`.

## What's in the repo

- A pure, provider-agnostic reference implementation of the transform
  (`src/clearSkillUses.ts`) + unit tests.
- A live Agent-SDK loop and CLI that make the per-turn cache-token drop visible.
- The cost model and an empirical harness that measures real cache-token deltas.
- A PRD covering frontmatter, triggers, stub semantics, the
  compaction-interaction fix, and edge cases.

## Relationship to existing issues

This is the reference implementation + cost model for **#21583** ("remove skills
from context when not in use", currently stale). It also subsumes the partial
asks in **#39749** (load-time enable/disable), **#45091** (`/clear` before
execution), **#35150** (programmatic clear), and **#17283** (`context: fork`) —
none of which specify a *cache-correct, single-skill, after-use* mechanism.

## Scope / ask

Core context-management behavior is sensitive and the interactive harness isn't
community-owned, so this is an **RFC + working reference**, not a merge request —
intended to show that #21583's demand is real and answerable with a concrete,
cache-correct design. Happy to reshape toward whatever native form fits,
including landing it purely as a new `context-management` strategy type.

Repo: <link>
