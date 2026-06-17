---
name: skill-identification
description: Locating a skill block deterministically via the invocation_id side-table; sentinel markers vs native metadata; never content-hash; skip context:fork
tags: [side-table, invocation-id, identification]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:SkillRecord
  - src/clearSkillUses.ts:clearSkillUses
related:
  - PRD.md §4, §9
---

# Skill Block Identification

## Location

`src/clearSkillUses.ts` — `SkillRecord` (one side-table entry per skill
invocation), consumed by `clearSkillUses`.

## The rule

A skill invocation is a single, identifiable message in the array. Locate it by
**`invocationId`** — never by hashing or fuzzy-matching content. Content hashing
is brittle: collisions and edits make it unreliable. The side-table / metadata
approach is normative (PRD §4).

## Two identification paths

- **SDK path (this repo / Layer A).** We control injection in the reference
  loop, so on injection we (1) wrap the rendered `SKILL.md` body in sentinel
  markers and (2) record a `SkillRecord`. Eviction matches on `invocationId`.
- **Native path (Layer B / RFC).** The harness already knows which message is a
  skill invocation and tags it at injection time with `{ skill_name,
  invocation_id }` metadata. Deterministic; no sentinels required.

## SkillRecord fields

| field | meaning |
|---|---|
| `invocationId` | primary key; the only thing eviction matches on |
| `skillName` | feeds the stub text + `/reinvoke` hint |
| `messageIndex` | index into the `messages` array |
| `tokenLen` | body size `s` — feeds cost accounting (see [cache-correctness](cache-correctness.md)) |
| `ephemeral` | from frontmatter; **default false**; gates policy-driven eviction |
| `evicted?` | set `true` once dropped — compaction MUST skip flagged records (PRD §9) |

## Edge cases

- **Multiple invocations of the same skill** → key on `invocationId`; evict the
  specific instance(s) targeted. Default = all but the most recent.
- **`context: fork` skills** → already isolated in a subagent; eviction is a
  no-op. Detect and skip.
- **Skill that spawned tool calls** → evict only the skill instruction message;
  leave any resulting `tool_use` / `tool_result` pairs intact.
