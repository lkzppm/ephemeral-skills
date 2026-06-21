---
name: showcase-cli
description: The reference TUI (npm start) — an Ink terminal app with a live-stats header, a scrolling chat transcript, and a bottom-pinned autocompleting input; slash commands inject/evict skills, and the cache-usage panel makes eviction visible
tags: [cli, tui, ink, showcase, demo, slash-commands, autocomplete]
updated: 2026-06-19
anchors:
  - cli/cli.tsx
  - cli/markdown.ts
  - agent/systemPrompt.md
  - src/loop.ts
  - src/skillLoader.ts
related:
  - PRD.md §7
  - spec/concepts/eviction-triggers.md
  - spec/project/testing.md
---

# Reference CLI Showcase

## Location

`cli/cli.tsx` (entry: `npm start`), built on `src/loop.ts` and
`src/skillLoader.ts`. Markdown rendering lives in `cli/markdown.ts`; the cost
harness alongside it in `cli/costHarness.ts`. The agent it drives is defined
under `agent/` — its persona in `agent/systemPrompt.md` (plain Markdown, read at
runtime; a leading `<!-- … -->` maintainer note is stripped before sending) and
its skills in `agent/skills/`. The prompt is deliberately ~5k tokens so it alone
clears Haiku 4.5's prompt-cache floor, which is ~4096 tokens — verified
empirically; Sonnet/Opus cache from ~1024.
It's an [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) app;
the input/autocomplete is a small custom `useInput` controller. These deps
(`ink`, `react`, `@inkjs/ui`) live only at this showcase edge — the pure core and
`src/loop.ts` stay free of them.

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

- **Header** (top, fixed, blue): two stacked rows. **Row 1** is the title
  `ephemeral_skills` on the left and a glyph legend on the right
  (`justifyContent:"space-between"`); the per-turn counters live in a separate
  bottom status line (below the input), not here. **Row 2** is the
  **context-window visualizer** (`ContextStack`) — an **append-ordered stack of
  chips**, one per block in the exact order they entered context:
  `[sys] [you·1] [AI·1] [◆ skill] [you·2] [AI·2] …`, drawn from
  `agent.contextStack()` and rendered as **three aligned rows**:
  1. the **chips** — an `AI·k` chip expands in place to show its loop steps as
     glyphs (`▸` tool call — i.e. `invoke_skill` · `■` answer); a `skill` chip
     flips from bright `◆ name` to a dim grey `✗ name` the instant its body is
     wiped (by the deterministic trigger — there is no model wipe step);
  2. a **cache rule** aligned under each chip: solid blue `═` over the warm
     **cached prefix `P`**, a centered red `✂` at the **live re-link cut**
     (`cutIndex` — the earliest skill in the *current pending-reprocess batch*,
     not the earliest-ever-evicted), dashed yellow `╌` over the tail still owing
     its one-time reprocess, and dotted cyan `┄` under the block written this
     turn. The cut + rebuilt tail show **only while `reprocessPending`**; the next
     request pays the reprocess, after which the cut clears and the whole prefix
     re-caches to blue — the dim grey `✗ name` chip remains as the permanent
     "evicted" record. A *later* eviction draws a *new* cut at its own position
     (the earlier one is warm again), so the marker tracks the most recent wipe
     rather than freezing at the first;
  3. a **token row** showing each block's estimated token count, compact and
     centered under its chip (`5k`, `340`, `1.2k`).

  Older chips collapse into a leading `‹N` summary when the row overflows (the
  collapsed prefix is warm, so it reads as cached); a streaming turn shows a
  provisional `AI·k ⋯` chip until its first step lands. Recomputed from
  `agent.contextStack()` + `agent.usageLog` after every action and per loop step
  via the agent's `onUsage` callback.
- **Status line** (bottom, fixed, dim): `skills active/loaded` on the left;
  `ctx` (incl. the system prompt), `cached`, `fresh`, `freed` on the right, each
  label colour-coded. `cached`/`fresh` are the per-request `cache_read` /
  `cache_creation` token counts; `freed` is cumulative tokens reclaimed by
  eviction.
