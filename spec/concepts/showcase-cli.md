---
name: showcase-cli
description: The reference TUI (npm start) — an Ink terminal app with a live-stats header, a scrolling chat transcript, and a bottom-pinned autocompleting input; slash commands inject/evict skills, and the cache-usage panel makes eviction visible
tags: [cli, tui, ink, showcase, demo, slash-commands, autocomplete]
updated: 2026-06-19
anchors:
  - examples/cli.tsx
  - examples/markdown.ts
  - src/loop.ts
  - src/skillLoader.ts
related:
  - PRD.md §7
  - spec/concepts/eviction-triggers.md
  - spec/project/testing.md
---

# Reference CLI Showcase

## Location

`examples/cli.tsx` (entry: `npm start`), built on `src/loop.ts` and
`src/skillLoader.ts`. It's an [Ink](https://github.com/vadimdemedes/ink) (React
for the terminal) app; autocomplete comes from `@inkjs/ui`'s `TextInput`
`suggestions` prop. These three deps (`ink`, `react`, `@inkjs/ui`) live only at
this showcase edge — the pure core and `src/loop.ts` stay free of them.

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

## Layout & input

A full-window flexbox column (`useWindowSize` → `width`/`height`), rendered into
the alternate screen buffer so it doesn't pollute scrollback:

- **Header** (top, fixed, blue): spans the full terminal width
  (`width={columns}`) in **two stacked rows**. Row 1: the title
  `ephemeral_skills` + the live stats line on the left (`skills active/total`,
  estimated context tokens, last `cache_read` / `cache_creation`, total tokens
  freed) and a glyph legend on the right (`justifyContent:"space-between"`). Row
  2: the **context-window visualizer** (`ContextStack`) — an **append-ordered
  stack of chips**, one per block in the exact order they entered context:
  `[sys] [you·1] [AI·1] [◆ skill] [you·2] [AI·2] …`, drawn from
  `agent.contextStack()`. An `AI·k` chip **expands in place to show its loop
  steps** as glyphs (`▸` tool call · `✂` `clear_skill` wipe · `■` answer), so an
  agentic turn unfolds step-by-step. A `skill` chip flips from bright `◆ name` to
  a dim grey `✗ name` the instant its body is wiped. A second **rule row** under
  the chips marks the cache state aligned to each chip: solid `═` over the warm
  **cached prefix `P`**, a centered `✂` at the **re-link cut** (`cutIndex`, the
  earliest wiped skill), and dashed `╌` over the once-rebuilt tail — so you watch
  the prefix break and the KV cache rebuild at the eviction point. Older chips
  collapse into a leading `‹N` summary when the row overflows (the collapsed
  prefix is warm, so it reads as cached); a streaming turn shows a provisional
  `AI·k ⋯` chip until its first step lands. Recomputed from
  `agent.contextStats()` + `agent.contextStack()` + `agent.usageLog` after every
  action and per loop step via the agent's `onUsage` callback.
