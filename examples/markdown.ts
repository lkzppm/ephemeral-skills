/**
 * Tiny Markdown → styled-line renderer for the showcase TUI.
 *
 * The transcript window is scrolled by counting *rendered terminal rows*, so a
 * rich renderer can't hand Ink raw multi-line blocks (Ink would re-wrap them and
 * the row count would drift). Instead we pre-wrap everything to `width` and emit
 * one `StyledLine` per terminal row — each a list of styled `Seg`s. The caller
 * renders a row as nested <Text> and the scroll math stays exact.
 *
 * Scope is deliberately small (what Claude actually emits): headings, bold /
 * italic / inline-code / links / strikethrough, fenced code blocks, GFM pipe
 * tables, ordered + unordered lists, blockquotes, and horizontal rules. It is a
 * presentation helper for examples/ only — not part of the pure core.
 */

export interface Seg {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
  color?: string;
  bg?: string;
}

export interface StyledLine {
  segs: Seg[];
}

type Style = Omit<Seg, "text">;

// Palette (truecolor; the CLI already relies on hex elsewhere).
const CODE_FG = "#c247fffe";
const CODE_BG = "#23272e";
const INLINE_CODE_FG = "#bd39ff";
const INLINE_CODE_BG = "#33373f";
const LINK_FG = "#61afef";
const H1_FG = "#9833ca";
const H2_FG = "#61afef";
const H3_FG = "#56b6c2";
const TABLE_HEAD_FG = "#61afef";

function mergeStyle(a: Style, b: Style): Style {
  return {
    bold: a.bold || b.bold,
    italic: a.italic || b.italic,
    underline: a.underline || b.underline,
    dim: a.dim || b.dim,
    color: b.color ?? a.color,
    bg: b.bg ?? a.bg,
  };
}

function styleOf(s: Seg): Style {
  const { text: _text, ...style } = s;
  return style;
}

function sameStyle(a: Style, b: Style): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.dim === !!b.dim &&
    (a.color ?? "") === (b.color ?? "") &&
    (a.bg ?? "") === (b.bg ?? "")
  );
}

// --- Inline formatting -------------------------------------------------------

// Earliest-match wins; order only breaks ties at the same index.
const INLINE_TOKENS: { re: RegExp; link?: boolean; style?: Style }[] = [
  { re: /\[([^\]]+)\]\(([^)]+)\)/, link: true },
  { re: /\*\*([^*]+)\*\*/, style: { bold: true } },
  { re: /~~([^~]+)~~/, style: { dim: true } },
  { re: /\*([^*]+)\*/, style: { italic: true } },
];

function parseEmphasis(text: string, base: Style): Seg[] {
  if (!text) return [];
  let best: { idx: number; len: number; inner: string; style: Style } | null = null;
  for (const t of INLINE_TOKENS) {
    const m = t.re.exec(text);
    if (m && (best === null || m.index < best.idx)) {
      const style = t.link ? { color: LINK_FG, underline: true } : t.style!;
      best = { idx: m.index, len: m[0].length, inner: m[1]!, style };
    }
  }
  if (!best) return [{ text, ...base }];
  const out: Seg[] = [];
  if (best.idx > 0) out.push({ text: text.slice(0, best.idx), ...base });
  out.push(...parseEmphasis(best.inner, mergeStyle(base, best.style)));
  out.push(...parseEmphasis(text.slice(best.idx + best.len), base));
  return out;
}

/** Inline-parse a run of text into styled segments (code spans first). */
export function parseInline(text: string, base: Style = {}): Seg[] {
  const out: Seg[] = [];
  const codeRe = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) out.push(...parseEmphasis(text.slice(last, m.index), base));
    out.push({ text: m[1]!, ...mergeStyle(base, { color: INLINE_CODE_FG, bg: INLINE_CODE_BG }) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...parseEmphasis(text.slice(last), base));
  return out.length ? out : [{ text: "", ...base }];
}

// --- Wrapping (style-preserving, breaks on spaces) ---------------------------

interface WrapOpts {
  prefix?: Seg; // marker for the first line (e.g. "• ")
  hang?: number; // indent for continuation lines
}