- **Transcript** (middle): user (white on a full-width gray block with a `»`
  prefix, padded to the content width, Claude-Code style) / assistant
  (**Markdown-rendered** — headings, bold/italic, inline + fenced code, GFM
  pipe tables, lists, blockquotes, rules, via `cli/markdown.ts`; no
  `assistant ⟩` label) / skill-invocation lines (bright yellow `◆ invoked …`) /
  system & command responses (cyan) / usage + auto-evict notices (dim) lines,
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
| `/skills` | open the interactive skill picker (↑/↓ navigate, Enter suggests, Esc cancels) |
| `/<name>` or `/use <name>` | **suggest** that skill — sends only its summary so the agent can `invoke_skill` to load the full `SKILL.md` (progressive disclosure). `suggestSkill`, not a full-body load |
| `/clear-skill <name>` | evict a loaded skill now; honors the strict `ephemeral` gate |
| `/clear-skill <name> --force` | human override — evict even an `ephemeral: false` skill |
| `/usage` | print the per-turn cache panel (`cache_read`, `cache_creation`, freed / reprocessed) |
| `/context` | dump current message count + estimated tokens per block |
| `/help`, `/quit` | — (also quit via `Esc Esc`, `Ctrl+C`, `Ctrl+D`) |

**Progressive disclosure (like Claude Code's Agent Skills).** The raw Messages
API has no client-side skills primitive (the beta `container.skills` feature is
for the code-execution sandbox, not local `SKILL.md`), so the loop hand-rolls it:
`buildSystem()` appends an always-present **skill index** — each skill's name +
one-line `description`, a few tokens each — to the system prompt, and exposes an
`invoke_skill(skill_name)` tool. The model sees only the headers until it calls
`invoke_skill`, which loads that skill's full `SKILL.md` body in as its own
`{type:"skill"}` block (`makeSkillBlock`). The model loads skills via
`invoke_skill` the instant it lands in the live message array, so the full-size
skill block renders in the visualizer **in realtime mid-loop**, not only after
the turn settles. That body then lives under the normal lifecycle — the
deterministic `evict-after: used` trigger reclaims it. This is the "few tokens vs
full SKILL.md" split; an `◆ invoked … · by agent` line marks a model-driven load.

Any non-slash input is a normal user turn that drives the agentic loop. `/use`,
`/<name>`, the picker, and a mentioned `/skill-name` all **suggest** a skill
(`suggestSkill`): they send only its summary — a bright yellow `◆ suggested
<name> · summary only …` line and a small block in the visualizer — *not* its
body. The model then loads the full `SKILL.md` itself via `invoke_skill` (an `◆
invoked <name> · … · by agent` line and a full-size block). The CLI runs with
`autoTriggers: true`, so an ephemeral skill with `evict-after: used` is wiped
**deterministically** — it stays at full size through the whole turn that uses it,
then is cleared at the **end of that turn** (`evictUsedSkills`; a dim
`auto-cleared …` line and the chip's `✗` + the re-link cut confirm it). The edit
lands immediately so the cut is visible between turns; the one-time reprocess is
paid by the next request. Eviction is **fully deterministic** — the model has no
clear tool at all; it only loads skills with `invoke_skill`, and the harness
reclaims them via the frontmatter trigger (plus the human `/clear-skill`). This
mirrors `clear_tool_uses`, which is likewise an automatic strategy, not a model
button (see [eviction-triggers § Why eviction is not a model
tool](eviction-triggers.md)). Persona (`ephemeral: false`) skills are never
auto-evicted.

## The payoff: the usage panel

After each request the CLI prints `usage.cache_read_input_tokens` and
`usage.cache_creation_input_tokens`. The demo arc:

1. `/regex-cookbook` → suggest the skill (its summary, a few tokens).
2. ask it to write a pattern → the agent calls `invoke_skill` to load the full
   (~1k token) body and applies it (`cache_read` now includes `s`).
3. end of that turn → `evict-after: used` auto-clears it (the chip greys out and
   the re-link cut appears); the next request pays the one-time `cache_creation`
   spike ≈ `ω·X`, after which every subsequent `cache_read` is ≈ `ρ·s` lower. The
   crossover is the cost model rendered in real tokens. (`/clear-skill` forces it.)

## Requirements

Needs an Anthropic credential for `send()` — put `ANTHROPIC_API_KEY` in a `.env`
file (copy `.env.example`; the CLI auto-loads it via `dotenv`) or the environment.
A Claude Pro/Max subscription or `claude -p` **cannot** be used: the loop drives
the raw Messages API to control cache breakpoints and read per-request cache usage,
which the subscription / CLI don't expose. A gateway bearer token works instead
(`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`). No credential is needed for
`/skills`, `/use`, `/clear-skill`, `/context`, or to typecheck.
