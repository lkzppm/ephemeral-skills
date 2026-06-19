import { describe, it, expect } from "vitest";
import {
  clearSkillUses,
  isEvictionWorthIt,
  makeStub,
  type Message,
  type SkillRecord,
} from "../src/clearSkillUses";

// Milestone M1 — implement src/clearSkillUses.ts to make these pass.
// See PRD.md §11 for the full strategy.

describe("isEvictionWorthIt (cost gate)", () => {
  it("evicts a fat, long-lived skill with a small lived band", () => {
    // s=2000, M=50, X=1500 → ρsM=10000 > ωX=1875
    expect(isEvictionWorthIt(2000, 50, 1500)).toBe(true);
  });

  it("keeps a skill when the tail is too short", () => {
    // s=2000, M=5, X=1500 → ρsM=1000 < ωX=1875
    expect(isEvictionWorthIt(2000, 5, 1500)).toBe(false);
  });

  it("uses the 1-hr TTL hurdle when omega=2.0", () => {
    expect(isEvictionWorthIt(2000, 12, 1500, { rho: 0.1, omega: 2.0 })).toBe(false);
  });
});

describe("clearSkillUses (core transform)", () => {
  const messages: Message[] = [
    { role: "user", content: "implement the backend" },
    { role: "assistant", content: [{ type: "skill", skill_name: "regex-cookbook", body: "…long instructions…" }] },
    { role: "assistant", content: [{ type: "tool_result", text: "read src/api.py …" }] },
    { role: "user", content: "now wire the frontend" },
  ];
  const sideTable: SkillRecord[] = [
    { invocationId: "inv-1", skillName: "regex-cookbook", messageIndex: 1, tokenLen: 2000, ephemeral: true },
  ];

  it("replaces the skill body with a stub and reports tokens freed", () => {
    const { messages: out, appliedEdits } = clearSkillUses(messages, sideTable, { target: ["inv-1"] });
    expect(appliedEdits.skillsEvicted).toBe(1);
    expect(appliedEdits.tokensFreed).toBeGreaterThan(0);
    // stub present
    expect(JSON.stringify(out[1])).toContain("evicted");
  });

  it("leaves non-targeted blocks byte-identical", () => {
    const { messages: out } = clearSkillUses(messages, sideTable, { target: ["inv-1"] });
    expect(out[2]).toEqual(messages[2]); // the file-read tool_result is untouched
    expect(out[3]).toEqual(messages[3]); // the chat is untouched
  });

  it("never evicts a non-ephemeral (behavioral) skill", () => {
    const behavioral: SkillRecord[] = [{ ...sideTable[0], ephemeral: false }];
    const { appliedEdits } = clearSkillUses(messages, behavioral, {}); // policy-driven, no explicit target
    expect(appliedEdits.skillsEvicted).toBe(0);
  });
});

describe("makeStub", () => {
  it("names the skill and tells the model how to reload", () => {
    const s = makeStub("regex-cookbook");
    expect(s).toContain("regex-cookbook");
    expect(s.toLowerCase()).toContain("re-invoke");
  });
});