function emit(chars: { c: string; st: Style }[], lead: Seg | null): StyledLine {
  const segs: Seg[] = [];
  if (lead) segs.push(lead);
  let cur: Seg | null = null;
  for (const ch of chars) {
    if (cur && sameStyle(styleOf(cur), ch.st)) cur.text += ch.c;
    else {
      cur = { text: ch.c, ...ch.st };
      segs.push(cur);
    }
  }
  if (segs.length === 0) segs.push({ text: "" });
  return { segs };
}

function wrapSegs(segs: Seg[], width: number, opts: WrapOpts = {}): StyledLine[] {
  const w = Math.max(1, width);
  const chars: { c: string; st: Style }[] = [];
  for (const s of segs) {
    const st = styleOf(s);
    for (const c of s.text) chars.push({ c, st });
  }

  const prefix = opts.prefix;
  const hang = opts.hang ?? (prefix ? prefix.text.length : 0);
  const lines: StyledLine[] = [];
  let first = true;
  let line: { c: string; st: Style }[] = [];
  let lastSpace = -1;
  const avail = () => Math.max(1, w - (first ? (prefix ? prefix.text.length : 0) : hang));
  const lead = () => (first ? (prefix ?? null) : hang ? { text: " ".repeat(hang) } : null);
  const flush = () => {
    lines.push(emit(line, lead()));
    line = [];
    lastSpace = -1;
    first = false;
  };

  for (const ch of chars) {
    line.push(ch);
    if (ch.c === " ") lastSpace = line.length - 1;
    if (line.length > avail()) {
      if (lastSpace >= 0 && lastSpace < line.length - 1) {
        const carry = line.slice(lastSpace + 1);
        line = line.slice(0, lastSpace); // drop the breaking space
        flush();
        line = carry;
        lastSpace = line.findIndex((x) => x.c === " ");
      } else if (lastSpace === line.length - 1) {
        line = line.slice(0, lastSpace);
        flush();
      } else {
        const a = avail();
        const carry = line.slice(a);
        line = line.slice(0, a);
        flush();
        line = carry;
      }
    }
  }
  flush();
  return lines;
}

// --- Block helpers -----------------------------------------------------------

function chunk(s: string, n: number): string[] {
  if (n <= 0) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [""];
}

function pushHeading(out: StyledLine[], level: number, text: string, width: number): void {
  const color = level <= 1 ? H1_FG : level === 2 ? H2_FG : H3_FG;
  for (const l of wrapSegs(parseInline(text, { bold: true, color }), width)) out.push(l);
}

function pushCodeBlock(out: StyledLine[], code: string[], width: number): void {
  const w = Math.max(2, width);
  for (const raw of code) {
    const line = raw.replace(/\t/g, "  ");
    for (const piece of line.length ? chunk(line, w - 2) : [""]) {
      const padded = (" " + piece).padEnd(w, " ").slice(0, w);
      out.push({ segs: [{ text: padded, color: CODE_FG, bg: CODE_BG }] });
    }
  }
}

