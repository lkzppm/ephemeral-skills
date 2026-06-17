# CLAUDE.md

Thin router into the spec ecosystem. Read the relevant spec before implementing;
don't duplicate it here.

## What this repo is

Reference implementation + RFC for `clear_skill_uses`: selective, cache-aware
eviction of a skill's `SKILL.md` body from agent context after it's been used —
the skill analogue of `clear_tool_uses_20250919`. Two layers: **A** = a
client-side transform in an Agent SDK loop (built here — pure core
`src/clearSkillUses.ts`, the SDK loop, the `clear_skill` tool, and a `npm start`
CLI); **B** = a native harness strategy (RFC only). Skills are their own content
category, never `tool_results`. See [spec/overview.md](spec/overview.md).

## Stack

TypeScript 5 (ESM, strict) · Vitest · `tsc --noEmit` · `@anthropic-ai/sdk`
**at the edges only** (the core transform is pure and provider-agnostic).

## Runtime shape

```
Agent SDK loop (edges: instances + requests + clear_skill tool)
  ├─ on skill injection: inject { type:"skill", … } block (sentinel-wrapped) + record in side-table
  ├─ triggers: frontmatter evict-after · clear_skill (model) · threshold · /clear-skill (human)
  └─ before each send:
       clearSkillUses(messages, sideTable, opts) → { messages, sideTable, appliedEdits }   ← PURE CORE
       │  (ephemeral:false never evicted unless opts.force)
       └─ place cache breakpoint after stable prefix P → POST /v1/messages → record usage
```

## Spec index

| Spec | Read when… |
|---|---|
| [spec/overview.md](spec/overview.md) | Orienting; the two layers; the transform pipeline |
| [spec/project/architecture.md](spec/project/architecture.md) | Layers; pure-core/SDK-at-edges contract; why TS; milestone order |
| [spec/project/stack.md](spec/project/stack.md) | Toolchain, scripts, deps, the SDK dependency boundary |
| [spec/project/testing.md](spec/project/testing.md) | Test strategy across milestones |
| [spec/concepts/skill-identification.md](spec/concepts/skill-identification.md) | Locating a skill block; the `invocationId` side-table; edge cases |
| [spec/concepts/placeholder-stub.md](spec/concepts/placeholder-stub.md) | The stub; why keep the record; keep-tokens budget |
| [spec/concepts/eviction-triggers.md](spec/concepts/eviction-triggers.md) | The three triggers + the `clear_skill` tool; the strict `ephemeral` gate; `target` vs policy |
| [spec/concepts/cache-correctness.md](spec/concepts/cache-correctness.md) | Breakpoint after `P`; one write pass `ω·X`; `appliedEdits` |
| [spec/concepts/showcase-cli.md](spec/concepts/showcase-cli.md) | The `npm start` REPL demo; slash commands; the cache-usage panel |

Full router with token budgets: [spec/INDEX.md](spec/INDEX.md). Source-of-truth
artifacts: [PRD.md](PRD.md), [docs/cost-model.md](docs/cost-model.md),
[PR_BODY.md](PR_BODY.md). Per-milestone work: [spec/tasks/](spec/tasks/).

## Response style

- **Code requests** (implement, fix, refactor, add): reply with a 1–3 line
  briefing — what changed and which files. No diff dumps, no task restatement.
- **Explanations / chat** ("why", "how does", "what do you think"): reply
  normally, as verbose as needed.
- Default to brief.

## When to use the spec

**Use it for:** new code following a non-obvious convention spread across files;
tracing how the transform/loop fits together; "where does X live"; anything
touching cache-correctness, the side-table, or the triggers.

**Skip it for:** single-file additive edits you can already locate; typo/format
fixes. Just `Read` the file and `Edit`.

## Implementation rules (load-bearing)

- **Core is a pure function** — `(messages, sideTable, opts) → { messages,
  appliedEdits }`. No network, no SDK coupling, no input mutation.
  Harness-agnostic. See [architecture](spec/project/architecture.md).
- **Identify skill blocks by `invocationId`** from the side-table, never by
  content hashing. See [skill-identification](spec/concepts/skill-identification.md).
- **Cache-correctness is hard-required** — breakpoint after the stable prefix
  `P`; one write pass on reprocess (`ω·X`, not `(1+ω)·X`); emit
  `tokensFreed` / `tokensReprocessed`. See
  [cache-correctness](spec/concepts/cache-correctness.md).
- **Strict `ephemeral` gate** — `ephemeral: false` (the default) is never evicted
  by policy, by the `clear_skill` model tool, or by an explicit `target`; only a
  deliberate human `--force` overrides. Never silently drop behavioral/persona
  skills. (Resolves PRD §12.)
- **Auto-compaction must not resurrect an evicted skill** — honor the `evicted`
  flag (PRD §9).

## Milestone order

`M1 → M2 → M3 → M4`, gated. **Don't start M2 until M1 tests are green.**
M1 = pure transform + unit tests; M2 = frontmatter + triggers + loop;
M3 = empirical cost harness; M4 = RFC/PR. Specs in [spec/tasks/](spec/tasks/).

## Refreshing the spec

Specs are maintained manually. To refresh a stale one, diff it against the code
and rewrite the drifted sections; keep the spec-index tables here and in
[spec/INDEX.md](spec/INDEX.md) in sync when files are added or removed. Concept
docs carry `anchors:` (code symbols) and `updated:` — update both when the
underlying code moves.
