/**
 * clear_skill_uses — reference implementation (Agent SDK / TypeScript).
 *
 * The skill analogue of the `clear_tool_uses_20250919` context edit: replace an
 * already-consumed SKILL.md body with a short placeholder, keep the record that the
 * skill ran, preserve everything else.
 *
 * KEEP THIS CORE A PURE FUNCTION. No network, no SDK coupling here.
 * See PRD.md (§3–§9) and docs/cost-model.md before implementing.
 *
 * Status: INTERFACE STUB — implement the bodies. Milestone M1.
 */

// --- Message model (minimal; align with @anthropic-ai/sdk message types) -------

export type Role = "user" | "assistant";

export interface ContentBlock {
  type: string; // "text" | "tool_use" | "tool_result" | "skill" | ...
  [k: string]: unknown;
}

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

// --- Skill side-table: how we locate a skill block deterministically ------------

export interface SkillRecord {
  invocationId: string;   // primary key; never match on content
  skillName: string;
  messageIndex: number;   // index into the messages array
  tokenLen: number;       // body size s (for cost accounting)
  ephemeral: boolean;     // from frontmatter; default false
  evicted?: boolean;      // set true once dropped (compaction must skip these)
}

// --- Options & result -----------------------------------------------------------

export interface ClearSkillUsesOptions {
  /** invocationIds to evict. If omitted, policy decides (see shouldEvict). */
  target?: string[];
  /** Tokens of placeholder to leave behind. Default ~30. */
  evictKeepTokens?: number;
  /** Skill names to never evict regardless of policy. */
  exclude?: string[];
  /** Pricing for the cost gate. */
  pricing?: { rho: number; omega: number }; // default { rho: 0.1, omega: 1.25 }
}

export interface AppliedEdits {
  skillsEvicted: number;
  tokensFreed: number;        // ≈ Σ s − stub
  tokensReprocessed: number;  // ≈ X (lived band after the cut)
}

export interface ClearSkillUsesResult {
  messages: Message[];
  appliedEdits: AppliedEdits;
}

// --- Cost gate (docs/cost-model.md) ---------------------------------------------

/**
 * Net-win predicate: ρ·s·M > ω·X.
 * @param s tokens in the skill body
 * @param M estimated remaining tail requests the skill would persist
 * @param X tokens in the lived band that will reprocess on eviction
 */
export function isEvictionWorthIt(
  s: number,
  M: number,
  X: number,
  pricing = { rho: 0.1, omega: 1.25 },
): boolean {
  // TODO(M1): implement ρ·s·M > ω·X
  throw new Error("not implemented");
}

/** Pluggable estimator for M (default: remainingBudget / avgStepTokens). */
export function estimateTail(
  remainingTokenBudget: number,
  avgStepTokens: number,
): number {
  // TODO(M2)
  throw new Error("not implemented");
}

// --- Core transform (PURE) ------------------------------------------------------

/**
 * Replace targeted skill bodies with placeholders; return new messages + edits.
 * MUST:
 *  - leave every non-targeted block byte-identical,
 *  - replace only the skill instruction message (not any tool_use/tool_result it spawned),
 *  - mark evicted records so compaction won't resurrect them,
 *  - compute appliedEdits accurately.
 */
export function clearSkillUses(
  messages: Message[],
  sideTable: SkillRecord[],
  opts: ClearSkillUsesOptions = {},
): ClearSkillUsesResult {
  // TODO(M1): implement. Keep pure — no mutation of inputs.
  throw new Error("not implemented");
}

/** Build the placeholder stub for an evicted skill. */
export function makeStub(skillName: string, keepTokens = 30): string {
  return `[skill "${skillName}" was invoked earlier and has been evicted to free ` +
    `context. Re-invoke /${skillName} to reload its instructions.]`;
}
