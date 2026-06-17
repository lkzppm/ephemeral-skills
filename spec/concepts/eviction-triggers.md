---
name: eviction-triggers
description: The three composable triggers (frontmatter, the clear_skill model tool, threshold) plus the manual slash command, and the strict ephemeral gate that governs all of them
tags: [triggers, frontmatter, cost-gate, policy, ephemeral-gate]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:ClearSkillUsesOptions
  - src/clearSkillUses.ts:isEvictionWorthIt
  - src/clearSkillUses.ts:estimateTail
related:
  - PRD.md §6, §8, §12
  - docs/cost-model.md
  - spec/concepts/skill-identification.md
---

# Eviction Triggers

## Location

`src/clearSkillUses.ts` — `ClearSkillUsesOptions` (`target`, `force`,
`estimatedTail`, `exclude`), `isEvictionWorthIt`, `estimateTail`.

## The strict `ephemeral` gate (master switch)

`ephemeral` is not just a policy hint — it is the **gate for all eviction**:

- **`ephemeral: false` (default)** → the skill is resident for the whole session.
  It is **never** evicted: not by the threshold policy, not by the model's
  `clear_skill` tool, not even by an explicit `opts.target`. The *only* override
  is a deliberate human force (`opts.force === true`, surfaced as
  `/clear-skill <name> --force`).
- **`ephemeral: true`** → the skill is evictable by any trigger below.

Rationale: once the model can evict its own skills, an absolute floor for
`ephemeral: false` is a safety property — the model must not be able to drop a
persona / behavioral / guardrail skill mid-task. This resolves PRD §12: an
explicit target does **not** override `ephemeral: false`; only human force does.

## Three composable triggers (PRD §6)

1. **Frontmatter, declarative (primary).**
   ```yaml
   ephemeral: true            # opt in; default false
   evict-after: used          # used | <N>-steps | <T>-tokens
   evict-keep-tokens: 30      # stub budget
   ```
   `evict-after: used` = evict at the first request after the skill's output is
   consumed. Recommended — it minimizes the lived band `X` (see the timing
   corollary in [docs/cost-model.md](../../docs/cost-model.md)).
2. **The `clear_skill` model tool (first-class).** Expose `clear_skill(skill_name)`
   so the model can drop a skill the moment it decides it's done — agentic
   self-pruning. The tool resolves the name to its `invocationId`(s) and calls the
   core with `target`. It **never** sets `force`, so it is refused on
   `ephemeral: false` skills.
3. **Threshold, automatic.** Fire when context crosses a token threshold, evicting
   `ephemeral: true` skills oldest-first, cost-gated by `isEvictionWorthIt` and
   respecting `exclude`.

Plus a **manual surface** in the reference CLI: `/clear-skill <name>` (honors the
gate) and `/clear-skill <name> --force` (the human override for `ephemeral:
false`). See [showcase-cli](showcase-cli.md).

## How the core decides

`clearSkillUses` resolves targets in this order:

- **`opts.target` present** → evict exactly those `invocationId`s (deliberate
  trigger 1 / 2 / manual). The cost gate is not consulted — eviction can be a
  quality decision even when `Δ < 0`. A targeted `ephemeral: false` record is
  still skipped unless `opts.force`.
- **`opts.target` absent** → policy mode (trigger 3). Consider only `ephemeral:
  true` records, gate each on `isEvictionWorthIt(s, estimatedTail, X)` when
  `estimatedTail` is supplied, evict oldest-first.
- **Always:** `ephemeral: false` is skipped unless `opts.force`; skill names in
  `opts.exclude` are skipped.

## Cost gate

`isEvictionWorthIt` implements the net-win predicate `ρ·s·M > ω·X`.
`estimateTail` supplies `M` (default policy: `remainingTokenBudget /
avgStepTokens`) and is pluggable; the loop passes it in as `opts.estimatedTail`.
The full derivation, price tiers, and break-even tail `M*` live in
[docs/cost-model.md](../../docs/cost-model.md) — not restated here.
