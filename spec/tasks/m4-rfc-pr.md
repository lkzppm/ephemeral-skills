---
milestone:
  id: M4
  state: Todo
  blockedBy: [M3]
title: "M4 — RFC / PR"
name: m4-rfc-pr
description: "File the reference impl + cost data as a comment reviving #21583, and optionally a draft PR proposing native clear_skill_uses."
tags: [milestone, rfc, upstream, m4]
updated: 2026-06-17
related:
  - PR_BODY.md
  - spec/project/architecture.md
---

# M4 — RFC / PR

> Milestone M4 · state: **Todo** · blocked by M3.

## Goal

Turn the reference implementation and the M3 cost data into the upstream
proposal: revive issue **#21583**, and optionally open a draft PR proposing
native `clear_skill_uses` (Layer B).

## Scope

In:
- A writeup citing the reference impl (Layer A) and the empirical break-even data
  (M3), framed per [`PR_BODY.md`](../../PR_BODY.md).
- The Layer B native-strategy proposal: `context-management` integration,
  frontmatter, optional `evict_skill` tool.

Out:
- Patching the minified interactive `claude` bundle (explicitly a non-goal — PRD §2, §7).

## Acceptance Criteria

- [ ] Comment on #21583 with the reference impl + reproducible cost data.
- [ ] Draft RFC for native `clear_skill_uses` aligned with `PR_BODY.md` (no
      design drift from what's promised there).

## Notes

- The provider-neutrality framing for the PR: the *transform* is provider-
  agnostic; the *eviction economics* need a manual prompt-cache API, which today
  only Anthropic exposes — which is itself an argument for a native harness
  feature. See [architecture.md](../project/architecture.md).
