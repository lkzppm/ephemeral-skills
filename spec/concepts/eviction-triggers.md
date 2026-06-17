---
name: eviction-triggers
description: The three composable triggers (frontmatter, model tool, threshold) and how the core decides whether to evict — explicit target vs policy gate
tags: [triggers, frontmatter, cost-gate, policy]
updated: 2026-06-17
anchors:
  - src/clearSkillUses.ts:ClearSkillUsesOptions
  - src/clearSkillUses.ts:isEvictionWorthIt
  - src/clearSkillUses.ts:estimateTail
related:
  - PRD.md §6, §8
  - docs/cost-model.md
---

# Eviction Triggers

## Location

`src/clearSkillUses.ts` — `ClearSkillUsesOptions.target`, `isEvictionWorthIt`,
`estimateTail`.

## Three composable triggers (PRD §6)

1. **Frontmatter, declarative (primary).**
   ```yaml
   ephemeral: true            # opt in; default false
   evict-after: used          # used | <N>-steps | <T>-tokens
   evict-keep-tokens: 30      # stub budget
   ```
   `evict-after: used` = evict at the first request after the skill's output is
   consumed. Recommended — it minimizes the lived band `X` (see timing corollary
   in [docs/cost-model.md](../../docs/cost-model.md)).
2. **Model-invocable tool (optional).** Expose `evict_skill(name)` so the model
   can drop a skill when it decides it's done. Gate behind opt-in.
3. **Threshold, automatic.** Fire when context crosses a token threshold,
   oldest-first. Excludable per skill.

## How the core decides

`clearSkillUses` resolves targets in this order:

- **`opts.target` present** → evict exactly those `invocationId`s. This is a
  deliberate trigger (1 or 2): the caller already decided, so the cost gate is
  not consulted (eviction can be a quality decision even when `Δ < 0`).
- **`opts.target` absent** → policy mode (trigger 3). Consider only `ephemeral:
  true` records, and gate each on `isEvictionWorthIt(s, M, X)`.
- **Always:** never evict `ephemeral: false` records under policy; never evict
  skill names listed in `opts.exclude`.

## Cost gate

`isEvictionWorthIt` implements the net-win predicate `ρ·s·M > ω·X`.
`estimateTail` supplies `M` (default policy: `remainingTokenBudget /
avgStepTokens`) and is pluggable. The full derivation, price tiers, and
break-even tail `M*` live in [docs/cost-model.md](../../docs/cost-model.md) — do
not restate the math here; this doc covers only *which* trigger calls the gate.
