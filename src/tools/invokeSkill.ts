/**
 * invoke_skill model tool — definition only.
 *
 * Progressive disclosure: the model always sees a lightweight skill index
 * (each skill's name + one-line description, a few tokens each) in the system
 * prompt, and calls `invoke_skill(skill_name)` to pull that skill's full
 * SKILL.md body into context on demand — the difference between "a few tokens"
 * and the full guidance. This mirrors Claude Code's Agent Skills, hand-rolled
 * for the raw Messages API (which has no client-side skills primitive).
 *
 * The handler lives in src/loop.ts (it needs the agent's skill registry + side
 * table); this file only declares what the model sees. SDK-free.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export const invokeSkillToolDef: ToolDef = {
  name: "invoke_skill",
  description:
    "Load a skill's full instructions into context by name. Until you invoke it " +
    "you see only the skill's name and one-line description (in the Available " +
    "skills list); invoking it pulls in the complete SKILL.md guidance. Call this " +
    "when the task matches a listed skill, then apply that guidance. Load a skill " +
    "only when you will actually use it.",
  input_schema: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "Exact name of the skill to load, as shown in the Available skills list.",
      },
    },
    required: ["skill_name"],
  },
};
