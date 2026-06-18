---
name: overview
description: What clear_skill_uses is, its two delivery layers, the reference CLI showcase, the eviction transform pipeline, and where to look for each concern
tags: [overview, clear-skill-uses, context-management]
updated: 2026-06-17
---

# clear_skill_uses — Project Overview

This repository is a **reference implementation + RFC** for `clear_skill_uses`:
selective, cache-aware eviction of a skill's `SKILL.md` body from agent context
after the skill has been used. It is the skill analogue of the existing
`clear_tool_uses_20250919` context edit — where that strategy replaces bulky
`tool_result` bodies with a stub, this one replaces a consumed `SKILL.md` body
with a stub while keeping the record that the skill ran.

Skills are treated as their **own content category**, never as `tool_results`, so
`clear_skill_uses` is orthogonal to `clear_tool_uses` and carries its own eviction
policy (the `ephemeral` gate). See
[concepts/skill-identification.md](concepts/skill-identification.md).

The motivating gap is upstream issue **#21583**. Full requirements live in
[`PRD.md`](../PRD.md); the economic justification in
[`docs/cost-model.md`](../docs/cost-model.md); the upstream framing in
[`PR_BODY.md`](../PR_BODY.md).

## Two delivery layers

| Layer | What | Where |
|---|---|---|
| **A — SDK reference strategy** | A client-side transform over the `messages` array in an Agent SDK loop. Tags each skill block on injection; on trigger rewrites it to a placeholder before the next send. **Built first, in this repo.** | `src/clearSkillUses.ts`, `src/loop.ts`, `src/tools/clearSkill.ts` + `tests/` |
| **B — native harness proposal** | The same selector implemented inside the Claude Code harness as a `context-management` strategy, plus frontmatter and the model-invocable `clear_skill` tool. **Specified, not implemented here.** | RFC (M4) |

## Reference CLI showcase (`npm start`)

A local Ink TUI (`examples/cli.tsx`) that mimics the Claude Code surface to make the
mechanism visible: load skills from `skills/`, inject one with `/<name>`, do work,
then evict via `/clear-skill`, the model's `clear_skill` tool, or an automatic
trigger — and watch the per-turn `cache_read` / `cache_creation` panel show the
token drop. It is a demo / measurement surface, distinct from the un-patchable
production `claude` TUI. See [concepts/showcase-cli.md](concepts/showcase-cli.md).

## Stack

- **Language:** TypeScript 5 (ESM), strict mode. The harness being mirrored
  (Claude Code) is itself TypeScript/Node — see [project/architecture.md](project/architecture.md).
- **Tests:** Vitest. **Typecheck:** `tsc --noEmit`.
- **SDK:** `@anthropic-ai/sdk` — used **only at the edges** (client instances +
  API requests in the loop, the CLI, and the M3 harness). The core transform is
  pure and provider-agnostic. See [project/stack.md](project/stack.md).

## Runtime shape

```
Agent SDK loop (TypeScript, @anthropic-ai/sdk)        ← edges: instances + requests
  │
  ├─ on skill injection (/<name>):
  │     inject a { type:"skill", skill_name, body } block (sentinel-wrapped),
  │     record { invocationId, skillName, messageIndex, tokenLen, ephemeral } in side-table
  │
  ├─ triggers → choose target invocationIds:
  │     frontmatter evict-after · clear_skill tool (model) · threshold · /clear-skill (human)
  │
  └─ before each send:
        clearSkillUses(messages, sideTable, opts)      ← PURE CORE (no network, no SDK)
          ├─ gate: ephemeral:false never evicted unless opts.force
          ├─ select targets: opts.target, else policy (isEvictionWorthIt: ρ·s·M > ω·X)
          ├─ replace skill body → makeStub(); mark record.evicted = true (on a copy)
          ├─ leave every other block byte-identical
          └─ return { messages, sideTable, appliedEdits: { skillsEvicted, tokensFreed, tokensReprocessed } }
        │
        └─ place cache breakpoint after stable prefix P → POST /v1/messages → record usage
```

## Where to look for what

- What a skill block is + that it's its own category → [spec/concepts/skill-identification.md](concepts/skill-identification.md)
- The placeholder left behind → [spec/concepts/placeholder-stub.md](concepts/placeholder-stub.md)
- When eviction fires (frontmatter / clear_skill tool / threshold / manual) + the strict gate → [spec/concepts/eviction-triggers.md](concepts/eviction-triggers.md)
- Keeping the prefix cache warm + edit accounting → [spec/concepts/cache-correctness.md](concepts/cache-correctness.md)
- The reference CLI demo → [spec/concepts/showcase-cli.md](concepts/showcase-cli.md)
- The token economics / break-even → [docs/cost-model.md](../docs/cost-model.md)
- Layers, pure-core contract, language choice → [spec/project/architecture.md](project/architecture.md)
- Toolchain, scripts, deps → [spec/project/stack.md](project/stack.md)
- Test strategy (unit / regression / empirical) → [spec/project/testing.md](project/testing.md)
- Milestone specs (M1–M4) → [spec/tasks/](tasks/)
