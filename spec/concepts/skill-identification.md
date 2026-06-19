---
name: skill-identification
description: Skills are their own content category (not tool_results); locating one via the invocation_id side-table; sentinels vs native metadata; never content-hash; skip context:fork
tags: [side-table, invocation-id, identification, content-category]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:SkillRecord
  - src/clearSkillUses.ts:clearSkillUses
related:
  - PRD.md §3, §4, §9
  - spec/concepts/eviction-triggers.md
---

# Skill Block Identification

## Location

`src/clearSkillUses.ts` — `SkillRecord` (one side-table entry per skill
invocation), consumed by `clearSkillUses`.

## Skills are their own content category — not tool_results

A skill body is injected as its **own** content block — `{ type: "skill",
skill_name, body }` (SDK path) or first-class harness metadata (native path) —
**never** as a `tool_result`. This is deliberate and load-bearing:

- If a skill body lived in a `tool_result`, the existing
  `clear_tool_uses_20250919` context edit would own its lifecycle and sweep it
  under **tool-result** policy — losing the `ephemeral` flag, the `evict-after`
  triggers, and the "never drop persona skills" default.
- `clear_skill_uses` is therefore **orthogonal** to `clear_tool_uses`, not a
  special case of it. Keeping skills a separate category — with their own
  eviction policy — is the entire reason the feature must exist.

The body is never folded into the `system` prompt either: `system` is a single
frozen prefix, so a per-skill mid-array eviction would be impossible.

## The rule

Locate a skill invocation by **`invocationId`** — never by hashing or
fuzzy-matching content (collisions and edits make that brittle). The side-table /
metadata approach is normative (PRD §4).

## Two identification paths

- **SDK path (this repo / Layer A).** We control injection in the reference loop,
  so on injection we (1) wrap the rendered `SKILL.md` body in sentinel markers and
  (2) record a `SkillRecord`. Eviction matches on `invocationId`; `messageIndex`
  locates the block, the sentinel validates it.
- **Native path (Layer B / RFC).** The harness already knows which message is a
  skill invocation and tags it at injection with `{ skill_name, invocation_id }`.
  Deterministic; no sentinels required.

## SkillRecord fields

| field | meaning |
|---|---|
| `invocationId` | primary key; the only thing eviction matches on |
| `skillName` | feeds the stub text + `/clear-skill` / re-invoke hint |
| `messageIndex` | index into the `messages` array |
| `tokenLen` | body size `s` — feeds cost accounting (see [cache-correctness](cache-correctness.md)) |
| `ephemeral` | from frontmatter; **default false**; the strict gate for all eviction (see [eviction-triggers](eviction-triggers.md)) |
| `evicted?` | set `true` once dropped — compaction MUST skip flagged records (PRD §9) |

## Edge cases

- **Multiple invocations of the same skill** → key on `invocationId`; evict the
  specific instance(s) targeted. Default = all but the most recent.
- **`context: fork` skills** → already isolated in a subagent; eviction is a
  no-op. Detect and skip.
- **Skill that spawned tool calls** → evict only the skill instruction message;
  leave any resulting `tool_use` / `tool_result` pairs intact (they are a separate
  category, governed by `clear_tool_uses`).
