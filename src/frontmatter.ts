/**
 * Frontmatter parsing for SKILL.md files.
 *
 * Extracts YAML frontmatter (the `---…---` block) from a skill's markdown and
 * maps the known keys to a typed `SkillFrontmatter`. Unknown keys pass through
 * unchanged. Malformed YAML falls back to defaults + full body.
 */

import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvictAfter =
  | { kind: "used" }
  | { kind: "steps"; n: number }
  | { kind: "tokens"; n: number };

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  ephemeral: boolean;
  evictAfter?: EvictAfter;
  evictKeepTokens: number;
  [k: string]: unknown;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/**
 * Parse the `evict-after` string value into a typed EvictAfter, or return
 * undefined for unrecognised values.
 */
function parseEvictAfter(v: unknown): EvictAfter | undefined {
  if (typeof v !== "string") return undefined;
  if (v === "used") return { kind: "used" };

  const stepsMatch = /^(\d+)-steps$/.exec(v);
  if (stepsMatch) return { kind: "steps", n: parseInt(stepsMatch[1], 10) };

  const tokensMatch = /^(\d+)-tokens$/.exec(v);
  if (tokensMatch) return { kind: "tokens", n: parseInt(tokensMatch[1], 10) };

  return undefined;
}

function defaultFrontmatter(): SkillFrontmatter {
  return { ephemeral: false, evictKeepTokens: 30 };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md string, extracting the YAML frontmatter block (if present)
 * and returning the typed metadata alongside the remaining body text.
 *
 * Defensive: if the YAML is malformed, returns default frontmatter + full `md`
 * as body.
 */
export function parseSkillFrontmatter(md: string): ParsedSkill {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) {
    return { frontmatter: defaultFrontmatter(), body: md };
  }

  const rawYaml = match[1];
  // Strip the matched frontmatter block; the remainder starts after it.
  // Strip one leading newline from the body if present.
  const afterBlock = md.slice(match[0].length);
  const body = afterBlock.startsWith("\n") ? afterBlock.slice(1) : afterBlock;

  let parsed: Record<string, unknown>;
  try {
    const result = parseYaml(rawYaml);
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      return { frontmatter: defaultFrontmatter(), body: md };
    }
    parsed = result as Record<string, unknown>;
  } catch {
    // Malformed YAML — fall back to defaults, body = full md.
    return { frontmatter: defaultFrontmatter(), body: md };
  }

  const ephemeral = typeof parsed["ephemeral"] === "boolean" ? parsed["ephemeral"] : false;

  const evictAfterRaw = parsed["evict-after"];
  let evictAfter: EvictAfter | undefined = parseEvictAfter(evictAfterRaw);

  // PRD §12: if ephemeral===true and evict-after is absent, default to {kind:"used"}
  if (evictAfter === undefined && ephemeral) {
    evictAfter = { kind: "used" };
  }

  const evictKeepTokens =
    typeof parsed["evict-keep-tokens"] === "number" ? parsed["evict-keep-tokens"] : 30;

  const name = typeof parsed["name"] === "string" ? parsed["name"] : undefined;
  const description =
    typeof parsed["description"] === "string" ? parsed["description"] : undefined;

  // Pass through remaining keys (strip the ones we've mapped to typed fields).
  const { ephemeral: _e, "evict-after": _ea, "evict-keep-tokens": _ekt, name: _n, description: _d, ...rest } = parsed;

  const frontmatter: SkillFrontmatter = {
    ...rest,
    name,
    description,
    ephemeral,
    evictAfter,
    evictKeepTokens,
  };

  return { frontmatter, body };
}
