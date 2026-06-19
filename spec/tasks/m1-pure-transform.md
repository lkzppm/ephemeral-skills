---
milestone:
  id: M1
  state: Done
  blocks: [M2, M3, M4]
  gate: "npm test green"
title: "M1 — Pure transform + unit tests"
name: m1-pure-transform
description: "Implement clearSkillUses + the cost gate as pure functions; make tests/clearSkillUses.test.ts pass."
tags: [milestone, core, m1, pure]
updated: 2026-06-17
related:
  - spec/concepts/skill-identification.md
  - spec/concepts/placeholder-stub.md
  - spec/concepts/eviction-triggers.md
  - spec/concepts/cache-correctness.md
---

# M1 — Pure transform + unit tests

> Milestone M1 · state: **In Progress** · gate for everything downstream.

## Goal

Implement the bodies in `src/clearSkillUses.ts` so the transform rewrites a
tagged skill block to a stub, preserves all else byte-identically, and returns
accurate `appliedEdits`. Pure function, no network. Make
`tests/clearSkillUses.test.ts` pass.

## Scope

In:
- `isEvictionWorthIt(s, M, X, pricing)` → `ρ·s·M > ω·X`.
- `makeStub(skillName, keepTokens)` → the placeholder (already drafted; keep the
  shape, honor `keepTokens` as a budget).
- `clearSkillUses(messages, sideTable, opts)`:
  - resolve targets: `opts.target` (explicit) else policy (ephemeral-only +
    `isEvictionWorthIt`); honor `opts.exclude`; never policy-evict `ephemeral: false`.
  - replace only the skill instruction message at `messageIndex` with the stub;
    set `record.evicted = true` on a copy.
  - leave every other index byte-identical; do not mutate inputs.
  - compute `appliedEdits` (`skillsEvicted`, `tokensFreed`, `tokensReprocessed`).

Out:
- `estimateTail` (M2 — frontmatter/loop wiring).
- Any SDK / API call (M2/M3).
- Actual cache-breakpoint placement (the loop's job — M2).

## Acceptance Criteria

- [ ] `isEvictionWorthIt` passes the three cost-gate cases (fat long-lived ⇒
      evict; short tail ⇒ keep; 1-hr `omega: 2.0` hurdle ⇒ keep).
- [ ] `clearSkillUses` with `target: ["inv-1"]` replaces the body with a stub
      containing "evicted" and reports `skillsEvicted === 1`, `tokensFreed > 0`.
- [ ] Untouched messages compare `toEqual` the originals (byte-identical).
- [ ] A non-ephemeral skill with no explicit target is never evicted
      (`skillsEvicted === 0`).
- [ ] `makeStub` names the skill and tells the model how to re-invoke.
- [ ] Inputs are not mutated (new arrays/objects returned).
- [ ] `npm test` and `npm run typecheck` are green.

## Notes

- `tokensFreed` ≈ `tokenLen` − stub tokens; `tokensReprocessed` ≈ `X` (the lived
  band below the cut). For M1, deriving `X` from the side-table/messages is
  acceptable as a documented approximation; the empirical check is M3.
- Open question (PRD §12): does an explicit `target` override `ephemeral:
  false`? Lean yes — explicit target is a deliberate, opt-in request. No test
  pins this yet; document whatever you choose.
