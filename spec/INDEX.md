# Spec Index

| Spec | Read when… | Tokens |
|---|---|---|
| [overview.md](overview.md) | Orienting to the project; the two delivery layers; the eviction transform pipeline | 620 |
| [project/architecture.md](project/architecture.md) | Layers A/B; the pure-core / SDK-at-edges contract; why TypeScript; milestone order | 450 |
| [project/stack.md](project/stack.md) | Toolchain, npm scripts, deps, the SDK dependency boundary | 300 |
| [project/testing.md](project/testing.md) | The test strategy across milestones (unit / regression / cache-empirical / continuity / compaction) | 325 |
| [concepts/skill-identification.md](concepts/skill-identification.md) | Locating a skill block; the `invocationId` side-table; sentinels vs native metadata; fork/multi-invocation edge cases | 425 |
| [concepts/placeholder-stub.md](concepts/placeholder-stub.md) | The stub left behind; why keep the record; `evictKeepTokens` budget | 255 |
| [concepts/eviction-triggers.md](concepts/eviction-triggers.md) | The three triggers; explicit `target` vs policy gate; when the cost gate is consulted | 380 |
| [concepts/cache-correctness.md](concepts/cache-correctness.md) | Breakpoint after `P`; one write pass `ω·X`; `appliedEdits` accounting; the no-mutation rule | 430 |

## Canonical artifacts (source of truth — not under spec/)

| Doc | Read when… | Tokens |
|---|---|---|
| [../PRD.md](../PRD.md) | Requirements, design, API/frontmatter shape, edge cases, milestones, testing strategy | 1800 |
| [../docs/cost-model.md](../docs/cost-model.md) | The prefix-cache economics; the `ρ·s·M > ω·X` decision rule and break-even `M*` | 920 |
| [../PR_BODY.md](../PR_BODY.md) | Upstream framing + prior-art citations; the design promised to upstream | 900 |

The [tasks/](tasks/) directory holds one spec per milestone (M1–M4), each with a
`milestone:` frontmatter block (state + blocks/blockedBy). It's the entry point
for "what's the next unit of work"; M1 is the active card.
