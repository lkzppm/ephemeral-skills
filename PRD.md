# PRD — `clear_skill_uses`: ephemeral skill context eviction

> Implementation context for this repo. Pair with [`docs/cost-model.md`](docs/cost-model.md)
> for the economic justification and [`ISSUE_COMMENT_BODY.md`](ISSUE_COMMENT_BODY.md) for the upstream framing.

## 1. Problem

When a skill is invoked, the rendered `SKILL.md` enters the conversation as one
message and persists for the remainder of the session. Claude Code does not
re-read the skill file on later turns, so the content is pure standing context
from that point on.

For **knowledge-delivery skills** — ones whose job is to *deliver* procedural
knowledge once (how to implement X, a checklist, a domain primer) — this is
wasteful: after the knowledge is consumed, the body keeps occupying context,
costing recurring cache-read tokens and diluting attention ("lost in the middle")
for the rest of the session.

The only existing relief is auto-compaction, which is lossy and budget-driven
(re-attaches the most recent invocation of each skill, first ~5k tokens, 25k
combined budget). There is no deliberate, targeted, single-skill eviction.

This is the exact gap in upstream issue **#21583**.

## 2. Goals / non-goals

**Goals**
- Excise a *specific* skill's body from context on a deliberate trigger, leaving a
  short placeholder so the model retains the record that the skill ran.
- Preserve everything else verbatim: file reads, tool results, assistant turns,
  user messages.
- Make eviction **cache-aware**: only fire when it is a net token win (or when the
  user/model explicitly forces it for quality reasons), per the cost model.
- Ship as an Agent-SDK reference strategy now; propose a native harness feature.

**Non-goals**
- Evicting **behavioral** skills (personas, conventions that should apply all
  session). Default `ephemeral: false`; eviction is strictly opt-in.
- Replacing compaction. This is complementary and finer-grained.
- Patching the minified interactive `claude` bundle (see §7).
- Cross-session persistence/memory (orthogonal; out of scope).

## 3. Design overview

Mirror the existing `clear_tool_uses_20250919` context edit, but target **skill
invocation messages** instead of `tool_result` blocks.

```
clear_tool_uses_20250919   →   replaces bulky tool_result bodies with a stub,
                                keeps the tool_use record.
clear_skill_uses_<date>    →   replaces a skill's SKILL.md body with a stub,
                                keeps the "skill <name> was invoked" record.
```

Two layers:

- **Layer A — SDK reference strategy (this repo, build first).** A client-side
  transform over the `messages` array in an Agent SDK loop. Tags each skill block
  on injection, and on trigger rewrites it to a placeholder before the next send.
- **Layer B — native harness proposal (RFC).** The same selector implemented inside
  the harness as a `context-management` strategy, plus frontmatter and a first-class
  model-invocable `clear_skill` tool. Specified here, not implemented in this repo.

## 4. Identifying a skill block

A skill invocation is a single, identifiable message. The transform must locate it
robustly:

- **Native path:** the harness knows which message is a skill invocation; tag it at
  injection time with `{ skill_name, invocation_id }` metadata. Deterministic.
- **SDK path (this repo):** since we control injection in the reference loop, wrap
  the injected skill content in sentinel markers and record
  `{ skill_name, invocation_id, message_index, token_len }` in a side table. Match
  on `invocation_id`, never on fuzzy content.

Do **not** identify skills by content hashing alone in production — collisions and
edits make it brittle. The side-table/metadata approach is normative.

A skill body is its **own content category** — a `{ type: "skill", … }` block (SDK
path) or first-class harness metadata (native path), **never** a `tool_result`. If
it were a `tool_result`, `clear_tool_uses_20250919` would own its lifecycle under
tool-result policy and lose the `ephemeral` flag and the eviction triggers.
`clear_skill_uses` is therefore **orthogonal** to `clear_tool_uses`, not a special
case of it. (The body is never folded into `system` either — that prefix is frozen,
so per-skill mid-array eviction would be impossible.)

## 5. Placeholder (stub) semantics

On eviction, replace the body with a compact stub, e.g.:

```
[skill "regex-cookbook" was invoked earlier and has been evicted to free
context. Re-invoke /regex-cookbook to reload its instructions.]
```

Rationale (inherited from `clear_tool_uses`): keeping the record that the skill ran
(a) tells the model the capability exists and was used, (b) preserves prefix
integrity *above* the stub, (c) lets the model re-invoke if it turns out it still
needed the body. Stub length is configurable (`evict_keep_tokens`, default ≈ 30).

## 6. Triggers

**The strict `ephemeral` gate governs all of them.** `ephemeral: false` (the
default) means the skill is resident for the whole session and is **never** evicted
— not by policy, not by the `clear_skill` tool, not by an explicit `target`. The
only override is a deliberate human force (`--force`). Once the model can evict its
own skills, this absolute floor is a safety property: it cannot drop a
persona / guardrail skill mid-task.

Three composable triggers, all subject to that gate:

1. **Frontmatter, declarative (primary).**
   ```yaml
   ephemeral: true            # opt in; default false
   evict-after: used          # used | <N>-steps | <T>-tokens
   evict-keep-tokens: 30      # stub budget
   ```
   `evict-after: used` = evict at the first request after the skill's output has
   been consumed (recommended — minimizes the lived band X).
2. **The `clear_skill` model tool (first-class).** Expose `clear_skill(skill_name)`
   so the model can drop a skill when it decides it's done (matches #21583's Blender
   example). It resolves the name to its `invocationId` and calls the core with
   `target`, never `force`; refused on `ephemeral: false`. Gate behind a
   `disable-model-invocation`-style opt-in.
3. **Threshold, automatic.** Like `clear_tool_uses`, fire when context crosses a
   token threshold, evicting ephemeral skills oldest-first (cost-gated). Excludable
   per skill.

