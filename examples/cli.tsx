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
 * Its only job is to make eviction legible: watch a fat skill enter context, get
 * used, then get evicted, and the per-turn cache_read meter drop. The same slash
 * commands drive deterministic injection / eviction; any other input is a normal
 * agent turn. A `/skill-name` mentioned inside an agent turn is injected for that
 * turn (mention → inject), so skills can be invoked mid-sentence.
 *
 * Run with:  npm start   (or: tsx examples/cli.tsx)
 * Requires:  ANTHROPIC_API_KEY for agent.send() — put it in .env (auto-loaded) or
 *            the environment. Every slash command works without a credential.
 */

import "dotenv/config";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Text, measureElement, useApp, useInput, useWindowSize, type DOMElement } from "ink";
import { Spinner } from "@inkjs/ui";
import { fileURLToPath } from "node:url";
import {
  SkillAgent,
  loadSkills,
  type LoadedSkill,
  type UsageRecord,
} from "../src/index";

// ---------------------------------------------------------------------------
// Skill discovery (relative to this file) + shared agent config.
// ---------------------------------------------------------------------------
const skillsDir = fileURLToPath(new URL("../skills", import.meta.url));
const skills = loadSkills(skillsDir);
const skillNames = skills.map((s) => s.name);

const SYSTEM_PROMPT =
  "You are a helpful coding assistant. " +
  "When a skill is injected into context it appears as a <skill> block. " +
  "Read and apply it. " +
  "Once you are done with an ephemeral skill you may call the clear_skill tool to free context tokens.";

const KNOWN_COMMANDS = new Set([
  "help",
  "skills",
  "use",
  "clear-skill",
  "usage",
  "context",
  "quit",
  "exit",
]);

// Single-token commands offered by autocomplete (mid-sentence aware).
const COMMAND_TOKENS = [
  "/help",
  "/skills",
  "/usage",
  "/context",
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
  "/use": "inject a skill",
  "/clear-skill": "evict a skill",
  "/quit": "quit",
  "/exit": "quit",
};

const MENU_LIMIT = 5;
const PLACEHOLDER = "message, or /command  ·  Tab completes · Enter sends";

// ---------------------------------------------------------------------------
// Transcript model
// ---------------------------------------------------------------------------
type EntryKind = "user" | "assistant" | "system" | "usage" | "error";
interface Entry {
  id: number;
  kind: EntryKind;
  text: string;
}

interface Stats {
  skillCount: number;
  activeSkills: number;
  ctxTokens: number;
  msgCount: number;
  lastRead: number;
  lastCreation: number;
  totalFreed: number;
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

const ASSIST_PREFIX = "assistant ⟩ ";

/** Plain text an entry renders as (before wrapping). */
function entryText(entry: Entry): string {
  if (entry.kind === "user") return `» ${entry.text}`;
  if (entry.kind === "assistant") return `${ASSIST_PREFIX}${entry.text}`;
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

/** One rendered terminal row of the transcript. */
interface VisualLine {
  key: string;
  kind: EntryKind | "gap";
  text: string;
  first: boolean;
}

/** Flatten the transcript into styled rows, with a blank line between entries. */
function flattenTranscript(transcript: Entry[], width: number): VisualLine[] {
  const out: VisualLine[] = [];
  transcript.forEach((entry, ei) => {
    if (ei > 0) out.push({ key: `gap-${entry.id}`, kind: "gap", text: "", first: false });
    wrapText(entryText(entry), width).forEach((text, li) => {
      out.push({ key: `${entry.id}-${li}`, kind: entry.kind, text, first: li === 0 });
    });
  });
  return out;
}

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
    "  /use <name>  ·  /<name>        inject a skill into context",
    "  /clear-skill <name> [--force]  evict a skill from context",
    "  /usage                         per-turn cache usage log",
    "  /context                       current context stats",
    "  /quit  ·  /exit                quit  (also Esc Esc, Ctrl+C / Ctrl+D)",
    "",
    "Any other input is an agent turn. A /skill-name mentioned in it is injected",
    "for that turn (needs ANTHROPIC_API_KEY).",
  ].join("\n");
}

function skillsTableText(list: LoadedSkill[]): string {
  if (list.length === 0) return "(no skills loaded)";
  const head = "name".padEnd(22) + "ephemeral".padEnd(11) + "tokenLen".padEnd(12) + "evictAfter";
  return [head, "-".repeat(58), ...list.map(skillRow)].join("\n");
}

function formatUsage(u: UsageRecord): string {
  let line =
    `[${u.step}] read=${u.cacheReadTokens} create=${u.cacheCreationTokens}` +
    ` in=${u.inputTokens} out=${u.outputTokens}`;
  if (u.appliedEdits) {
    const e = u.appliedEdits;
    line += ` | evicted=${e.skillsEvicted} freed≈${e.tokensFreed} reprocess≈${e.tokensReprocessed}`;
  }
  return line;
}

function usageLogText(log: UsageRecord[]): string {
  if (log.length === 0) return "(no usage recorded yet — send a message first)";
  return [
    "-- usage panel --",
    ...log.map(formatUsage),
    "hint: after eviction cache_read drops on later turns — that gap is the payoff.",
  ].join("\n");
}

function contextStatsText(agent: SkillAgent): string {
  const stats = agent.contextStats();
  const lines = [`messages: ${stats.messageCount}  estimated_tokens: ${stats.estimatedTokens}`];
  if (stats.skills.length === 0) {
    lines.push("  no skills in context");
  } else {
    lines.push("  " + "skill".padEnd(24) + "ephemeral".padEnd(12) + "evicted".padEnd(10) + "tokenLen");
    for (const sk of stats.skills) {
      lines.push(
        "  " +
          String(sk.name).padEnd(24) +
          String(sk.ephemeral).padEnd(12) +
          String(sk.evicted).padEnd(10) +
          String(sk.tokenLen),
      );
    }
  }
  return lines.join("\n");
}

