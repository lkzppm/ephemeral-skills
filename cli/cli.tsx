/**
 * Interactive TUI showcase for ephemeral_skills (the clear_skill_uses reference).
 *
 * A small Claude-Code-like terminal UI built on Ink (React for the terminal):
 *  - a fixed HEADER pinned to the top with live skill / context / cache stats,
 *  - a scrolling CHAT transcript in the middle (auto-pinned to the latest line),
 *  - a bottom-pinned INPUT with slash-command + skill-name autocomplete that
 *    works mid-sentence; Tab writes the completion, Enter writes-and-sends.
 *  - `/skills` opens an interactive picker; Esc twice quits.
 *
 * Its only job is to make the mechanism legible: the agent always sees a one-line
 * summary of every skill, loads a skill's full SKILL.md on demand via invoke_skill,
 * then it gets evicted — and the per-turn cache meter drops. Slash commands and a
 * mentioned `/skill-name` just *suggest* a skill (summary only); the agent decides
 * whether to invoke it. `/clear-skill` evicts; any other input is a normal turn.
 *
 * Run with:  npm start   (or: tsx cli/cli.tsx)
 * Requires:  ANTHROPIC_API_KEY for agent.send() — put it in .env (auto-loaded) or
 *            the environment. Every slash command works without a credential.
 */

import "dotenv/config";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Text, measureElement, useApp, useInput, useWindowSize, type DOMElement } from "ink";
import { Spinner } from "@inkjs/ui";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  SkillAgent,
  loadSkills,
  type LoadedSkill,
  type UsageRecord,
  type StackItem,
  type AppliedEdits,
} from "../src/index";
import { renderMarkdown, type Seg } from "./markdown";
import {
  type Entry,
  type EntryKind,
  type SavedConversation,
  saveConversation,
  listConversations,
  slugify,
  turnCount,
} from "./conversations";

// ---------------------------------------------------------------------------
// Agent definition (lives under agent/): the system prompt + the skills.
// The prompt is plain Markdown; a leading <!-- … --> maintainer note is stripped
// before it's sent to the model.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL("../agent/systemPrompt.md", import.meta.url)),
  "utf-8",
)
  .replace(/^<!--[\s\S]*?-->\s*/, "")
  .trim();

const skillsDir = fileURLToPath(new URL("../agent/skills", import.meta.url));
const skills = loadSkills(skillsDir);
const skillNames = skills.map((s) => s.name);

// The model the agent actually sends — same resolution as SkillAgent.callModel
// (`cfg.model ?? ANTHROPIC_MODEL ?? DEFAULT_MODEL`); the CLI passes no cfg.model.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const ORANGE = "#ff8800";
// Vibrant green for the `fresh` token series — ANSI `green` (color 2) renders too
// dark on most terminals to read apart from `cached` blue.
const FRESH_GREEN = "#3aff7a";

const KNOWN_COMMANDS = new Set([
  "help",
  "skills",
  "use",
  "clear-skill",
  "usage",
  "context",
  "save",
  "resume",
  "quit",
  "exit",
]);

// Single-token commands offered by autocomplete (mid-sentence aware).
const COMMAND_TOKENS = [
  "/help",
  "/skills",
  "/usage",
  "/context",
  "/save",
  "/resume",
  "/use",
  "/clear-skill",
  "/quit",
  "/exit",
];

const COMMAND_DESC: Record<string, string> = {
  "/help": "show commands",
  "/skills": "interactive skill picker",
  "/usage": "per-turn cache usage",
  "/context": "context stats",
  "/save": "save this conversation <name>",
  "/resume": "reopen a saved conversation",
  "/use": "suggest a skill (summary only)",
  "/clear-skill": "evict a skill",
  "/quit": "quit",
  "/exit": "quit",
};

const MENU_LIMIT = 5;
const PLACEHOLDER = "message, or /command";

// ---------------------------------------------------------------------------
// Transcript model — Entry / EntryKind / the on-disk format live in ./conversations.
// ---------------------------------------------------------------------------
interface Stats {
  skillCount: number;
  activeSkills: number;
  ctxTokens: number;
  msgCount: number;
  lastRead: number;
  lastCreation: number;
  totalFreed: number;
  items: StackItem[];
  cutIndex: number | null;
  reprocessPending: boolean;
}

// ---------------------------------------------------------------------------
// Autocomplete helpers (pure — token under the cursor, mid-sentence aware).
// ---------------------------------------------------------------------------

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Whitespace-delimited token containing the cursor. */
function tokenBounds(value: string, cursor: number): { token: string; start: number; end: number } {
  let start = cursor;
  while (start > 0 && !isSpace(value[start - 1]!)) start--;
  let end = cursor;
  while (end < value.length && !isSpace(value[end]!)) end++;
  return { token: value.slice(start, end), start, end };
}

/** The token immediately before position `start` (skipping whitespace). */
function previousToken(value: string, start: number): string {
  let i = start - 1;
  while (i >= 0 && isSpace(value[i]!)) i--;
  const end = i + 1;
  while (i >= 0 && !isSpace(value[i]!)) i--;
  return value.slice(i + 1, end);
}

interface MatchInfo {
  token: string;
  start: number;
  end: number;
  matches: string[];
}

function computeMatches(value: string, cursor: number): MatchInfo {
  const { token, start, end } = tokenBounds(value, cursor);

  if (token.startsWith("/")) {
    const pool = [...COMMAND_TOKENS, ...skillNames.map((n) => `/${n}`)];
    const lt = token.toLowerCase();
    return { token, start, end, matches: pool.filter((p) => p.toLowerCase().startsWith(lt)) };
  }

  // Argument completion: `/use <skill>` and `/clear-skill <skill>`.
  const prev = previousToken(value, start);
  if (prev === "/use" || prev === "/clear-skill") {
    const lt = token.toLowerCase();
    return { token, start, end, matches: skillNames.filter((n) => n.toLowerCase().startsWith(lt)) };
  }

  return { token, start, end, matches: [] };
}

function describeItem(item: string): string {
  if (COMMAND_DESC[item]) return COMMAND_DESC[item]!;
  const name = item.startsWith("/") ? item.slice(1) : item;
  const sk = skills.find((s) => s.name === name);
  if (sk) return `skill · ~${sk.tokenLen} tok${sk.frontmatter.ephemeral ? "" : " · persona"}`;
  return "";
}

/** Is `tok` an exact, recognized slash command or /skill-name? */
function isCommandToken(tok: string): boolean {
  if (!tok.startsWith("/")) return false;
  const name = tok.slice(1);
  return KNOWN_COMMANDS.has(name) || skillNames.includes(name);
}

/** Character indices in `value` covered by a recognized /command token. */
function commandHighlightSet(value: string): Set<number> {
  const set = new Set<number>();
  const re = /[^ \t]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (isCommandToken(m[0])) {
      for (let i = m.index; i < m.index + m[0].length; i++) set.add(i);
    }
  }
  return set;
}

/** Plain text a non-assistant entry renders as (before wrapping). Assistant
 *  entries are rendered as Markdown, not via this path. */
function entryText(entry: Entry): string {
  if (entry.kind === "user") return `» ${entry.text}`;
  return entry.text;
}

