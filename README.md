# ephemeral-skills

**Selective, cache-aware eviction of a skill's `SKILL.md` body from an agent's context once the skill is no longer needed — while preserving file reads, tool results, and conversation history.**

Today, when a skill is invoked in Claude Code, its rendered `SKILL.md` enters the
conversation as a single message and **stays there for the rest of the session**.
A "knowledge-delivery" skill (e.g. `/regex-cookbook` that explains how to
implement something) keeps paying a recurring token cost and dilutes attention
long after its instructions have been consumed.

The only existing relief is auto-compaction, which is **budget-driven and lossy**
(it re-attaches the first ~5k tokens of recent skills under a 25k combined budget)
— not a deliberate, surgical, single-skill eviction.

This repo is:

1. A **reference implementation** (Agent SDK, TypeScript) of a `clear_skill_uses`
   context-management strategy — the skill analogue of the existing
   `clear_tool_uses_20250919` context edit.
2. A **cost model** proving when eviction is a net token win (and when it isn't),
   so eviction is triggered deliberately rather than blindly.
3. An **RFC / PR draft** to `anthropics/claude-code` proposing this as a
   first-class harness feature.

## The one-line cost result

Evicting a skill of `s` tokens that would otherwise persist for `M` more requests,
at the price of reprocessing a "lived band" of `X` tokens, is a net win iff:

```
ρ·s·M  >  ω·X        ⟺        s·M  >  (ω/ρ)·X
```

with cache-read `ρ ≈ 0.1` and cache-write `ω ≈ 1.25` (5-min TTL) / `2.0` (1-hr).
So the hurdle is `s·M > ~12.5·X`: evict **fat, long-lived** skills with a **small
lived band**, and evict **as early as possible** (X grows the longer you wait).

Full derivation: [`docs/cost-model.md`](docs/cost-model.md).

## Quickstart

```bash
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY (only the live CLI / harness need it)
```

The CLI and harness auto-load `.env`. A Claude Pro/Max subscription or `claude -p`
**can't** drive this loop — it needs the raw Messages API (manual `cache_control` +
per-request cache usage), which the subscription/CLI don't expose. To front it with
a gateway, set `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` in `.env` instead.

**Demo REPL** — inject a skill, use it, evict it, watch the per-turn cache panel:

```
npm start
» /skills                            # skills discovered under skills/
» /regex-cookbook                 # inject a fat (~2.8k tok) skill
» Explain PUT vs PATCH for my API.   # use it (cache_read now includes the skill)
» /clear-skill regex-cookbook     # evict it
» Any follow-up…                     # cache_read is ~ρ·s smaller; one-time spike at the cut
» /usage                             # the per-turn cache log
```

`ephemeral` is a **strict gate**: `ephemeral:false` skills (personas, guardrails)
can't be evicted by policy, by the model's `clear_skill` tool, or by an explicit
target — only a human `--force`. The model may also call `clear_skill` itself when
it decides it's done with an ephemeral skill.

**Cost harness** — run the inject → use → evict → tail scenario live, emit a CSV
plus a predicted-vs-observed summary:

```bash
npm run harness            # default 6 tail turns;  TAIL=12 npm run harness
```

**Develop:** `npm run typecheck` (tsc) · `npm test` (vitest — M1 pure-core units).

### Layout

| Path | What |
|---|---|
| `src/clearSkillUses.ts` | pure transform + cost gate (M1) |
| `src/frontmatter.ts`, `src/skillLoader.ts` | parse SKILL.md frontmatter, load skills |
| `src/tools/clearSkill.ts` | the model-invocable `clear_skill` tool |
| `src/loop.ts` | `SkillAgent` — the SDK loop (injection, triggers, cache breakpoint, usage) |
| `cli/cli.tsx` · `cli/costHarness.ts` | the `npm start` Ink TUI · the `npm run harness` |
| `cli/markdown.ts` | Markdown → styled terminal rows for the TUI |
| `agent/systemPrompt.ts` · `agent/skills/` | the demo agent's system prompt · its skills (2 ephemeral, 1 persona) |
| `spec/` · [`CLAUDE.md`](CLAUDE.md) | spec ecosystem · contributor / agent router |

## Status

Proof-of-concept / RFC. The reference implementation runs on the Claude Agent SDK
(same harness that powers Claude Code, exposed as a library). It is **not** a patch
to the interactive `claude` binary — see PRD §"Delivery surfaces" for why.

## Prior art / related issues

- [#21583](https://github.com/anthropics/claude-code/issues/21583) — *Remove skills from context when not in use* (the canonical request; currently stale). This repo is its reference implementation.
- [#39749](https://github.com/anthropics/claude-code/issues/39749) — Skill activation/deactivation per session (load-time cousin).
- [#45091](https://github.com/anthropics/claude-code/issues/45091) — Clear context *before* skill execution (coarse, wrong boundary).
- [#35150](https://github.com/anthropics/claude-code/issues/35150) — Programmatic clear + continuation injection.
- [#17283](https://github.com/anthropics/claude-code/issues/17283) — `context: fork` ignored on Skill-tool invocation.
- Anthropic API — [`clear_tool_uses_20250919`](https://platform.claude.com/docs/en/build-with-claude/context-editing) context editing (the machinery this extends).

## License

MIT — see [LICENSE](LICENSE).