function computeStats(agent: SkillAgent): Stats {
  const cs = agent.contextStats();
  const log = agent.usageLog;
  const last = log[log.length - 1];
  return {
    skillCount: cs.skills.length,
    activeSkills: cs.skills.filter((s) => !s.evicted).length,
    ctxTokens: cs.estimatedTokens,
    msgCount: cs.messageCount,
    lastRead: last?.cacheReadTokens ?? 0,
    lastCreation: last?.cacheCreationTokens ?? 0,
    totalFreed: log.reduce((a, u) => a + (u.appliedEdits?.tokensFreed ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Header({ stats, width }: { stats: Stats; width: number }) {
  const line =
    `skills ${stats.activeSkills}/${stats.skillCount}` +
    ` · ctx ~${stats.ctxTokens} tok` +
    ` · read ${stats.lastRead}` +
    ` · create ${stats.lastCreation}` +
    ` · freed ${stats.totalFreed}`;
  return (
    <Box
      width={width}
      flexShrink={0}
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="blue">
        ephemeral_skills
      </Text>
      <Text dimColor wrap="truncate-start">
        {line}
      </Text>
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
            base: "whiteBright",
          })}
        </Text>
      );
    }
    case "assistant":
      if (line.first && line.text.startsWith(ASSIST_PREFIX)) {
        return (
          <Text>
            <Text bold color="green">
              {ASSIST_PREFIX}
            </Text>
            {line.text.slice(ASSIST_PREFIX.length) || " "}
          </Text>
        );
      }
      return <Text>{line.text || " "}</Text>;
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
    const needsArg = item === "/use" || item === "/clear-skill";
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

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="blue" paddingX={1}>
        {line}
      </Box>

      {value === "" ? (
        <Box paddingX={1}>
          <Text dimColor>
            type <Text color="cyan">/</Text> for commands · Tab completes · Enter sends · Shift+↑/↓ scroll
          </Text>
        </Box>
      ) : matches.length > 0 ? (
        <Box flexDirection="column" paddingX={1}>
          {matches.slice(0, MENU_LIMIT).map((m, i) => {
            const isSel = i === selClamped;
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
          {matches.length > MENU_LIMIT ? (
            <Text dimColor>{`  …and ${matches.length - MENU_LIMIT} more`}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

/** Interactive `/skills` picker — ↑/↓ navigate, Enter injects, Esc cancels. */
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
        skills · ↑/↓ select · Enter inject · Esc cancel
      </Text>
      {skills.length === 0 ? (
        <Text dimColor>(no skills loaded)</Text>
      ) : (
        skills.map((s, i) =>
          i === idx ? (
            <Text key={s.name} color="black" backgroundColor="cyan">{`▸ ${skillRow(s)} `}</Text>
          ) : (
            <Text key={s.name}>{`  ${skillRow(s)}`}</Text>
          ),
        )
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
  }));
  const [busy, setBusy] = useState(false);
  const [picker, setPickerState] = useState(false);
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
  const onUsageRef = useRef<(u: UsageRecord) => void>(() => {});

  const agentRef = useRef<SkillAgent | null>(null);
  if (!agentRef.current) {
    agentRef.current = new SkillAgent({
      skills,
      system: SYSTEM_PROMPT,
      autoTriggers: false,
      thinking: false,
      onUsage: (u) => onUsageRef.current(u),
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

  onUsageRef.current = (u: UsageRecord) => {
    push("usage", formatUsage(u));
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
    { isActive: !picker },
  );

  const runSlash = useCallback(
    (raw: string): boolean => {
      const withoutSlash = raw.slice(1).trim();
      const [cmd, ...rest] = withoutSlash.split(/\s+/);

      if (!KNOWN_COMMANDS.has(cmd!)) {
        if (skills.some((s) => s.name === cmd)) push("system", agent.injectSkill(cmd!).message);
        else push("system", `unknown command "${raw}" — try /help`);
        return false;
      }

      switch (cmd) {
        case "help":
          push("system", helpText());
          break;
        case "skills":
          setPicker(true);
          break;
        case "use": {
          const name = rest[0];
          push("system", name ? agent.injectSkill(name).message : "usage: /use <skill-name>");
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
          push("usage", usageLogText(agent.usageLog));
          break;
        case "context":
          push("system", contextStatsText(agent));
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
          push("system", `${agent.injectSkill(name).message} (mentioned)`);
        }
      }

      setBusy(true);
      void (async () => {
        try {
          const { text } = await agent.send(value);
          push("assistant", text);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
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
      push("system", agent.injectSkill(name).message);
      refreshStats();
    },
    [agent, push, refreshStats],
  );

  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Header stats={stats} width={columns} />

      {/* Scroll viewport — the only flexible region; clips overflow. */}
      <Box ref={viewportRef} flexGrow={1} flexDirection="column" justifyContent="flex-end" overflow="hidden" paddingX={1}>
        {transcript.length === 0 ? (
          <Text dimColor>
            {`No messages yet. Try  /skills  then  /${skills[0]?.name ?? "use <name>"}  — or just ask a question.`}
          </Text>
        ) : (
          windowLines.map((line) => <VisualLineView key={line.key} line={line} width={lineWidth} />)
        )}
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
        ) : busy ? (
          <Box borderStyle="round" borderColor="gray" paddingX={1}>
            <Spinner label="thinking…" />
          </Box>
        ) : (
          <CommandInput onSubmit={onSubmit} history={history} />
        )}
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
