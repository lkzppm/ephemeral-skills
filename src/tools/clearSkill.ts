/**
 * clear_skill model tool — definition + handler.
 *
 * Exposes `clear_skill(skill_name)` so the model can drop an ephemeral skill the
 * moment it decides it's done with it (agentic self-pruning).
 *
 * This file is SDK-free: structurally typed, no @anthropic-ai/sdk import.
 * The handler delegates eviction entirely to the pure core `clearSkillUses`.
 *
 * Design notes (see spec/concepts/eviction-triggers.md, trigger 2):
 *  - Resolves skill_name → all active (non-evicted) invocationIds in the side-table.
 *  - Calls clearSkillUses with `target` set to those ids. NEVER sets `force`.
 *  - Returns ok:false if the skill is ephemeral:false (core skips it; appliedEdits.skillsEvicted === 0).
 */

import { clearSkillUses, type Message, type SkillRecord, type ClearSkillUsesResult } from "../clearSkillUses";

// --- Tool definition (sent to the model) ----------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export const clearSkillToolDef: ToolDef = {
  name: "clear_skill",
  description:
    "Clear an already-used skill's instructions out of context to free tokens, " +
    "once you are confident you no longer need them. Only works on skills marked " +
    "ephemeral — behavioral/persona skills cannot be cleared. A short record stays, " +
    "so you can re-invoke the skill later if it turns out you need it again.",
  input_schema: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "Name of the skill to clear, exactly as shown when it was invoked.",
      },
    },
    required: ["skill_name"],
  },
};

// --- Handler result -------------------------------------------------------------

export interface ClearSkillToolOutcome {
  ok: boolean;
  toolResultText: string;        // goes into the tool_result block the model sees
  result: ClearSkillUsesResult | null;
  clearedInvocationIds: string[];
}

// --- Handler --------------------------------------------------------------------

export function handleClearSkill(
  input: { skill_name: string },
  messages: Message[],
  sideTable: SkillRecord[],
  opts?: { evictKeepTokens?: number },
): ClearSkillToolOutcome {
  // All active (non-evicted) invocations for this skill name.
  const targets = sideTable.filter(
    (r) => r.skillName === input.skill_name && !r.evicted,
  );

  if (targets.length === 0) {
    return {
      ok: false,
      toolResultText: `No active skill named "${input.skill_name}" to clear.`,
      result: null,
      clearedInvocationIds: [],
    };
  }

  // Delegate to the pure core. Never pass force — the model must not override ephemeral:false.
  const result = clearSkillUses(messages, sideTable, {
    target: targets.map((r) => r.invocationId),
    evictKeepTokens: opts?.evictKeepTokens,
  });

  if (result.appliedEdits.skillsEvicted === 0) {
    // Core skipped every target — they were all ephemeral:false (behavioral/persona skills).
    return {
      ok: false,
      toolResultText:
        `Skill "${input.skill_name}" is not ephemeral and cannot be cleared ` +
        `(behavioral/persona skills persist for the whole session).`,
      result,
      clearedInvocationIds: [],
    };
  }

  // Collect the invocationIds that were actually evicted in this call.
  const clearedInvocationIds = (result as ClearSkillUsesResult & { sideTable: SkillRecord[] })
    .sideTable
    .filter((r) => r.evicted && targets.some((t) => t.invocationId === r.invocationId))
    .map((r) => r.invocationId);

  return {
    ok: true,
    toolResultText:
      `Cleared skill "${input.skill_name}" (${result.appliedEdits.skillsEvicted} invocation(s), ` +
      `~${result.appliedEdits.tokensFreed} tokens freed). Re-invoke it if you need its instructions again.`,
    result,
    clearedInvocationIds,
  };
}
