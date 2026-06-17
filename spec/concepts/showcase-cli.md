---
name: showcase-cli
description: The reference REPL (npm start) — slash commands that inject and evict skills, deterministic injection for reproducibility, and the live cache-usage panel that makes eviction visible
tags: [cli, repl, showcase, demo, slash-commands]
updated: 2026-06-17
anchors:
  - examples/cli.ts
  - src/loop.ts
  - src/skillLoader.ts
related:
  - PRD.md §7
  - spec/concepts/eviction-triggers.md
  - spec/project/testing.md
---

# Reference CLI Showcase

## Location

`examples/cli.ts` (entry: `npm start`), built on `src/loop.ts` and
`src/skillLoader.ts`.

## Purpose

A small Claude-Code-like REPL whose only job is to make `clear_skill_uses`
**legible**: you watch a fat skill enter context, get used, then get evicted, and
the per-turn token meter drop. It is a demo plus the interactive face of the M3
cost harness — **not** an attempt to reproduce the production `claude` TUI
(patching that compiled bundle is a non-goal, PRD §7).

## Why build our own (not a general harness)

The whole demo lives on three controls a general agent harness hides: manual
cache-breakpoint placement, per-request `cache_read` / `cache_creation` capture,
and skill-as-its-own-block injection with stable `invocationId`s. Owning ~200
legible lines is worth more for an RFC than burying the one mechanism under a
third-party framework.

## Slash commands

| Command | Effect |
|---|---|
| `/skills` | list skills discovered under `skills/` (name, `ephemeral`, token size) |
| `/<name>` or `/use <name>` | inject that skill's `SKILL.md` body (deterministic — the human controls when `s` enters context, for reproducibility) |
| `/clear-skill <name>` | evict it now; honors the strict `ephemeral` gate |
| `/clear-skill <name> --force` | human override — evict even an `ephemeral: false` skill |
| `/usage` | print the per-turn cache panel (`cache_read`, `cache_creation`, freed / reprocessed) |
| `/context` | dump current message count + estimated tokens per block |
| `/help`, `/quit` | — |

Any non-slash input is a normal user turn that drives the agentic loop. The model
can also evict on its own via the `clear_skill` tool (see
[eviction-triggers](eviction-triggers.md)).

## The payoff: the usage panel

After each request the CLI prints `usage.cache_read_input_tokens` and
`usage.cache_creation_input_tokens`. The demo arc:

1. `/backend-knowledge` → inject a fat (~2k token) skill.
2. ask it to do a few steps → the skill is read each turn (`cache_read` includes
   `s`).
3. `/clear-skill backend-knowledge` → a one-time `cache_creation` spike ≈ `ω·X`,
   then every subsequent `cache_read` is ≈ `ρ·s` lower. The crossover is the cost
   model rendered in real tokens.

## Requirements

Needs `ANTHROPIC_API_KEY` in the environment (you supply your own). Run with
`npm start`. No key is needed to read or typecheck the code.