function splitRow(s: string): string[] {
  let t = s.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function isDelimiterRow(s: string): boolean {
  if (!/\|/.test(s)) return false;
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(s);
}

function visLen(segs: Seg[]): number {
  return segs.reduce((a, s) => a + s.text.length, 0);
}

function padSegs(segs: Seg[], w: number): Seg[] {
  const len = visLen(segs);
  if (len === w) return segs;
  if (len < w) return [...segs, { text: " ".repeat(w - len) }];
  const out: Seg[] = [];
  let used = 0;
  for (const s of segs) {
    if (used >= w) break;
    const room = w - used;
    if (s.text.length <= room) {
      out.push(s);
      used += s.text.length;
    } else {
      out.push({ ...s, text: s.text.slice(0, room) });
      used = w;
    }
  }
  return out;
}

function shrinkCols(colW: number[], avail: number): void {
  let total = colW.reduce((a, b) => a + b, 0);
  if (total <= avail) return;
  for (let c = 0; c < colW.length; c++) colW[c] = Math.max(3, Math.floor((colW[c]! / total) * avail));
  total = colW.reduce((a, b) => a + b, 0);
  let i = 0;
  let guard = colW.length * 64;
  while (total > avail && colW.some((x) => x > 3) && guard-- > 0) {
    if (colW[i]! > 3) {
      colW[i]!--;
      total--;
    }
    i = (i + 1) % colW.length;
  }
}

function rowToLine(cells: string[], colW: number[], base: Style): StyledLine {
  const segs: Seg[] = [];
  for (let c = 0; c < colW.length; c++) {
    if (c > 0) segs.push({ text: " │ ", dim: true });
    segs.push(...padSegs(parseInline(cells[c] ?? "", base), colW[c]!));
  }
  return { segs };
}

function pushTable(out: StyledLine[], headerLine: string, rowLines: string[], width: number): void {
  const header = splitRow(headerLine);
  const rows = rowLines.map(splitRow);
  const ncol = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const colW = new Array<number>(ncol).fill(0);
  for (const r of [header, ...rows]) {
    for (let c = 0; c < ncol; c++) colW[c] = Math.max(colW[c]!, (r[c] ?? "").length);
  }
  shrinkCols(colW, Math.max(ncol, width - (ncol - 1) * 3));
  out.push(rowToLine(header, colW, { bold: true, color: TABLE_HEAD_FG }));
  out.push({ segs: [{ text: colW.map((w) => "─".repeat(w)).join("─┼─"), dim: true }] });
  for (const r of rows) out.push(rowToLine(r, colW, {}));
}

// --- Top-level renderer ------------------------------------------------------

function isBlank(l: StyledLine): boolean {
  return l.segs.every((s) => s.text.trim() === "");
}

function trimBlank(lines: StyledLine[]): StyledLine[] {
  let a = 0;
  let b = lines.length;
  while (a < b && isBlank(lines[a]!)) a++;
  while (b > a && isBlank(lines[b - 1]!)) b--;
  return lines.slice(a, b);
}

/** Render a Markdown string into pre-wrapped, styled terminal rows. */
export function renderMarkdown(md: string, width: number): StyledLine[] {
  const w = Math.max(8, width);
  const src = md.replace(/\r\n/g, "\n").split("\n");
  const out: StyledLine[] = [];
  const pushBlank = () => {
    if (out.length && !isBlank(out[out.length - 1]!)) out.push({ segs: [{ text: "" }] });
  };

  let i = 0;
  while (i < src.length) {
    const line = src[i]!;

    const fence = /^(\s*)(```|~~~)(.*)$/.exec(line);
    if (fence) {
      i++;
      const code: string[] = [];
      while (i < src.length && !/^(\s*)(```|~~~)\s*$/.test(src[i]!)) code.push(src[i++]!);
      if (i < src.length) i++; // closing fence
      pushCodeBlock(out, code, w);
      continue;
    }

    if (/^\s*$/.test(line)) {
      pushBlank();
      i++;
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      pushHeading(out, h[1]!.length, h[2]!, w);
      i++;
      continue;
    }

    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push({ segs: [{ text: "─".repeat(w), dim: true }] });
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < src.length && isDelimiterRow(src[i + 1]!)) {
      const headerLine = line;
      i += 2; // header + delimiter
      const rows: string[] = [];
      while (i < src.length && src[i]!.includes("|") && !/^\s*$/.test(src[i]!)) rows.push(src[i++]!);
      pushTable(out, headerLine, rows, w);
      continue;
    }

    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      const segs = parseInline(bq[1]!, { dim: true, italic: true });
      for (const l of wrapSegs(segs, w, { prefix: { text: "▌ ", color: "gray" }, hang: 2 })) out.push(l);
      i++;
      continue;
    }

    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      const indent = ul[1]!.length;
      const prefix: Seg = { text: `${" ".repeat(indent)}• `, color: "cyan" };
      for (const l of wrapSegs(parseInline(ul[2]!), w, { prefix, hang: indent + 2 })) out.push(l);
      i++;
      continue;
    }

    const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      const indent = ol[1]!.length;
      const marker = `${" ".repeat(indent)}${ol[2]}. `;
      const prefix: Seg = { text: marker, color: "cyan" };
      for (const l of wrapSegs(parseInline(ol[3]!), w, { prefix, hang: marker.length })) out.push(l);
      i++;
      continue;
    }

    for (const l of wrapSegs(parseInline(line), w)) out.push(l);
    i++;
  }

  return trimBlank(out);
}
