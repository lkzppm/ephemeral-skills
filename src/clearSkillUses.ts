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
 * Status: IMPLEMENTED — Milestone M1.
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
  /** Human override: allow eviction of ephemeral:false skills. */
  force?: boolean;
  /** M, estimated remaining tail requests; used by the policy cost gate. */
  estimatedTail?: number;
}

export interface AppliedEdits {
  skillsEvicted: number;
  tokensFreed: number;        // ≈ Σ s − stub
  tokensReprocessed: number;  // ≈ X (lived band after the cut)
}

export interface ClearSkillUsesResult {
  messages: Message[];
  sideTable: SkillRecord[]; // post-eviction COPY with evicted:true on dropped records
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
  return pricing.rho * s * M > pricing.omega * X;
}

/** Pluggable estimator for M (default: remainingBudget / avgStepTokens). */
export function estimateTail(
  remainingTokenBudget: number,
  avgStepTokens: number,
): number {
  return avgStepTokens <= 0 ? 0 : remainingTokenBudget / avgStepTokens;
}

// --- Private helpers ------------------------------------------------------------

/**
 * Rough token estimator: byte length / 4 (real tokenization is M3).
 * Accepts a string or any JSON-serialisable value.
 */
function estimateTokens(x: string | Message | ContentBlock | unknown): number {
  if (typeof x === "string") {
    return Math.ceil(x.length / 4);
  }
  return Math.ceil(JSON.stringify(x).length / 4);
}

/**
 * Lived band X: total estimated tokens in messages AFTER messageIndex.
 * These are the tokens that will reprocess at the cache cut.
 */
function livedBand(messageIndex: number, messages: Message[]): number {
  let total = 0;
  for (let i = messageIndex + 1; i < messages.length; i++) {
    total += estimateTokens(messages[i]);
  }
  return total;
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
  const pricing = opts.pricing ?? { rho: 0.1, omega: 1.25 };
  const keepTokens = opts.evictKeepTokens ?? 30;
  const exclude = new Set(opts.exclude ?? []);
  const force = opts.force === true;

  // --- Resolve candidates -------------------------------------------------------

  let candidates: SkillRecord[];

  if (opts.target && opts.target.length > 0) {
    // Explicit target mode: match by invocationId
    const targetSet = new Set(opts.target);
    candidates = sideTable.filter((rec) => targetSet.has(rec.invocationId));
  } else {
    // Policy mode: only ephemeral:true records, cost-gated, oldest-first
    candidates = sideTable
      .filter((rec) => rec.ephemeral === true)
      .filter((rec) => {
        if (typeof opts.estimatedTail === "number") {
          const X = livedBand(rec.messageIndex, messages);
          return isEvictionWorthIt(rec.tokenLen, opts.estimatedTail, X, pricing);
        }
        // No estimatedTail supplied — admit all ephemeral candidates
        return true;
      })
      .slice() // don't mutate the filtered result
      .sort((a, b) => a.messageIndex - b.messageIndex);
  }

  // --- Apply gates (filter out ineligible records) -------------------------------

  candidates = candidates.filter((rec) => {
    if (rec.evicted === true) return false;          // already evicted
    if (exclude.has(rec.skillName)) return false;    // explicitly excluded
    if (rec.ephemeral === false && !force) return false; // strict gate
    return true;
  });

  // --- Short-circuit: nothing to do ---------------------------------------------

  if (candidates.length === 0) {
    return {
      messages,
      sideTable,
      appliedEdits: { skillsEvicted: 0, tokensFreed: 0, tokensReprocessed: 0 },
    };
  }

  // --- Build the eviction set and rewrite messages ------------------------------

  const evictedIds = new Set(candidates.map((r) => r.invocationId));
  // Build a lookup: messageIndex → SkillRecord (for rewrite)
  const byIndex = new Map<number, SkillRecord>();
  for (const rec of candidates) {
    byIndex.set(rec.messageIndex, rec);
  }

  const outMessages = messages.map((msg, i) => {
    const rec = byIndex.get(i);
    if (!rec) return msg; // keep same reference — byte-identical
    return rewriteSkillMessage(msg, rec, keepTokens);
  });

  // --- Build post-eviction side table copy (immutable) --------------------------

  const outSideTable = sideTable.map((r) =>
    evictedIds.has(r.invocationId) ? { ...r, evicted: true } : r,
  );

  // --- Accounting ---------------------------------------------------------------

  let tokensFreed = 0;
  let tokensReprocessed = 0;

  for (const rec of candidates) {
    const stubLen = estimateTokens(makeStub(rec.skillName, keepTokens));
    tokensFreed += Math.max(0, rec.tokenLen - stubLen);
  }

  // tokensReprocessed = lived band from the earliest eviction cut onward
  // (one write pass ω·X — messages from minIndex+1 to end)
  const minIndex = Math.min(...candidates.map((r) => r.messageIndex));
  for (let i = minIndex + 1; i < messages.length; i++) {
    tokensReprocessed += estimateTokens(messages[i]);
  }

  return {
    messages: outMessages,
    sideTable: outSideTable,
    appliedEdits: {
      skillsEvicted: candidates.length,
      tokensFreed,
      tokensReprocessed,
    },
  };
}

/** Build the placeholder stub for an evicted skill. */
export function makeStub(skillName: string, keepTokens = 30): string {
  return `[skill "${skillName}" was invoked earlier and has been evicted to free ` +
    `context. Re-invoke /${skillName} to reload its instructions.]`;
}

// --- Internal rewrite helpers ---------------------------------------------------

/**
 * Rewrite a single message to replace its skill body with a stub.
 * Non-skill blocks keep their same reference.
 */
function rewriteSkillMessage(
  msg: Message,
  rec: SkillRecord,
  keepTokens: number,
): Message {
  const stub = makeStub(rec.skillName, keepTokens);

  if (typeof msg.content === "string") {
    // String content: replace entirely with stub
    return { role: msg.role, content: stub };
  }

  // Array content: replace only the matching skill block; others keep reference
  const newContent = msg.content.map((block) => {
    if (
      block.type === "skill" &&
      (block.skill_name === rec.skillName || block.skill_name == null)
    ) {
      return { ...block, body: stub, evicted: true };
    }
    return block; // same reference for non-skill blocks
  });

  return { role: msg.role, content: newContent };
}
