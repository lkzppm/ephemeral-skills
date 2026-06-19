---
name: placeholder-stub
description: The compact placeholder left in place of an evicted skill body, why the record is kept rather than deleted, and the keep-tokens budget
tags: [stub, placeholder, eviction]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:makeStub
related:
  - PRD.md §5
---

# Placeholder (Stub) Semantics

## Location

`src/clearSkillUses.ts` — `makeStub(skillName, keepTokens = 30)`.

## What it does

On eviction the skill body is replaced with a compact stub. The block stays a
skill record — `{ type: "skill", skill_name, body: <stub>, evicted: true }` — so
the prefix above it is untouched and the model still sees that the skill ran:

```
[skill "backend-knowledge" was invoked earlier and has been evicted to free
context. Re-invoke /backend-knowledge to reload its instructions.]
```

## Why keep the record (not delete the message)

Inherited from `clear_tool_uses`. Keeping a short marker:

- tells the model the capability exists and **was used**,
- preserves prefix integrity **above** the stub (the cached prefix `P` stays
  intact — see [cache-correctness](cache-correctness.md)),
- lets the model **re-invoke** if it turns out it still needed the body. The
  "re-invoke to reload" text makes this discoverable.

## Budget

`evictKeepTokens` (default ≈ 30) bounds stub length. Tokens freed by an eviction
≈ body size `s` − stub size. The stub should be small enough that the freed
tokens dominate, but explicit enough to stay discoverable.
