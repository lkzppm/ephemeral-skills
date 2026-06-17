# CLAUDE.md

Thin index. Read the spec before implementing; do not duplicate it here.

## What this repo is

Reference implementation + RFC for `clear_skill_uses`: selective, cache-aware
eviction of a skill's `SKILL.md` body from agent context after it's been used.
The skill analogue of `clear_tool_uses_20250919`.

## Specs (source of truth)

- `PRD.md` — requirements, design, API/frontmatter shape, edge cases, milestones,
  testing strategy. **Start here.**
- `docs/cost-model.md` — the prefix-cache economics; the eviction trigger policy
  (`ρ·s·M > ω·X`). The decision rule any automatic trigger must honor.
- `PR_BODY.md` — upstream framing and prior-art citations. Don't drift the design
  from what's promised here.
- `src/clearSkillUses.ts` — the typed contract to implement against.

## Implementation rules

- Keep the core transform a **pure function**: `(messages, opts) → { messages,
  applied_edits }`. No network, no SDK coupling in the core. Harness-agnostic.
- Identify skill blocks by `invocation_id` from the side-table, never by content
  hashing.
- Cache-correctness is a hard requirement: breakpoint after the stable prefix `P`;
  one write pass on reprocess (`ω·X`, not `(1+ω)·X`); emit `tokens_freed` /
  `tokens_reprocessed`.
- Default `ephemeral: false`. Never auto-evict behavioral/persona skills.
- Auto-compaction must not resurrect an intentionally evicted skill (see PRD §9).

## Milestone order

M1 pure transform + unit tests → M2 frontmatter + triggers → M3 empirical cost
harness → M4 RFC/PR. Don't start M2 until M1 tests are green.