/** Greedy word-wrap (breaking over-long words), matching Ink's default. */
function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const seg of text.split("\n")) {
    if (seg.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of seg.split(" ")) {
      if (word.length > width) {
        if (line) {
          out.push(line);
          line = "";
        }
        let w = word;
        while (w.length > width) {
          out.push(w.slice(0, width));
          w = w.slice(width);
        }
        line = w;
      } else if (line === "") {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** One rendered terminal row of the transcript. `segs` (when present, for
 *  Markdown-rendered assistant rows) takes precedence over `text`. */
interface VisualLine {
  key: string;
  kind: EntryKind | "gap";
  text: string;
  first: boolean;
  segs?: Seg[];
}

/** Flatten the transcript into styled rows, with a blank line between entries.
 *  Assistant turns are Markdown-rendered (pre-wrapped to `width`); every other
 *  kind keeps the plain word-wrap path. */
function flattenTranscript(transcript: Entry[], width: number): VisualLine[] {
  const out: VisualLine[] = [];
  transcript.forEach((entry, ei) => {
    if (ei > 0) out.push({ key: `gap-${entry.id}`, kind: "gap", text: "", first: false });
    if (entry.kind === "assistant") {
      const rows = renderMarkdown(entry.text || " ", width);
      const lines = rows.length ? rows : [{ segs: [{ text: " " }] }];
      lines.forEach((l, li) => {
        out.push({ key: `${entry.id}-${li}`, kind: "assistant", text: "", first: li === 0, segs: l.segs });
      });
    } else {
      wrapText(entryText(entry), width).forEach((text, li) => {
        out.push({ key: `${entry.id}-${li}`, kind: entry.kind, text, first: li === 0 });
      });
    }
  });
  return out;
}

/** The chat line announcing a model invocation (full SKILL.md loaded into context). */
function skillInvokeText(name: string): string {
  const sk = skills.find((s) => s.name === name);
  if (!sk) return `◆ invoked ${name}`;
  const kind = sk.frontmatter.ephemeral ? "ephemeral" : "persona";
  return `◆ invoked ${name} · loaded SKILL.md (~${sk.tokenLen} tok · ${kind})`;
}

/** The chat line for a human suggestion — only the summary is sent; the agent
 *  decides whether to invoke_skill for the full body. */
function skillSuggestText(name: string, mentioned = false): string {
  const sk = skills.find((s) => s.name === name);
  if (!sk) return `◆ suggested ${name}`;
  return (
    `◆ suggested ${name} · summary only — the agent can invoke_skill to load the full SKILL.md (~${sk.tokenLen} tok)` +
    (mentioned ? " · mentioned" : "")
  );
}

/** Column header for the picker / banner table (same widths as `skillRow`). */
const SKILL_HEAD = "name".padEnd(22) + "ephemeral".padEnd(11) + "tokenLen".padEnd(12) + "evictAfter";

/** A skill's row in the picker / banner table. */
function skillRow(s: LoadedSkill): string {
  return (
    String(s.name).padEnd(22) +
    String(s.frontmatter.ephemeral).padEnd(11) +
    `~${s.tokenLen} tok`.padEnd(12) +
    (s.frontmatter.evictAfter?.kind ?? "—")
  );
}

// ---------------------------------------------------------------------------
// Pure text formatters (shared with the non-interactive fallback banner).
// ---------------------------------------------------------------------------

function helpText(): string {
  return [
    "Commands:",
    "  /help                          show this list",
    "  /skills                        interactive skill picker (↑/↓ · Enter)",
    "  /use <name>  ·  /<name>        suggest a skill (sends its summary; the agent invokes it)",
    "  /clear-skill <name> [--force]  evict a loaded skill from context",
    "  /usage                         per-turn cache usage log",
    "  /context                       current context stats",
    "  /save <name>                   save this conversation to conversations/",
    "  /resume                        reopen a saved conversation (↑/↓ · Enter)",
    "  /quit  ·  /exit                quit  (also Esc Esc, Ctrl+C / Ctrl+D)",
    "",
    "The agent always sees a one-line summary of every skill and loads a skill's full",
    "SKILL.md on demand via invoke_skill. /use and a mentioned /skill-name just suggest",
    "one (summary only); the agent decides whether to invoke it (needs ANTHROPIC_API_KEY).",
  ].join("\n");
}

function skillsTableText(list: LoadedSkill[]): string {
  if (list.length === 0) return "(no skills loaded)";
  return [SKILL_HEAD, "-".repeat(58), ...list.map(skillRow)].join("\n");
}

/** Exact integer with thousands separators (e.g. 5332 -> "5,332"). */
function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function computeStats(agent: SkillAgent): Stats {
  const cs = agent.contextStats();
  const stack = agent.contextStack();
  const log = agent.usageLog;
  const last = log[log.length - 1];
  return {
    // total = skills available to inject; active = non-evicted skills in context.
    skillCount: skills.length,
    activeSkills: cs.skills.filter((s) => !s.evicted).length,
    ctxTokens: cs.estimatedTokens,
    msgCount: cs.messageCount,
    lastRead: last?.cacheReadTokens ?? 0,
    lastCreation: last?.cacheCreationTokens ?? 0,
    totalFreed: log.reduce((a, u) => a + (u.appliedEdits?.tokensFreed ?? 0), 0),
    items: stack.items,
    cutIndex: stack.cutIndex,
    reprocessPending: stack.reprocessPending,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// Context-window visualizer: append-ordered chips, one per block, plus a rule
// row underneath marking the cached prefix `P` and the KV-cache re-link cut.
function chipStyle(item: StackItem): { bg: string; fg: string; dim?: boolean } {
  switch (item.kind) {
    case "system":
      return { bg: "magenta", fg: "white" };
    case "user":
      return { bg: "blue", fg: "white" };
    case "ai":
      return { bg: "green", fg: "black" };
    case "skill":
      return item.evicted ? { bg: "gray", fg: "white", dim: true } : { bg: "yellow", fg: "black" };
  }
}

// Only the answer square is drawn on AI chips; tool steps are showcase noise and
// are filtered out before rendering (see chipCells).
const STEP_GLYPH: Record<"answer", { g: string; fg: string; bold?: boolean }> = {
  answer: { g: "■", fg: "black" },
};

const MAX_STEPS = 14;

/** The styled cells of one chip (background-filled, label + any step glyphs). */
function chipCells(item: StackItem, draft: boolean): Seg[] {
  const st = chipStyle(item);
  const base: Seg = { text: "", bg: st.bg, color: st.fg, dim: st.dim };

  if (item.kind === "ai") {
    const cells: Seg[] = [{ ...base, text: ` ${item.label} ` }];
    // Tool steps are dropped — only the final-answer square is shown.
    const steps = (item.steps ?? []).filter((s): s is "answer" => s === "answer");
    if (draft && steps.length === 0) {
      cells.push({ ...base, text: "⋯" });
    } else {
      for (const s of steps.slice(0, MAX_STEPS)) {
        const g = STEP_GLYPH[s];
        cells.push({ text: g.g, bg: st.bg, color: g.fg, bold: g.bold });
      }
      if (steps.length > MAX_STEPS) cells.push({ ...base, text: "+" });
    }
    cells.push({ ...base, text: " " });
    return cells;
  }

  let label = item.label;
  if (item.kind === "skill") {
    const name = item.label.length > 12 ? item.label.slice(0, 12) : item.label;
    label = item.evicted ? `✗ ${name}` : `◆ ${name}`;
  }
  return [{ ...base, text: ` ${label} ` }];
}

const cellsWidth = (cells: Seg[]): number => cells.reduce((a, c) => a + c.text.length, 0);

/** The rule-row segment under one chip: solid `═` for the cached prefix, `✂`
 *  centered at the re-link cut, dashed `╌` for the tail still owing its one-time
 *  reprocess (only while `pending`), dotted `┄` for the frontier block.
 *  The last chip is always **fresh** (`┄`): it's the answer just generated (model
 *  output) or a just-typed message — it has never been sent to the API as input,
 *  so it was never cached and cannot be "rebuilt". Only blocks that *were* in the
 *  warm cache before the cut show the rebuilt `╌`; once the reprocess settles they
 *  re-cache to blue `═`. */
function ruleSeg(idx: number, isLast: boolean, cutIndex: number | null, pending: boolean, w: number): Seg {
  const cached: Seg = { text: "═".repeat(w), color: "blue" };
  const fresh: Seg = { text: "┄".repeat(w), color: "cyan", dim: true };

  if (cutIndex !== null) {
    if (idx === cutIndex) {
      const left = Math.floor((w - 1) / 2);
      const fill = pending ? "╌" : "═"; // scar sits on the cached line once settled
      return { text: fill.repeat(left) + "✂" + fill.repeat(Math.max(0, w - left - 1)), color: "red" };
    }
    if (idx > cutIndex) {
      if (isLast) return fresh; // the frontier was never cached — fresh, not rebuilt
      if (pending) return { text: "╌".repeat(w), color: "yellow" };
      return cached; // re-cached after the reprocess settled
    }
    return cached; // idx < cutIndex — always warm
  }
  return isLast ? fresh : cached;
}

interface Chip {
  idx: number;
  cells: Seg[];
  w: number;
  tokens: number;
}

/** Compact token count for the visualizer's per-block token row (e.g. 5029 ->
 *  "5k", 1240 -> "1.2k", 340 -> "340"). */
function tokenLabel(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Center `s` within width `w` (truncating if it doesn't fit). */
function centerIn(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  const pad = w - s.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s + " ".repeat(pad - left);
}

function ContextStack({
  items,
  cutIndex,
  reprocessPending,
  streaming,
  width,
}: {
  items: StackItem[];
  cutIndex: number | null;
  reprocessPending: boolean;
  streaming: boolean;
  width: number;
}) {
  const inner = Math.max(1, width);

  // While a turn is in flight before its first assistant message lands, show a
  // provisional AI loop so the append is visible the instant you hit Enter.
  const display: { item: StackItem; idx: number; draft: boolean }[] = items.map((item, idx) => ({
    item,
    idx,
    draft: false,
  }));
  if (streaming && (items.length === 0 || items[items.length - 1]!.kind !== "ai")) {
    const n = items.filter((i) => i.kind === "ai").length + 1;
    display.push({ item: { kind: "ai", label: `AI·${n}`, tokens: 0, steps: [] }, idx: items.length, draft: true });
  }

  if (display.length === 0) {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor>{"┄".repeat(inner)}</Text>
        <Text> </Text>
      </Box>
    );
  }

  const chips: Chip[] = display.map((d) => {
    const cells = chipCells(d.item, d.draft);
    return { idx: d.idx, cells, w: cellsWidth(cells), tokens: d.item.tokens };
  });

  // Keep the most recent chips; collapse the (warm) older ones into a summary.
  const GAP = 1;
  const totalNoSummary = chips.reduce((a, c) => a + c.w, 0) + Math.max(0, chips.length - 1) * GAP;
  let start = 0;
  if (totalNoSummary > inner) {
    for (start = 1; start < chips.length; start++) {
      const summaryW = `‹${start}`.length + 2;
      let tot = summaryW + GAP;
      for (let i = start; i < chips.length; i++) tot += chips[i]!.w + (i > start ? GAP : 0);
      if (tot <= inner) break;
    }
    if (start >= chips.length) start = chips.length - 1;
  }

  const shown = chips.slice(start);
  const hidden = start;
  const lastIdx = display[display.length - 1]!.idx;

  // Summary chip stands in for the collapsed prefix: cached unless a reprocess
  // is still pending AND the cut is itself hidden (then the visible tail is all
  // post-cut, awaiting rebuild).
  const summaryRebuilt = reprocessPending && cutIndex !== null && cutIndex < start;
  const summaryChip: Chip | null =
    hidden > 0
      ? {
          idx: -1,
          cells: [{ text: ` ‹${hidden} `, bg: "gray", color: "white", dim: true }],
          w: `‹${hidden}`.length + 2,
          tokens: chips.slice(0, start).reduce((a, c) => a + c.tokens, 0),
        }
      : null;

  const chipRow: React.ReactNode[] = [];
  const ruleRow: React.ReactNode[] = [];
  const tokenRow: React.ReactNode[] = [];
  let key = 0;

  const pushChip = (c: Chip, rule: Seg, gapBefore: boolean) => {
    if (gapBefore) {
      chipRow.push(<Text key={`g${key}`}> </Text>);
      ruleRow.push(<Text key={`gr${key}`}> </Text>);
      tokenRow.push(<Text key={`gt${key}`}> </Text>);
    }
    chipRow.push(
      <Text key={`c${key}`}>
        {c.cells.map((s, i) => (
          <Text key={i} backgroundColor={s.bg} color={s.color} bold={s.bold} dimColor={s.dim}>
            {s.text}
          </Text>
        ))}
      </Text>,
    );
    ruleRow.push(
      <Text key={`r${key}`} color={rule.color} dimColor={rule.dim}>
        {rule.text}
      </Text>,
    );
    tokenRow.push(
      <Text key={`t${key}`} dimColor>
        {centerIn(tokenLabel(c.tokens), c.w)}
      </Text>,
    );
    key++;
  };

  if (summaryChip) {
    const rule: Seg = summaryRebuilt
      ? { text: "╌".repeat(summaryChip.w), color: "yellow" }
      : { text: "═".repeat(summaryChip.w), color: "blue" };
    pushChip(summaryChip, rule, false);
  }
  shown.forEach((c, i) => {
    const rule = ruleSeg(c.idx, c.idx === lastIdx, cutIndex, reprocessPending, c.w);
    pushChip(c, rule, summaryChip !== null || i > 0);
  });

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-start">{chipRow}</Text>
      <Text wrap="truncate-start">{ruleRow}</Text>
      <Text wrap="truncate-start">{tokenRow}</Text>
    </Box>
  );
}

const STEP_LEGEND: [string, string, string][] = [
  ["■", "green", "answer"],
  ["✂", "red", "cut"],
  ["═", "blue", "cached"],
  ["╌", "yellow", "rebuilt"],
];

function Legend() {
  return (
    <Text wrap="truncate-end">
      {STEP_LEGEND.map(([glyph, color, label], i) => (
        <Text key={label}>
          {i > 0 ? " " : ""}
          <Text color={color}>{glyph}</Text>
          <Text dimColor>{` ${label} `}</Text>
        </Text>
      ))}
    </Text>
  );
}

function Header({
  stats,
  streaming,
  width,
}: {
  stats: Stats;
  streaming: boolean;
  width: number;
}) {
  const inner = Math.max(1, width - 4); // round border (2) + paddingX (2)
  return (
    <Box width={width} flexShrink={0} flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Box width={inner} justifyContent="space-between">
        <Text bold color="blue">
          ephemeral_skills
        </Text>
        <Legend />
      </Box>
      <Box width={inner} flexDirection="column" marginTop={1}>
        <ContextStack
          items={stats.items}
          cutIndex={stats.cutIndex}
          reprocessPending={stats.reprocessPending}
          streaming={streaming}
          width={inner}
        />
      </Box>
    </Box>
  );
}

/** One `label value` counter with a colored label. */
function Counter({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Text>
      <Text color={color} bold>
        {label}
      </Text>
      <Text>{` ${value}`}</Text>
    </Text>
  );
}

/** Bottom status line: the skill counter on the left, cache counters on the
 *  right, each label color-coded. */
function Counters({ stats, width }: { stats: Stats; width: number }) {
  return (
    <Box width={width} paddingX={1} justifyContent="space-between">
      <Counter label="skills" value={`${stats.activeSkills}/${stats.skillCount}`} color="green" />
      <Box>
        <Counter label="ctx" value={`~${stats.ctxTokens} tok`} color="white" />
        <Text dimColor>{"   "}</Text>
        <Counter label="cached" value={`${stats.lastRead}`} color="blue" />
        <Text dimColor>{"   "}</Text>
        <Counter label="fresh" value={`${stats.lastCreation}`} color={FRESH_GREEN} />
        <Text dimColor>{"   "}</Text>
        <Counter label="freed" value={`${stats.totalFreed}`} color="magenta" />
      </Box>
    </Box>
  );
}

/** Slice `text[from,to)` into contiguous <Text> runs — recognized /command
 *  ranges (per `cyan`) rendered in cyan, the rest in `base`, over `background`. */
function highlightRuns(
  text: string,
  cyan: Set<number>,
  from: number,
  to: number,
  opts?: { background?: string; base?: string },
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = from;
  while (i < to) {
    const on = cyan.has(i);
    let j = i;
    while (j < to && cyan.has(j) === on) j++;
    out.push(
      <Text key={i} backgroundColor={opts?.background} color={on ? "cyan" : opts?.base}>
        {text.slice(i, j)}
      </Text>,
    );
    i = j;
  }
  return out;
}

function VisualLineView({ line, width }: { line: VisualLine; width: number }) {
  switch (line.kind) {
    case "gap":
      return <Text> </Text>;
    case "user": {
      // White on a full-width gray block; recognized /command tokens go cyan.
      const padded =
        line.text.length < width ? line.text + " ".repeat(width - line.text.length) : line.text;
      return (
        <Text>
          {highlightRuns(padded, commandHighlightSet(padded), 0, padded.length, {
            background: "gray",
            base: "#ffffff",
          })}
        </Text>
      );
    }
    case "assistant": {
      const segs = line.segs ?? [{ text: line.text }];
      const empty = !segs.some((s) => s.text !== "");
      if (empty) return <Text> </Text>;
      return (
        <Text wrap="truncate-end">
          {segs.map((s, i) => (
            <Text
              key={i}
              bold={s.bold}
              italic={s.italic}
              underline={s.underline}
              dimColor={s.dim}
              color={s.color}
              backgroundColor={s.bg}
            >
              {s.text}
            </Text>
          ))}
        </Text>
      );
    }
    case "skill":
      return (
        <Text color="yellow" bold={line.first}>
          {line.text || " "}
        </Text>
      );
    case "system":
      return <Text color="cyan">{line.text || " "}</Text>;
    case "usage":
      return <Text dimColor>{line.text || " "}</Text>;
    case "error":
      return <Text color="red">{line.text || " "}</Text>;
  }
}

/**
 * Controlled single-line input with mid-sentence autocomplete.
 *  - Suggestions trigger on a `/token` anywhere in the line, or on the argument
 *    of `/use` / `/clear-skill`. ↑/↓ move the highlight.
 *  - Tab writes the highlighted completion (no send).
 *  - Enter writes the highlighted completion AND sends — unless it's a command
 *    still awaiting an argument (`/use` / `/clear-skill`), which only writes.
 *    With no open menu, Enter just sends the line.
 */
function CommandInput({
  onSubmit,
  history,
}: {
  onSubmit: (value: string) => void;
  history: string[];
}) {
  const { columns } = useWindowSize();
  const [value, setValueState] = useState("");
  const [cursor, setCursorState] = useState(0);
  const [selected, setSelectedState] = useState(0);

  // Shell-style input history. histPos: 0 = editing the draft, 1 = newest entry.
  const histPos = useRef(0);
  const savedDraft = useRef("");

  // Refs mirror state so the useInput handler always reads the latest values.
  const valueRef = useRef(value);
  const cursorRef = useRef(cursor);
  const selRef = useRef(selected);
  const setValue = (v: string) => {
    valueRef.current = v;
    setValueState(v);
  };
  const setCursor = (c: number) => {
    cursorRef.current = c;
    setCursorState(c);
  };
  const setSelected = (s: number) => {
    selRef.current = s;
    setSelectedState(s);
  };

  const info = useMemo(() => computeMatches(value, cursor), [value, cursor]);
  const matches = info.matches;
  const selClamped = matches.length ? Math.min(selected, matches.length - 1) : 0;

  const reset = () => {
    setValue("");
    setCursor(0);
    setSelected(0);
    histPos.current = 0;
    savedDraft.current = "";
  };

  const setLine = (v: string) => {
    setValue(v);
    setCursor(v.length);
    setSelected(0);
  };

  // Step through input history (dir -1 = older, +1 = newer).
  const stepHistory = (dir: -1 | 1) => {
    if (history.length === 0) return;
    if (dir === -1) {
      if (histPos.current === 0) savedDraft.current = valueRef.current;
      if (histPos.current >= history.length) return;
      histPos.current += 1;
      setLine(history[history.length - histPos.current]!);
    } else {
      if (histPos.current === 0) return;
      histPos.current -= 1;
      setLine(histPos.current === 0 ? savedDraft.current : history[history.length - histPos.current]!);
    }
  };

  // Returns the completed value (token replaced) and whether it still needs an arg.
  const applyCompletion = (): { value: string; needsArg: boolean } | null => {
    const v = valueRef.current;
    const m = computeMatches(v, cursorRef.current);
    if (m.matches.length === 0) return null;
    const item = m.matches[Math.min(selRef.current, m.matches.length - 1)]!;
    const needsArg = item === "/use" || item === "/clear-skill" || item === "/save";
    const insert = needsArg ? `${item} ` : item;
    return { value: v.slice(0, m.start) + insert + v.slice(m.end), needsArg };
  };

  const onTab = () => {
    const done = applyCompletion();
    if (!done) return;
    setValue(done.value);
    setCursor(done.value.length);
    setSelected(0);
  };

  const onEnter = () => {
    const done = applyCompletion();
    if (done && done.needsArg) {
      // Complete the command, then wait for its argument.
      setValue(done.value);
      setCursor(done.value.length);
      setSelected(0);
      return;
    }
    const toSend = done ? done.value : valueRef.current;
    reset();
    onSubmit(toSend);
  };

  useInput((input, key) => {
    // Scrolling (Shift+arrows / PageUp-Dn) is owned by the App.
    if (key.pageUp || key.pageDown || (key.shift && (key.upArrow || key.downArrow))) return;
    if (key.return) return onEnter();
    if (key.tab) return onTab();
    // ↑/↓ navigate the suggestion menu when it's open, otherwise input history.
    const browsing = histPos.current > 0;
    if (key.upArrow) {
      if (matches.length && !browsing) setSelected((selRef.current - 1 + matches.length) % matches.length);
      else stepHistory(-1);
      return;
    }
    if (key.downArrow) {
      if (matches.length && !browsing) setSelected((selRef.current + 1) % matches.length);
      else stepHistory(1);
      return;
    }
    if (key.leftArrow) return setCursor(Math.max(0, cursorRef.current - 1));
    if (key.rightArrow) return setCursor(Math.min(valueRef.current.length, cursorRef.current + 1));
    if (key.backspace || key.delete) {
      const c = cursorRef.current;
      if (c > 0) {
        const v = valueRef.current;
        setValue(v.slice(0, c - 1) + v.slice(c));
        setCursor(c - 1);
        setSelected(0);
        histPos.current = 0;
      }
      return;
    }
    // Esc (quit) and Ctrl shortcuts are handled by the App-level handler.
    if (key.escape || key.meta || key.ctrl) return;

    const text = input.replace(/[\r\n]/g, "");
    if (text.length > 0) {
      const v = valueRef.current;
      const c = cursorRef.current;
      setValue(v.slice(0, c) + text + v.slice(c));
      setCursor(c + text.length);
      setSelected(0);
      histPos.current = 0;
    }
  });

  // Inline ghost completion (only when the cursor sits at the end of the line).
  const atEnd = cursor === value.length;
  const sel = matches.length ? matches[selClamped]! : "";
  const ghost =
    atEnd && sel && sel.toLowerCase().startsWith(info.token.toLowerCase()) && sel.length > info.token.length
      ? sel.slice(info.token.length)
      : "";

  // Highlight only recognized /command tokens (anywhere in the line) in cyan;
  // everything else keeps the default color. `runs` slices [from,to) so the
  // cursor/ghost overlays still fit between runs.
  const cyan = useMemo(() => commandHighlightSet(value), [value]);
  const runs = (from: number, to: number) => highlightRuns(value, cyan, from, to);

  let line: React.ReactNode;
  if (value === "") {
    line = (
      <Text>
        <Text color="cyan">» </Text>
        <Text inverse> </Text>
        <Text dimColor>{PLACEHOLDER}</Text>
      </Text>
    );
  } else if (atEnd && ghost) {
    line = (
      <Text>
        <Text color="cyan">» </Text>
        {runs(0, value.length)}
        <Text inverse dimColor>
          {ghost[0]}
        </Text>
        <Text dimColor>{ghost.slice(1)}</Text>
      </Text>
    );
  } else {
    const at = value[cursor] ?? " ";
    line = (
      <Text>
        <Text color="cyan">» </Text>
        {runs(0, cursor)}
        <Text inverse color={cyan.has(cursor) ? "cyan" : undefined}>{at}</Text>
        {runs(cursor + 1, value.length)}
      </Text>
    );
  }

  // Carousel: a MENU_LIMIT-sized window that scrolls to keep the highlighted row
  // visible (the selection is centered, clamped to the list ends), with ↑/↓ hints
  // for the hidden remainder.
  const menuTotal = matches.length;
  const menuStart =
    menuTotal > MENU_LIMIT
      ? Math.max(0, Math.min(selClamped - Math.floor(MENU_LIMIT / 2), menuTotal - MENU_LIMIT))
      : 0;
  const menuEnd = Math.min(menuTotal, menuStart + MENU_LIMIT);
  const menuWindow = matches.slice(menuStart, menuEnd);

  return (
    <Box flexDirection="column">
      {value === "" ? (
        <Box width={columns} paddingX={1} justifyContent="space-between">
          <Text dimColor>
            type <Text color="cyan">/</Text> for commands
          </Text>
          <Text dimColor wrap="truncate-end">Tab completes · Enter sends · Shift+↑/↓ scroll</Text>
        </Box>
      ) : null}

      <Box borderStyle="round" borderColor="blue" paddingX={1}>
        {line}
      </Box>

      {value !== "" && matches.length > 0 ? (
        <Box flexDirection="column" paddingX={1}>
          {menuStart > 0 ? <Text dimColor>{`  ↑ ${menuStart} more`}</Text> : null}
          {menuWindow.map((m, i) => {
            const isSel = menuStart + i === selClamped;
            const desc = describeItem(m);
            return (
              <Text key={m}>
                {isSel ? (
                  <Text color="black" backgroundColor="cyan">{` ${m} `}</Text>
                ) : (
                  <Text color="cyan">{` ${m} `}</Text>
                )}
                {desc ? <Text dimColor>{`  ${desc}`}</Text> : null}
              </Text>
            );
          })}
          {menuEnd < menuTotal ? <Text dimColor>{`  ↓ ${menuTotal - menuEnd} more`}</Text> : null}
        </Box>
      ) : null}
    </Box>
  );
}

/** Interactive `/skills` picker — ↑/↓ navigate, Enter suggests, Esc cancels. */
function SkillsMenu({ onPick, onCancel }: { onPick: (name: string) => void; onCancel: () => void }) {
  const [idx, setIdxState] = useState(0);
  const idxRef = useRef(0);
  const setIdx = (i: number) => {
    idxRef.current = i;
    setIdxState(i);
  };

  useInput((_input, key) => {
    if (key.escape) return onCancel();
    if (skills.length === 0) {
      if (key.return) onCancel();
      return;
    }
    if (key.upArrow) return setIdx((idxRef.current - 1 + skills.length) % skills.length);
    if (key.downArrow) return setIdx((idxRef.current + 1) % skills.length);
    if (key.return) return onPick(skills[idxRef.current]!.name);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        skills · ↑/↓ select · Enter suggest · Esc cancel
      </Text>
      {skills.length === 0 ? (
        <Text dimColor>(no skills loaded)</Text>
      ) : (
        <Text dimColor>{`  ${SKILL_HEAD}`}</Text>
      )}
      {skills.length === 0
        ? null
        : skills.map((s, i) =>
          i === idx ? (
            <Text key={s.name} color="black" backgroundColor="cyan">{`▸ ${skillRow(s)} `}</Text>
          ) : (
            <Text key={s.name}>{`  ${skillRow(s)}`}</Text>
          ),
        )}
    </Box>
  );
}

type OverlayKind = "help" | "usage" | "context" | "resume";

/** A modal info panel for /help — scrollable with ↑/↓ · PageUp/Dn, dismissed
 *  with Esc / Enter / q. (/usage, /context, /resume have dedicated panels.) */
function InfoPanel({ rows, onClose }: { rows: number; onClose: () => void }) {
  const lines = helpText().split("\n");
  const maxVisible = Math.max(3, Math.min(lines.length, rows - 11));
  const maxOff = Math.max(0, lines.length - maxVisible);

  const [off, setOffState] = useState(0);
  const offRef = useRef(0);
  const setOff = (n: number) => {
    const c = Math.max(0, Math.min(maxOff, n));
    offRef.current = c;
    setOffState(c);
  };

  useInput((input, key) => {
    if (key.escape || key.return || input === "q") return onClose();
    if (key.upArrow) return setOff(offRef.current - 1);
    if (key.downArrow) return setOff(offRef.current + 1);
    if (key.pageUp) return setOff(offRef.current - maxVisible);
    if (key.pageDown) return setOff(offRef.current + maxVisible);
  });

  const start = Math.min(off, maxOff);
  const visible = lines.slice(start, start + maxVisible);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{`help · commands · ↑/↓ scroll · Esc close`}</Text>
      {visible.map((l, i) => (
        <Text key={i}>{l || " "}</Text>
      ))}
      {lines.length > maxVisible ? (
        <Text dimColor>{`  ${start + 1}–${start + visible.length} of ${lines.length}`}</Text>
      ) : null}
    </Box>
  );
}

const clampN = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

interface ChartCell {
  ch: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
}

/** The three plotted token series for one usage record. `total` is the full
 *  input (context) size that turn — the envelope eviction shrinks. */
function seriesOf(u: UsageRecord): { cached: number; fresh: number; total: number } {
  const cached = u.cacheReadTokens;
  const fresh = u.cacheCreationTokens;
  return { cached, fresh, total: cached + fresh + u.inputTokens };
}

const USAGE_SERIES: { key: "total" | "cached" | "fresh"; color: string; label: string }[] = [
  { key: "total", color: "white", label: "total" },
  { key: "cached", color: "blue", label: "cached" },
  { key: "fresh", color: FRESH_GREEN, label: "fresh" },
];

/** /usage — a left detail pane for the selected turn + a right token-vs-turn
 *  chart (total/cached/fresh markers, a cursor column). ↑/↓ (or ←/→) move the
 *  cursor between turns; Esc / Enter / q close. */
function UsagePanel({
  agent,
  width,
  rows,
  onClose,
}: {
  agent: SkillAgent;
  width: number;
  rows: number;
  onClose: () => void;
}) {
  const log = agent.usageLog;
  const n = log.length;
  const [cur, setCurState] = useState(Math.max(0, n - 1));
  const curRef = useRef(cur);
  const setCur = (i: number) => {
    const c = clampN(0, Math.max(0, n - 1), i);
    curRef.current = c;
    setCurState(c);
  };

  useInput((input, key) => {
    if (key.escape || key.return || input === "q") return onClose();
    if (key.upArrow || key.leftArrow) return setCur(curRef.current - 1);
    if (key.downArrow || key.rightArrow) return setCur(curRef.current + 1);
  });

  if (n === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>usage · per-turn cache · Esc close</Text>
        <Text dimColor>(no usage recorded yet — send a message first)</Text>
      </Box>
    );
  }

  const inner = Math.max(28, width - 4);
  const DETAIL_W = 22;
  const Y_LABEL_W = 5;
  const GAP = 2;
  const chartW = Math.max(14, inner - DETAIL_W - GAP);
  const plotCols = Math.max(6, chartW - Y_LABEL_W - 1);
  const H = clampN(7, 14, rows - 13);

  // Window the turns so the latest fit, keeping the cursor in view. We can show
  // up to `plotCols` turns; with fewer, they spread across the full plot width.
  const visibleCount = Math.min(n, plotCols);
  let w0 = n - visibleCount;
  if (cur < w0) w0 = cur;
  if (cur >= w0 + visibleCount) w0 = cur - visibleCount + 1;
  w0 = Math.max(0, w0);

  const vis = log.slice(w0, w0 + visibleCount).map(seriesOf);
  const maxVal = Math.max(1, ...vis.map((p) => p.total));
  const rowOf = (v: number) => clampN(0, H - 1, Math.round((1 - v / maxVal) * (H - 1)));
  // Spread the visible turns evenly across the FULL plot width.
  const xOf = (j: number) =>
    visibleCount <= 1 ? Math.floor(plotCols / 2) : Math.round((j * (plotCols - 1)) / (visibleCount - 1));
  const cursorX = xOf(cur - w0);

  // Turns where an eviction settled — the request that paid the reprocess. Its
  // `freed` tokens are why total context drops and `fresh` spikes here, so mark
  // the column with a scissor + a faint red guide.
  const evictXs = new Set<number>();
  for (let j = 0; j < visibleCount; j++) {
    if ((log[w0 + j]?.appliedEdits?.tokensFreed ?? 0) > 0) evictXs.add(xOf(j));
  }

  // Build the H×plotCols grid (top row = maxVal, bottom = 0). Lines & points go
  // down first; the eviction + cursor guides then fill only BLANK cells, so the
  // data stays intact.
  const grid: ChartCell[][] = Array.from({ length: H }, () =>
    Array.from({ length: plotCols }, () => ({ ch: " " } as ChartCell)),
  );
  // 1) Dotted connectors between consecutive turns, per series — a line feel.
  for (const ser of USAGE_SERIES) {
    for (let j = 0; j < visibleCount - 1; j++) {
      const x0 = xOf(j);
      const x1 = xOf(j + 1);
      const r0 = rowOf(vis[j]![ser.key]);
      const r1 = rowOf(vis[j + 1]![ser.key]);
      for (let x = x0; x <= x1; x++) {
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        const r = Math.round(r0 + (r1 - r0) * t);
        if (grid[r]![x]!.ch === " ") grid[r]![x] = { ch: "·", color: ser.color, dim: true };
      }
    }
  }
  // 2) Markers on top of the lines.
  vis.forEach((p, j) => {
    const x = xOf(j);
    const isCur = j === cur - w0;
    for (const ser of USAGE_SERIES) {
      grid[rowOf(p[ser.key])]![x] = { ch: "●", color: ser.color, bold: isCur };
    }
  });
  // 3) Eviction guides (red), then the cursor guide (gray) — blank cells only.
  for (const x of evictXs) {
    for (let r = 0; r < H; r++) if (grid[r]![x]!.ch === " ") grid[r]![x] = { ch: "╎", color: "red", dim: true };
  }
  for (let r = 0; r < H; r++) {
    if (grid[r]![cursorX]!.ch === " ") grid[r]![cursorX] = { ch: "┊", color: "gray", dim: true };
  }

  // Axis: scissors flag the eviction turns; the arrow tracks the cursor turn.
  const baseCells: ChartCell[] = Array.from({ length: plotCols }, () => ({ ch: "─", dim: true }));
  for (const x of evictXs) baseCells[x] = { ch: "✂", color: "red" };

  // Selected-turn detail.
  const u = log[cur]!;
  const p = seriesOf(u);
  const freed = u.appliedEdits?.tokensFreed ?? 0;
  const reproc = u.appliedEdits?.tokensReprocessed ?? 0;
  const detail: { label: string; value: string; color: string }[] = [
    { label: "cached", value: fmtInt(p.cached), color: "blue" },
    { label: "fresh", value: fmtInt(p.fresh), color: FRESH_GREEN },
    { label: "freed", value: freed ? fmtInt(freed) : "—", color: "magenta" },
    { label: "total", value: fmtInt(p.total), color: "white" },
    { label: "in/out", value: `${fmtInt(u.inputTokens)}/${fmtInt(u.outputTokens)}`, color: "gray" },
  ];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{`usage · per-turn cache · ↑/↓ select turn · Esc close`}</Text>
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width={DETAIL_W}>
          <Text>
            <Text bold>{`turn ${cur + 1}`}</Text>
            <Text dimColor>{`/${n}`}</Text>
            <Text dimColor>{`  step ${u.step}`}</Text>
          </Text>
          {detail.map((d) => (
            <Text key={d.label}>
              <Text color={d.color}>{d.label.padEnd(7)}</Text>
              <Text>{d.value}</Text>
            </Text>
          ))}
          {reproc ? <Text dimColor>{`reproc  ${fmtInt(reproc)}`}</Text> : null}
        </Box>
        <Box flexDirection="column" marginLeft={GAP}>
          {grid.map((rowCells, r) => (
            <Text key={r}>
              <Text dimColor>
                {(r === 0 ? tokenLabel(maxVal) : r === H - 1 ? "0" : "").padStart(Y_LABEL_W)}
              </Text>
              <Text dimColor>│</Text>
              {rowCells.map((c, j) => (
                <Text key={j} color={c.color} dimColor={c.dim} bold={c.bold}>
                  {c.ch}
                </Text>
              ))}
            </Text>
          ))}
          <Text>
            <Text dimColor>{`${" ".repeat(Y_LABEL_W)}└`}</Text>
            {baseCells.map((cc, x) => (
              <Text key={x} color={cc.color} dimColor={cc.dim}>
                {cc.ch}
              </Text>
            ))}
          </Text>
          <Text>
            <Text>{" ".repeat(Y_LABEL_W + 1 + Math.max(0, cursorX))}</Text>
            <Text color="magenta">▲</Text>
          </Text>
        </Box>
      </Box>
      <Text>
        {USAGE_SERIES.map((ser, i) => (
          <Text key={ser.key}>
            {i > 0 ? "  " : ""}
            <Text color={ser.color}>●</Text>
            <Text dimColor>{` ${ser.label}`}</Text>
          </Text>
        ))}
        <Text>{"  "}</Text>
        <Text color="red">✂</Text>
        <Text dimColor> evicted</Text>
        <Text dimColor>{`   x: turns ${w0 + 1}–${w0 + visibleCount} · y: tokens`}</Text>
      </Text>
    </Box>
  );
}

const CTX_BUCKETS: { key: StackItem["kind"]; label: string; color: string }[] = [
  { key: "system", label: "system", color: "magenta" },
  { key: "skill", label: "skills", color: "yellow" },
  { key: "user", label: "you", color: "blue" },
  { key: "ai", label: "AI", color: "green" },
];

/** /context — one proportional bar of the live window's token share by message
 *  kind, plus a per-kind legend with absolute tokens + %. Esc / Enter / q close. */
function ContextPanel({
  agent,
  width,
  onClose,
}: {
  agent: SkillAgent;
  width: number;
  onClose: () => void;
}) {
  useInput((input, key) => {
    if (key.escape || key.return || input === "q") return onClose();
  });

  const items = agent.contextStack().items;
  const totals = CTX_BUCKETS.map((b) => ({
    ...b,
    tokens: items.filter((it) => it.kind === b.key).reduce((a, it) => a + it.tokens, 0),
  }));
  const grand = Math.max(1, totals.reduce((a, t) => a + t.tokens, 0));
  const msgCount = agent.contextStats().messageCount;

  // Largest-remainder apportionment so the bar fills exactly `barW` cells.
  const barW = Math.max(20, width - 4);
  const raw = totals.map((t) => (t.tokens / grand) * barW);
  const cells = raw.map((v) => Math.floor(v));
  let used = cells.reduce((a, c) => a + c, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; used < barW && k < order.length; k++, used++) cells[order[k]!.i]!++;
  // Any non-zero bucket gets at least one cell (borrow from the widest).
  totals.forEach((t, i) => {
    if (t.tokens > 0 && cells[i] === 0) {
      const big = cells.indexOf(Math.max(...cells));
      if (cells[big]! > 1) {
        cells[big]!--;
        cells[i]!++;
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>context · token share by kind · Esc close</Text>
      <Box marginTop={1}>
        <Text>
          {totals.map((t, i) => (
            <Text key={t.key} backgroundColor={t.color}>
              {" ".repeat(cells[i]!)}
            </Text>
          ))}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {totals.map((t) => (
          <Text key={t.key}>
            <Text color={t.color}>■ </Text>
            <Text>{t.label.padEnd(8)}</Text>
            <Text>{`${fmtInt(t.tokens)} tok`.padEnd(13)}</Text>
            <Text dimColor>{`${Math.round((t.tokens / grand) * 100)}%`}</Text>
          </Text>
        ))}
      </Box>
      <Text dimColor>{`  total ~${fmtInt(grand)} tok · ${msgCount} messages`}</Text>
    </Box>
  );
}

/** /resume — pick a saved conversation to reopen. ↑/↓ navigate, Enter loads,
 *  Esc / q cancel. Rows are newest-first: title · turns · model · when. */
function ResumePanel({
  onPick,
  onClose,
}: {
  onPick: (conv: SavedConversation) => void;
  onClose: () => void;
}) {
  const convs = useMemo(() => listConversations(), []);
  const [idx, setIdxState] = useState(0);
  const idxRef = useRef(0);
  const setIdx = (i: number) => {
    idxRef.current = i;
    setIdxState(i);
  };

  useInput((input, key) => {
    if (key.escape || input === "q") return onClose();
    if (convs.length === 0) {
      if (key.return) onClose();
      return;
    }
    if (key.upArrow) return setIdx((idxRef.current - 1 + convs.length) % convs.length);
    if (key.downArrow) return setIdx((idxRef.current + 1) % convs.length);
    if (key.return) return onPick(convs[idxRef.current]!);
  });

  const row = (c: SavedConversation): string => {
    const title = (c.title || "(untitled)").slice(0, 30).padEnd(31);
    const turns = `${turnCount(c)} turn${turnCount(c) === 1 ? "" : "s"}`.padEnd(9);
    const model = (c.model || "—").padEnd(18);
    const when = c.updatedAt.slice(0, 16).replace("T", " ");
    return `${title}${turns}${model}${when}`;
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        resume · ↑/↓ select · Enter open · Esc cancel
      </Text>
      {convs.length === 0 ? (
        <Text dimColor>(no saved conversations yet — send a message, or run `npm run gen:mock`)</Text>
      ) : (
        <Text dimColor>{`  ${"title".padEnd(31)}${"turns".padEnd(9)}${"model".padEnd(18)}updated`}</Text>
      )}
      {convs.map((c, i) =>
        i === idx ? (
          <Text key={c.id} color="black" backgroundColor="cyan">{`▸ ${row(c)} `}</Text>
        ) : (
          <Text key={c.id}>{`  ${row(c)}`}</Text>
        ),
      )}
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();

  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats>(() => ({
    skillCount: skills.length,
    activeSkills: 0,
    ctxTokens: 0,
    msgCount: 0,
    lastRead: 0,
    lastCreation: 0,
    totalFreed: 0,
    items: [],
    cutIndex: null,
    reprocessPending: false,
  }));
  const [busy, setBusy] = useState(false);
  const [picker, setPickerState] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind | null>(null);
  const [escArmed, setEscArmedState] = useState(false);

  // Submitted-input history (oldest first), recalled with ↑/↓ in the input.
  const [history, setHistory] = useState<string[]>([]);

  // Transcript scroll position, in rows from the bottom (0 = pinned to newest).
  const [scrollOffset, setScrollOffsetState] = useState(0);
  const scrollRef = useRef(0);
  const setScroll = (n: number) => {
    scrollRef.current = n;
    setScrollOffsetState(n);
  };

  const pickerRef = useRef(false);
  const setPicker = (v: boolean) => {
    pickerRef.current = v;
    setPickerState(v);
  };

  // Double-Esc to quit.
  const escArmedRef = useRef(false);
  const escTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearEscTimer = () => {
    if (escTimer.current) {
      clearTimeout(escTimer.current);
      escTimer.current = null;
    }
  };
  const disarmEsc = () => {
    if (!escArmedRef.current) return;
    escArmedRef.current = false;
    setEscArmedState(false);
    clearEscTimer();
  };
  const armEsc = () => {
    escArmedRef.current = true;
    setEscArmedState(true);
    clearEscTimer();
    escTimer.current = setTimeout(() => {
      escArmedRef.current = false;
      setEscArmedState(false);
      escTimer.current = null;
    }, 1500);
  };

  // Measured height of the scroll viewport (the only flexible region). Used to
  // render just the tail of the transcript that fits, so the frame never
  // overflows and the fixed header / input never move.
  const viewportRef = useRef<DOMElement | null>(null);
  const [viewportH, setViewportH] = useState(0);
  useEffect(() => {
    if (!viewportRef.current) return;
    const { height } = measureElement(viewportRef.current);
    if (height !== viewportH) setViewportH(height);
  });

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  // Persisted-conversation identity: null until the first real turn, then fixed
  // for the session (or set to a loaded file's id on /resume) so autosave keeps
  // rewriting the same document.
  const convIdRef = useRef<string | null>(null);
  const convCreatedRef = useRef<string>("");

  const onUsageRef = useRef<(u: UsageRecord) => void>(() => {});
  const onAutoEvictRef = useRef<(names: string[], edits: AppliedEdits) => void>(() => {});
  const onSkillInvokeRef = useRef<(name: string) => void>(() => {});

  const agentRef = useRef<SkillAgent | null>(null);
  if (!agentRef.current) {
    agentRef.current = new SkillAgent({
      skills,
      system: SYSTEM_PROMPT,
      // Honor frontmatter triggers — `evict-after: used` clears a fat skill at the
      // end of the turn that consumes it. Eviction is fully deterministic
      // (frontmatter + human /clear-skill); the model has no eviction tool.
      autoTriggers: true,
      thinking: false,
      onUsage: (u) => onUsageRef.current(u),
      onAutoEvict: (names, edits) => onAutoEvictRef.current(names, edits),
      onSkillInvoke: (name) => onSkillInvokeRef.current(name),
    });
  }
  const agent = agentRef.current;

  const push = useCallback((kind: EntryKind, text: string) => {
    setTranscript((prev) => [...prev, { id: nextId(), kind, text }]);
    setScroll(0); // auto-follow: jump to the newest line
  }, []);

  const refreshStats = useCallback(() => {
    setStats(computeStats(agent));
  }, [agent]);

  // Mirror the transcript into a ref so the (memoized) /save handler can read the
  // latest entries without being re-created on every keystroke.
  const transcriptRef = useRef<Entry[]>([]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Per-turn cache usage feeds the live header/bottom counters (and the /usage
  // panel reads agent.usageLog on demand) — no longer printed into the chat.
  onUsageRef.current = () => {
    refreshStats();
  };

  // A deterministic `evict-after: used` eviction (fired at the next turn's
  // start) gets a visible confirmation line so the auto-clear isn't silent.
  onAutoEvictRef.current = (names, edits) => {
    push(
      "usage",
      `auto-cleared ${names.join(", ")} (evict-after: used) · ~${edits.tokensFreed} tok freed · ${edits.tokensReprocessed} reprocessed`,
    );
    refreshStats();
  };

  // The model loaded a skill's full SKILL.md via invoke_skill — announce it like
  // a human injection and refresh so its full-size block appears in the stack.
  onSkillInvokeRef.current = (name) => {
    push("skill", `${skillInvokeText(name)} · by agent`);
    refreshStats();
  };

  // Transcript layout — flatten to rows, then show a window (newest at bottom).
  const lineWidth = Math.max(1, columns - 2);
  const usable = viewportH > 0 ? viewportH : Math.max(1, rows - 6);
  const lines = useMemo(() => flattenTranscript(transcript, lineWidth), [transcript, lineWidth]);
  const maxScroll = Math.max(0, lines.length - usable);
  const scroll = Math.min(scrollOffset, maxScroll);
  const windowStart = Math.max(0, lines.length - usable - scroll);
  const windowLines = lines.slice(windowStart, windowStart + usable);

  // App-level keys: scroll, double-Esc quit, Ctrl+C/D. Inactive while the picker owns input.
  useInput(
    (input, key) => {
      if (key.ctrl && (input === "c" || input === "d")) {
        clearEscTimer();
        exit();
        return;
      }
      if (key.shift && key.upArrow) return setScroll(Math.min(maxScroll, scrollRef.current + 1));
      if (key.shift && key.downArrow) return setScroll(Math.max(0, scrollRef.current - 1));
      if (key.pageUp) return setScroll(Math.min(maxScroll, scrollRef.current + usable));
      if (key.pageDown) return setScroll(Math.max(0, scrollRef.current - usable));
      if (key.escape) {
        // First Esc backs out of scrolling (jump to newest); only then arm quit.
        if (scrollRef.current > 0) {
          setScroll(0);
        } else if (escArmedRef.current) {
          clearEscTimer();
          exit();
        } else {
          armEsc();
        }
        return;
      }
      disarmEsc();
    },
    { isActive: !picker && !overlay },
  );

  const runSlash = useCallback(
    (raw: string): boolean => {
      const withoutSlash = raw.slice(1).trim();
      const [cmd, ...rest] = withoutSlash.split(/\s+/);

      if (!KNOWN_COMMANDS.has(cmd!)) {
        if (skills.some((s) => s.name === cmd)) {
          const r = agent.suggestSkill(cmd!);
          if (r.ok) push("skill", skillSuggestText(cmd!));
          else push("system", r.message);
        } else {
          push("system", `unknown command "${raw}" — try /help`);
        }
        return false;
      }

      switch (cmd) {
        case "help":
          setOverlay("help");
          break;
        case "skills":
          setPicker(true);
          break;
        case "use": {
          const name = rest[0];
          if (!name) {
            push("system", "usage: /use <skill-name>");
            break;
          }
          const r = agent.suggestSkill(name);
          if (r.ok) push("skill", skillSuggestText(name));
          else push("system", r.message);
          break;
        }
        case "clear-skill": {
          const name = rest.find((t) => !t.startsWith("--"));
          const force = rest.includes("--force");
          if (!name) {
            push("system", "usage: /clear-skill <skill-name> [--force]");
            break;
          }
          const res = agent.clearSkill(name, { force });
          push("system", res.message);
          if (res.appliedEdits) {
            const e = res.appliedEdits;
            push("usage", `evicted=${e.skillsEvicted} freed≈${e.tokensFreed} reprocess≈${e.tokensReprocessed}`);
          }
          break;
        }
        case "usage":
          setOverlay("usage");
          break;
        case "context":
          setOverlay("context");
          break;
        case "save": {
          const t = transcriptRef.current;
          if (!t.some((e) => e.kind === "user" || e.kind === "assistant")) {
            push("system", "nothing to save yet — send a message first.");
            break;
          }
          const name = rest.join(" ").trim();
          if (name) {
            convIdRef.current = slugify(name);
            convCreatedRef.current ||= new Date().toISOString();
          }
          const id = convIdRef.current;
          if (!id) {
            push("system", "usage: /save <name>");
            break;
          }
          convCreatedRef.current ||= new Date().toISOString();
          const firstUser = t.find((e) => e.kind === "user");
          saveConversation({
            version: 1,
            id,
            title: name || firstUser?.text?.slice(0, 60) || "conversation",
            model: MODEL,
            createdAt: convCreatedRef.current,
            updatedAt: new Date().toISOString(),
            transcript: t,
            agent: agent.snapshot(),
          });
          push(
            "system",
            `saved as "${id}" (${t.filter((e) => e.kind === "user").length} turns) — reopen with /resume.`,
          );
          break;
        }
        case "resume":
          setOverlay("resume");
          break;
        case "quit":
        case "exit":
          return true;
      }
      return false;
    },
    [agent, push],
  );

  const onSubmit = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;

      // Record in history (skip consecutive duplicates).
      setHistory((prev) => (prev[prev.length - 1] === value ? prev : [...prev, value]));

      if (value.startsWith("/")) {
        if (runSlash(value)) {
          clearEscTimer();
          exit();
        } else {
          refreshStats();
        }
        return;
      }

      // Agent turn. A /skill-name mentioned in the message is injected first.
      push("user", value);
      const seen = new Set<string>();
      for (const tok of value.split(/\s+/)) {
        if (!tok.startsWith("/")) continue;
        const name = tok.slice(1);
        if (skills.some((s) => s.name === name) && !seen.has(name)) {
          seen.add(name);
          const r = agent.suggestSkill(name);
          if (r.ok) push("skill", skillSuggestText(name, true));
          else push("system", r.message);
        }
      }

      setBusy(true);

      // The assistant entry is created lazily on the first text delta, so any
      // mid-turn skill-invocation / tool lines land ABOVE the answer, not below.
      let assistantId: number | null = null;
      const writeAssistant = (text: string) => {
        if (assistantId === null) {
          const id = (assistantId = nextId());
          setTranscript((prev) => [...prev, { id, kind: "assistant", text }]);
        } else {
          const id = assistantId;
          setTranscript((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
        }
        setScroll(0);
      };

      void (async () => {
        const pending = agent.send(value, { onDelta: writeAssistant });
        refreshStats(); // the user message (+ any mentioned skills) are in context now
        try {
          const { text } = await pending;
          writeAssistant(text || "(no response)");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (assistantId !== null) {
            const id = assistantId;
            setTranscript((prev) => prev.filter((e) => e.id !== id));
          }
          push("error", `API error: ${msg}\n  hint: set ANTHROPIC_API_KEY in .env or the environment.`);
        } finally {
          refreshStats();
          setBusy(false);
        }
      })();
    },
    [agent, exit, push, refreshStats, runSlash],
  );

  const pickSkill = useCallback(
    (name: string) => {
      setPicker(false);
      const r = agent.suggestSkill(name);
      if (r.ok) push("skill", skillSuggestText(name));
      else push("system", r.message);
      refreshStats();
    },
    [agent, push, refreshStats],
  );

  // Reopen a saved conversation: rehydrate the agent and redraw the transcript.
  const resumeConversation = useCallback(
    (conv: SavedConversation) => {
      agent.restore(conv.agent);
      // Continue ids past the loaded transcript so new entries don't collide.
      idRef.current = conv.transcript.reduce((m, e) => Math.max(m, e.id), 0);
      convIdRef.current = conv.id;
      convCreatedRef.current = conv.createdAt;
      setTranscript(conv.transcript);
      setScroll(0);
      setOverlay(null);
      refreshStats();
    },
    [agent, refreshStats],
  );

  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Header stats={stats} streaming={busy} width={columns} />

      {/* Model badge — rounded orange box (like the header/input), pinned right. */}
      <Box width={columns} flexShrink={0} paddingX={1} justifyContent="flex-end">
        <Box borderStyle="round" borderColor={ORANGE} paddingX={1}>
          <Text color={ORANGE} bold>{MODEL}</Text>
        </Box>
      </Box>

      {/* Scroll viewport — the only flexible region; clips overflow. */}
      <Box ref={viewportRef} flexGrow={1} flexDirection="column" justifyContent="flex-end" overflow="hidden" paddingX={1}>
        {windowLines.map((line) => (
          <VisualLineView key={line.key} line={line} width={lineWidth} />
        ))}
      </Box>

      {/* Breathing room before the input — doubles as the scroll indicator. */}
      <Box flexShrink={0} height={1} paddingX={1}>
        {scroll > 0 ? (
          <Text dimColor>
            {`▲ ${scroll} line${scroll === 1 ? "" : "s"} up — Shift+↑/↓ scroll · Esc to newest`}
          </Text>
        ) : null}
      </Box>

      {/* Fixed bottom region: never shrinks. */}
      <Box flexShrink={0} flexDirection="column">
        {escArmed && !picker ? (
          <Box paddingX={1}>
            <Text color="yellow">press Esc again to quit</Text>
          </Box>
        ) : null}

        {picker ? (
          <SkillsMenu onPick={pickSkill} onCancel={() => setPicker(false)} />
        ) : overlay === "usage" ? (
          <UsagePanel agent={agent} width={columns} rows={rows} onClose={() => setOverlay(null)} />
        ) : overlay === "context" ? (
          <ContextPanel agent={agent} width={columns} onClose={() => setOverlay(null)} />
        ) : overlay === "resume" ? (
          <ResumePanel onPick={resumeConversation} onClose={() => setOverlay(null)} />
        ) : overlay ? (
          <InfoPanel rows={rows} onClose={() => setOverlay(null)} />
        ) : busy ? (
          <Box borderStyle="round" borderColor="gray" paddingX={1}>
            <Spinner label="thinking…" />
          </Box>
        ) : (
          <CommandInput onSubmit={onSubmit} history={history} />
        )}

        {/* Live context / cache counters — bottom status line. */}
        <Counters stats={stats} width={columns} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry point — alternate screen buffer in, Ink render, restore on exit.
// ---------------------------------------------------------------------------

function nonInteractiveBanner(): void {
  console.log("=== ephemeral_skills showcase (non-interactive) ===");
  console.log("Skill directory:", skillsDir);
  console.log(`${skills.length} skill(s): ${skillNames.join(", ") || "(none)"}`);
  console.log();
  console.log(skillsTableText(skills));
  console.log();
  console.log("Run in an interactive terminal (npm start) for the TUI.");
}

async function main(): Promise<void> {
  // Ink needs a TTY with raw-mode input. Piped/redirected stdio (CI, smoke
  // tests) can't drive the UI, so fall back to a plain banner.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    nonInteractiveBanner();
    return;
  }

  const leaveAlt = () => process.stdout.write("\x1b[?1049l");
  process.stdout.write("\x1b[?1049h\x1b[H");
  const { waitUntilExit } = render(<App />);
  try {
    await waitUntilExit();
  } finally {
    leaveAlt();
  }
}

main().catch((err) => {
  process.stdout.write("\x1b[?1049l");
  console.error("Fatal:", err);
  process.exit(1);
});
