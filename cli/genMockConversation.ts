/**
 * Generate a realistic mock conversation under `conversations/` so /resume and
 * the /usage + /context panels can be exercised WITHOUT an API key.
 *
 * It drives a real SkillAgent through three turns with a *mock* Anthropic client
 * (canned tool-use + text responses with hand-picked cache-usage numbers), so the
 * produced snapshot is self-consistent: the model invokes two ephemeral skills
 * that get auto-evicted, a behavioral persona stays pinned, and the usage log
 * shows the post-eviction `cached` drop and `freed` tokens the chart visualizes.
 *
 *   npm run gen:mock        # writes conversations/mock-csv-regex-demo.json
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { SkillAgent, loadSkills } from "../src/index";
import { saveConversation, type Entry, type SavedConversation } from "./conversations";

const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL("../agent/systemPrompt.md", import.meta.url)),
  "utf-8",
)
  .replace(/^<!--[\s\S]*?-->\s*/, "")
  .trim();

const skills = loadSkills(fileURLToPath(new URL("../agent/skills", import.meta.url)));
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

function skillInvokeText(name: string): string {
  const sk = skills.find((s) => s.name === name);
  if (!sk) return `◆ invoked ${name}`;
  const kind = sk.frontmatter.ephemeral ? "ephemeral" : "persona";
  return `◆ invoked ${name} · loaded SKILL.md (~${sk.tokenLen} tok · ${kind})`;
}

// --- mock Anthropic client --------------------------------------------------
type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};
interface MockResp {
  content: unknown[];
  stop_reason: string;
  usage: Usage;
}

const U = (cr: number, cc: number, i: number, o: number): Usage => ({
  cache_read_input_tokens: cr,
  cache_creation_input_tokens: cc,
  input_tokens: i,
  output_tokens: o,
});
const toolUse = (skill_name: string, usage: Usage, id: string): MockResp => ({
  content: [{ type: "tool_use", id, name: "invoke_skill", input: { skill_name } }],
  stop_reason: "tool_use",
  usage,
});
const answer = (text: string, usage: Usage): MockResp => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage,
});

/** A stand-in for `client.messages.stream(req)` that replays canned responses. */
function mockClient(responses: MockResp[]) {
  let i = 0;
  return {
    messages: {
      stream() {
        const resp = responses[i++];
        if (!resp) throw new Error("mock client ran out of responses");
        const handlers: Record<string, (d: string) => void> = {};
        return {
          on(ev: string, cb: (d: string) => void) {
            handlers[ev] = cb;
            return this;
          },
          async finalMessage() {
            const textBlock = resp.content.find(
              (b) => (b as { type: string }).type === "text",
            ) as { text?: string } | undefined;
            if (textBlock?.text && handlers.text) handlers.text(textBlock.text);
            return resp;
          },
        };
      },
    },
  };
}

// --- the scripted turns -----------------------------------------------------
const csvAnswer =
  "Cleaned it. Dropped 3 duplicate rows, coerced `amount` to numbers (stripping `$` and commas), " +
  "and normalized `order_date` to ISO `YYYY-MM-DD`. 1,204 rows in, 1,201 out. Want it written back to a file?";
const regexAnswer =
  "Use `^[A-Z]{3}-\\d{6}$` — three uppercase letters, a literal dash, then exactly six digits, " +
  "anchored start-to-end so partial matches are rejected. For case-insensitive input add the `i` flag.";
const summaryAnswer =
  "Two things: (1) cleaned the sales CSV — deduped to 1,201 rows, numeric `amount`, ISO dates; " +
  "and (2) gave you `^[A-Z]{3}-\\d{6}$` to validate the order IDs.";

// One response per model call, in order: each skill turn is tool_use → answer.
const responses: MockResp[] = [
  toolUse("csv-wrangling", U(0, 4600, 1200, 40), "tu_csv"),
  answer(csvAnswer, U(5800, 980, 30, 220)),
  toolUse("regex-cookbook", U(5200, 900, 40, 35), "tu_rgx"), // first call after csv eviction → shows `freed`
  answer(regexAnswer, U(6100, 870, 30, 180)),
  answer(summaryAnswer, U(5400, 120, 35, 160)), // first call after regex eviction → shows `freed`
];

const transcript: Entry[] = [];
let id = 0;
const push = (kind: Entry["kind"], text: string) => transcript.push({ id: ++id, kind, text });

const agent = new SkillAgent({
  skills,
  system: SYSTEM_PROMPT,
  autoTriggers: true,
  thinking: false,
  onSkillInvoke: (name) => push("skill", `${skillInvokeText(name)} · by agent`),
  onAutoEvict: (names, edits) =>
    push(
      "usage",
      `auto-cleared ${names.join(", ")} (evict-after: used) · ~${edits.tokensFreed} tok freed · ${edits.tokensReprocessed} reprocessed`,
    ),
});
(agent as unknown as { client: unknown }).client = mockClient(responses);

async function turn(userText: string): Promise<void> {
  push("user", userText);
  let assistantId: number | null = null;
  await agent.send(userText, {
    onDelta: (full) => {
      if (assistantId === null) {
        assistantId = ++id;
        transcript.push({ id: assistantId, kind: "assistant", text: full });
      } else {
        const aid = assistantId;
        const e = transcript.find((x) => x.id === aid);
        if (e) e.text = full;
      }
    },
  });
}

async function main(): Promise<void> {
  // Pin the behavioral persona (ephemeral:false → stays in context all session).
  agent.injectSkill("response-style");
  const rs = skills.find((s) => s.name === "response-style");
  if (rs) push("skill", `◆ loaded response-style · SKILL.md (~${rs.tokenLen} tok · persona) · pinned`);

  await turn("Clean up this messy sales CSV — dedupe rows and fix the date column.");
  await turn("Now give me a regex to validate the order IDs (3 letters, dash, 6 digits).");
  await turn("Thanks — summarize what you did.");

  const now = new Date().toISOString();
  const conv: SavedConversation = {
    version: 1,
    id: "mock-csv-regex-demo",
    title: "Clean up this messy sales CSV — dedupe rows and fix the date column.",
    model: MODEL,
    createdAt: now,
    updatedAt: now,
    transcript,
    agent: agent.snapshot(),
  };
  saveConversation(conv);
  console.log(
    `Wrote conversations/${conv.id}.json — ${transcript.length} transcript entries, ` +
      `${agent.usageLog.length} usage records, ${agent.snapshot().sideTable.length} skill blocks.`,
  );
}

main().catch((err) => {
  console.error("gen:mock failed:", err);
  process.exit(1);
});
