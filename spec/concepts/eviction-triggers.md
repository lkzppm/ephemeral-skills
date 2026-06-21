---
name: eviction-triggers
description: The two automatic triggers (frontmatter evict-after, token threshold) plus the manual slash command, and the strict ephemeral gate that governs all of them. Eviction is deterministic/harness-driven — there is no model-invocable clear tool
tags: [triggers, frontmatter, cost-gate, policy, ephemeral-gate]
updated: 2026-06-19
anchors:
  - src/clearSkillUses.ts:ClearSkillUsesOptions
  - src/clearSkillUses.ts:isEvictionWorthIt
  - src/clearSkillUses.ts:estimateTail
  - src/loop.ts:evictUsedSkills
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
  It is **never** evicted: not by the threshold policy, not by an explicit
  `opts.target`. The *only* override is a deliberate human force
  (`opts.force === true`, surfaced as `/clear-skill <name> --force`).
- **`ephemeral: true`** → the skill is evictable by any trigger below.

Rationale: an absolute floor for `ephemeral: false` is a safety property — no
policy and no explicit target may drop a persona / behavioral / guardrail skill
mid-task. This resolves PRD §12: an explicit target does **not** override
`ephemeral: false`; only human force does.

## Two automatic triggers (PRD §6), plus a manual surface

Eviction is **deterministic and harness-driven**. There is no model-invocable
clear tool — see [Why eviction is not a model tool](#why-eviction-is-not-a-model-tool).

1. **Frontmatter, declarative (primary).**
   ```yaml
   ephemeral: true            # opt in; default false
   evict-after: used          # used | <N>-steps | <T>-tokens
   evict-keep-tokens: 30      # stub budget
   ```
   `evict-after: used` = evict as soon as the turn that consumes the skill ends.
   Recommended — it minimizes the lived band `X` (see the timing corollary in
   [docs/cost-model.md](../../docs/cost-model.md)). The reference loop
   (`SkillAgent`, when `autoTriggers` is on) applies this **deterministically**: a
   `used` skill stays at full size *through* the entire turn that consumes it,
   then is wiped at the **end of that turn** (`evictUsedSkills`). The edit lands
   immediately, so the re-link cut is visible between turns; the one-time
   reprocess is paid by the **next request** (the first to send the stub over the
   wire). No model action is involved.
2. **Threshold, automatic.** Fire when context crosses a token threshold, evicting
   `ephemeral: true` skills oldest-first, cost-gated by `isEvictionWorthIt` and
   respecting `exclude`.

Plus a **manual surface** in the reference CLI: `/clear-skill <name>` (honors the
gate) and `/clear-skill <name> --force` (the human override for `ephemeral:
false`). See [showcase-cli](showcase-cli.md).

## Why eviction is not a model tool

`clear_skill_uses` is the skill analogue of `clear_tool_uses_20250919`, and that
mechanism is a **context-management strategy** — applied automatically by the
harness on a token-threshold trigger, never a tool the model invokes. The
faithful analogue is therefore the two automatic triggers above (a frontmatter
trigger + the threshold strategy), not a model-driven button. An earlier draft
proposed a first-class `clear_skill(skill_name)` tool for agentic self-pruning;
it was dropped because (a) it has no counterpart in `clear_tool_uses`, (b) in
practice the model fires it at the wrong time — mid-turn, before the using turn
finishes, or redundantly on a skill the frontmatter trigger already owns — and
(c) it overlaps the deterministic trigger with no added coverage. Eviction stays
a harness decision; the model's only skill-related action is loading one with
`invoke_skill`.

## How the core decides

`clearSkillUses` resolves targets in this order:

- **`opts.target` present** → evict exactly those `invocationId`s (the
  frontmatter trigger or the manual `/clear-skill`). The cost gate is not
  consulted — eviction can be a quality decision even when `Δ < 0`. A targeted
  `ephemeral: false` record is still skipped unless `opts.force`.
- **`opts.target` absent** → policy mode (the threshold trigger). Consider only
  `ephemeral: true` records, gate each on `isEvictionWorthIt(s, estimatedTail, X)`
  when `estimatedTail` is supplied, evict oldest-first.
- **Always:** `ephemeral: false` is skipped unless `opts.force`; skill names in
  `opts.exclude` are skipped.

## Cost gate

`isEvictionWorthIt` implements the net-win predicate `ρ·s·M > ω·X`.
`estimateTail` supplies `M` (default policy: `remainingTokenBudget /
avgStepTokens`) and is pluggable; the loop passes it in as `opts.estimatedTail`.
The full derivation, price tiers, and break-even tail `M*` live in
[docs/cost-model.md](../../docs/cost-model.md) — not restated here.