A manual surface — `/clear-skill <name>` (and `/clear-skill <name> --force`, the
human override) — is provided in the reference CLI (§7).

## 7. Delivery surfaces

- **Agent SDK (TS/Python):** full implementation lands here. The SDK *is* the Claude
  Code harness exposed as a library, so a strategy here is the faithful prototype.
- **Reference CLI showcase (`npm start`):** a local Ink TUI (`examples/cli.tsx`) over the
  SDK loop that injects skills via slash commands (with autocomplete) and shows a
  live header + per-turn cache-usage panel — the legible demo and interactive face of the M3 harness. It is a
  purpose-built showcase, **not** the production TUI.
- **Interactive `claude` TUI:** cannot be patched externally (compiled bundle, no
  license to modify/redistribute, re-injects skill state each turn). Native support
  must come from Anthropic — hence the RFC. Do not attempt to monkeypatch the binary.

## 8. Cache-correctness requirements

The eviction request breaks the cached prefix at the stub. Implementation MUST:

- Place the cache breakpoint immediately **after the stable prefix** (`P`) so `P`
  stays warm; only the post-stub region reprocesses.
- Re-cache the reprocessed region on the same request (write price `ω`, all-in —
  do **not** pay fresh `1×` then write separately; one write pass covers it).
- Expose an `applied_edits`-style result: `{ skills_evicted, tokens_freed,
  tokens_reprocessed }`, so callers can verify the cost model empirically.
- Gate automatic eviction on the model predicate `ρ·s·M > ω·X` (see cost-model.md);
  expose `M` estimation as a pluggable policy (default: remaining-token-budget /
  avg-step-tokens).

## 9. Edge cases & interactions

- **Behavioral skills:** `ephemeral` defaults false and is a **strict gate** — never
  evicted by policy, the `clear_skill` tool, or an explicit target; only a deliberate
  human `--force` overrides (so the model cannot drop its own guardrails).
- **Compaction interaction (important):** auto-compaction re-attaches recent skills.
  An *intentionally* evicted skill MUST be marked so compaction does **not**
  resurrect it. Add an `evicted` flag to the skill's side-table entry; compaction
  re-attach logic must skip flagged skills.
- **`context: fork` skills:** already isolated in a subagent; eviction is a no-op for
  them. Detect and skip.
- **Re-invocation after eviction:** allowed; costs a fresh load + cache write. The
  stub's "re-invoke to reload" text makes this discoverable to the model.
- **Multiple invocations of the same skill:** key on `invocation_id`; evict the
  specific instance(s) targeted, default = all but the most recent.
- **Skill that spawned tool calls:** evict only the skill instruction message; leave
  any resulting `tool_use`/`tool_result` pairs intact.

## 10. Milestones

- **M1 — SDK transform + unit tests.** `clearSkillUses(messages, opts)` rewrites a
  tagged skill block to a stub, preserves all else, returns `applied_edits`. Pure
  function, no network. (`src/clearSkillUses.ts`, `tests/`)
- **M2 — Frontmatter + triggers + loop.** Parse `ephemeral`/`evict-after`/
  `evict-keep-tokens`; the first-class `clear_skill` model tool; wire `evict-after:
  used` and threshold triggers into an Agent SDK loop; ship the reference CLI
  (`npm start`).
- **M3 — Empirical cost harness.** Real API calls with prompt caching on; record
  `usage.cache_read_input_tokens` / `cache_creation_input_tokens` before/after to
  validate `ρ·s·M` vs `ω·X`. Emit a CSV + a break-even plot.
- **M4 — RFC/PR.** File the reference impl + cost data as a comment reviving #21583
  and (optionally) a draft PR proposing native `clear_skill_uses`.

## 11. Testing strategy (local)

- **Unit:** synthetic `messages` array with a tagged skill block →
  assert stub replaces body, byte-identical elsewhere, correct `tokens_freed`.
- **Regression:** `ephemeral: false` skill is never touched by any trigger.
- **Cache empirical:** drive a real loop (fat skill, do work, evict, continue);
  assert `cache_read` drops by ≈ `s` per subsequent step and one-time
  `cache_creation` spike ≈ `X` at eviction. Compare to predicted break-even.
- **Continuity:** after eviction, assert the model still has file-read/tool context
  (ask it to reference a file read before the skill) — proves we only dropped the
  skill, not the work.
- **Compaction:** force compaction after an eviction; assert the evicted skill is
  **not** re-attached.

## 12. Decisions & open questions

**Resolved**
- **Does an explicit `target` override `ephemeral: false`?** No. `ephemeral` is a
  strict gate (§6): policy, the `clear_skill` tool, and explicit targets all respect
  it; only a human `--force` overrides. Rationale: the model must not be able to drop
  its own persona / guardrail skills.
- **Deterministic vs model-driven?** Both, composable: frontmatter `evict-after` is
  primary; the `clear_skill` tool is first-class for model-decided drops; threshold is
  the automatic backstop.
- **Manual surface?** A `/clear-skill <name>` slash command (with `--force`) in the
  reference CLI (§7).
- **Default `evict-after` when `ephemeral: true` but unspecified** — `used` (minimizes
  the lived band `X`; see the cost-model timing corollary).

**Open**
- Integrate as a new `type` under the existing `context-management-2025-06-27` beta, or
  a separate strategy? (Prefer the former for API symmetry.)
- The exact native metadata shape for a skill block in Layer B (harness-internal).

## 13. Reference contract

See `src/clearSkillUses.ts` for the typed interface Claude Code should implement
against. Keep the core a **pure function** (messages in → messages + applied_edits
out) so it is trivially testable and harness-agnostic.