- **Transcript** (middle): user (white on a full-width gray block with a `»`
  prefix, padded to the content width, Claude-Code style) / assistant
  (**Markdown-rendered** — headings, bold/italic, inline + fenced code, GFM
  pipe tables, lists, blockquotes, rules, via `examples/markdown.ts`; no
  `assistant ⟩` label) / system & command responses (cyan) / usage (dim) lines,
  one blank line between each (`gap={1}`), newest at the bottom. Assistant text
  **streams token-by-token** into its row as the reply arrives (Anthropic
  `messages.stream` under `agent.send(..., { onDelta })`). The Markdown renderer
  pre-wraps every block to the content width and emits **one styled row per
  terminal line**, so the row-counting scroll math below stays exact. It is the
  **only flexible region**
  (`flexGrow={1}` + `overflow:"hidden"`); the header and the whole bottom region
  are pinned with `flexShrink={0}` so they never shrink or scroll off when
  content overflows. The viewport height is read with `measureElement`, and only
  the most-recent entries that fit are rendered, so the frame never exceeds the
  terminal and nothing distorts. Internally the transcript is flattened to styled
  rows (each entry wrapped to the content width, blank line between entries) and a
  window is shown. **`Shift+↑` / `Shift+↓` scroll** one row (`PageUp` / `PageDn`
  by a page); **`Esc` jumps back to the newest message** when scrolled; a new
  message auto-follows back to the bottom. While scrolled, the one-row spacer
  above the input shows `▲ N lines up — Shift+↑/↓ scroll · Esc to newest`.
  (Shift+Enter isn't used: most terminals send it identically to Enter, so it
  can't be detected.)
- **Input** (bottom, fixed): a small controlled input built on Ink's `useInput`
  (not `@inkjs/ui`'s `TextInput`, which can't do `Tab` or mid-sentence tokens).
  Autocomplete triggers on the `/token` **under the cursor — anywhere in the
  line**, so a skill can be referenced mid-sentence; `/use` / `/clear-skill`
  additionally complete a skill-name argument. `↑`/`↓` move the cyan suggestion
  menu; **`Tab` writes** the highlighted completion (with an inline ghost
  preview); **`Enter` writes _and_ sends** it — except for a command still
  awaiting an argument (`/use` / `/clear-skill`), which only writes. With no open
  menu, `Enter` just sends the line, and **`↑`/`↓` recall submitted-input
  history** (shell-style; editing or submitting resets the position). The guidance hint shows only while the input
  is empty; once typing starts it's replaced by the live menu (and nothing when
  there's no match — no "no matching command" noise). A turn in flight swaps the
  input for a spinner.
- **`/skills` picker** (bottom, modal): a self-contained `useInput` menu —
  `↑`/`↓` navigate, `Enter` injects the highlighted skill, `Esc` cancels. While
  open it owns the keyboard (the App-level handler is `isActive:false`).
- **Quit**: `Esc Esc` when already at the newest message (press twice within
  ~1.5s — the first shows a prompt; if scrolled, that first `Esc` returns to the
  newest message instead), or `Ctrl+C` / `Ctrl+D`, or `/quit`.

Non-interactive stdio (no TTY — CI, piped smoke tests) skips Ink and prints a
plain banner + skill table instead, so `npm start </dev/null` never crashes.

## Slash commands

| Command | Effect |
|---|---|
| `/skills` | open the interactive skill picker (↑/↓ navigate, Enter injects, Esc cancels) |
| `/<name>` or `/use <name>` | inject that skill's `SKILL.md` body (deterministic — the human controls when `s` enters context, for reproducibility) |
| `/clear-skill <name>` | evict it now; honors the strict `ephemeral` gate |
| `/clear-skill <name> --force` | human override — evict even an `ephemeral: false` skill |
| `/usage` | print the per-turn cache panel (`cache_read`, `cache_creation`, freed / reprocessed) |
| `/context` | dump current message count + estimated tokens per block |
| `/help`, `/quit` | — (also quit via `Esc Esc`, `Ctrl+C`, `Ctrl+D`) |

Any non-slash input is a normal user turn that drives the agentic loop. A
`/skill-name` mentioned inside that turn is injected for the turn (mention →
inject), so skills can be invoked mid-sentence. The model can also evict on its
own via the `clear_skill` tool (see [eviction-triggers](eviction-triggers.md)).

## The payoff: the usage panel

After each request the CLI prints `usage.cache_read_input_tokens` and
`usage.cache_creation_input_tokens`. The demo arc:

1. `/regex-cookbook` → inject a fat (~2k token) skill.
2. ask it to do a few steps → the skill is read each turn (`cache_read` includes
   `s`).
3. `/clear-skill regex-cookbook` → a one-time `cache_creation` spike ≈ `ω·X`,
   then every subsequent `cache_read` is ≈ `ρ·s` lower. The crossover is the cost
   model rendered in real tokens.

## Requirements

Needs an Anthropic credential for `send()` — put `ANTHROPIC_API_KEY` in a `.env`
file (copy `.env.example`; the CLI auto-loads it via `dotenv`) or the environment.
A Claude Pro/Max subscription or `claude -p` **cannot** be used: the loop drives
the raw Messages API to control cache breakpoints and read per-request cache usage,
which the subscription / CLI don't expose. A gateway bearer token works instead
(`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`). No credential is needed for
`/skills`, `/use`, `/clear-skill`, `/context`, or to typecheck.
