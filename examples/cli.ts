/**
 * Interactive REPL showcase for clear_skill_uses.
 *
 * Demonstrates deterministic skill injection, manual eviction, and the
 * cache-usage panel that makes the cost savings of eviction legible.
 *
 * Run with:  tsx examples/cli.ts
 * Requires:  ANTHROPIC_API_KEY in env for agent.send(); slash commands work without it.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import {
  SkillAgent,
  loadSkills,
  type UsageRecord,
  type LoadedSkill,
} from "../src/index";

// ---------------------------------------------------------------------------
// Resolve the skills directory relative to this file.
// ---------------------------------------------------------------------------
const skillsDir = fileURLToPath(new URL("../skills", import.meta.url));
const skills = loadSkills(skillsDir);

// ---------------------------------------------------------------------------
// Agent construction — autoTriggers:false so every injection/eviction is manual
// and fully visible in the demo.
// ---------------------------------------------------------------------------
const agent = new SkillAgent({
  skills,
  system:
    "You are a helpful coding assistant. " +
    "When a skill is injected into context it appears as a <skill> block. " +
    "Read and apply it. " +
    "Once you are done with an ephemeral skill you may call the clear_skill tool to free context tokens.",
  autoTriggers: false,
  thinking: false,
});

// ---------------------------------------------------------------------------
// Known slash-command keywords — used to distinguish `/<name>` (inject) from
// an unknown command.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function banner(): void {
  console.log("\n=== clear_skill_uses showcase REPL ===");
  console.log("Skill directory:", skillsDir);
  console.log(`${skills.length} skill(s) loaded: ${skills.map((s) => s.name).join(", ") || "(none)"}`);
  console.log();
  printHelp();
}

function printHelp(): void {
  console.log("Commands:");
  console.log("  /help                       — show this list");
  console.log("  /skills                     — list loaded skills");
  console.log("  /use <name>  or  /<name>    — inject a skill into context");
  console.log("  /clear-skill <name> [--force] — evict a skill from context");
  console.log("  /usage                      — show per-turn cache usage log");
  console.log("  /context                    — show context stats");
  console.log("  /quit  or  /exit            — quit");
  console.log();
  console.log("Any other input is sent to the agent (requires ANTHROPIC_API_KEY).");
  console.log();
}

function printSkillsTable(skillList: LoadedSkill[]): void {
  if (skillList.length === 0) {
    console.log("(no skills loaded)");
    return;
  }
  console.log(
    String("name").padEnd(24) +
      String("ephemeral").padEnd(12) +
      String("tokenLen").padEnd(12) +
      "evictAfter"
  );
  console.log("-".repeat(64));
  for (const s of skillList) {
    const ea = s.frontmatter.evictAfter?.kind ?? "—";
    console.log(
      String(s.name).padEnd(24) +
        String(s.frontmatter.ephemeral).padEnd(12) +
        String(s.tokenLen).padEnd(12) +
        ea
    );
  }
}

function printUsagePanel(usage: UsageRecord[]): void {
  if (usage.length === 0) return;
  console.log("\n-- usage panel --");
  for (const u of usage) {
    let line =
      `[${u.step}] cache_read=${u.cacheReadTokens} cache_creation=${u.cacheCreationTokens}` +
      ` in=${u.inputTokens} out=${u.outputTokens}`;
    if (u.appliedEdits) {
      const e = u.appliedEdits;
      line += ` | evicted=${e.skillsEvicted} freed≈${e.tokensFreed} reprocess≈${e.tokensReprocessed}`;
    }
    console.log(line);
  }
  console.log(
    "  hint: after eviction cache_read drops on later turns — that gap is the payoff."
  );
  console.log();
}

function printUsageLog(): void {
  const log = agent.usageLog;
  if (log.length === 0) {
    console.log("(no usage recorded yet — send a message first)");
    return;
  }
  printUsagePanel(log);
}

function printContextStats(): void {
  const stats = agent.contextStats();
  console.log(`messages: ${stats.messageCount}  estimated_tokens: ${stats.estimatedTokens}`);
  if (stats.skills.length === 0) {
    console.log("  no skills in context");
  } else {
    console.log(
      "  " +
        String("skill").padEnd(24) +
        String("ephemeral").padEnd(12) +
        String("evicted").padEnd(10) +
        "tokenLen"
    );
    for (const sk of stats.skills) {
      console.log(
        "  " +
          String(sk.name).padEnd(24) +
          String(sk.ephemeral).padEnd(12) +
          String(sk.evicted).padEnd(10) +
          sk.tokenLen
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Slash-command dispatch
// ---------------------------------------------------------------------------

function dispatchSlash(raw: string): void {
  // raw starts with "/"
  const withoutSlash = raw.slice(1).trim();
  const [cmd, ...rest] = withoutSlash.split(/\s+/);

  // Bare "/<name>" injection shortcut — if token is not a known command keyword
  // but is a known skill name, treat it as /use <name>.
  if (!KNOWN_COMMANDS.has(cmd)) {
    const matchedSkill = skills.find((s) => s.name === cmd);
    if (matchedSkill) {
      const result = agent.injectSkill(cmd);
      console.log(result.message);
    } else {
      console.log(`unknown command "${raw}" — try /help`);
    }
    return;
  }

  switch (cmd) {
    case "help":
      printHelp();
      break;

    case "skills":
      printSkillsTable(skills);
      break;

    case "use": {
      const name = rest[0];
      if (!name) {
        console.log("usage: /use <skill-name>");
        break;
      }
      const result = agent.injectSkill(name);
      console.log(result.message);
      break;
    }

    case "clear-skill": {
      const name = rest.find((t) => !t.startsWith("--"));
      const force = rest.includes("--force");
      if (!name) {
        console.log("usage: /clear-skill <skill-name> [--force]");
        break;
      }
      const result = agent.clearSkill(name, { force });
      console.log(result.message);
      if (result.appliedEdits) {
        const e = result.appliedEdits;
        console.log(
          `  evicted=${e.skillsEvicted} freed≈${e.tokensFreed} reprocess≈${e.tokensReprocessed}`
        );
      }
      break;
    }

    case "usage":
      printUsageLog();
      break;

    case "context":
      printContextStats();
      break;

    case "quit":
    case "exit":
      // Signal handled by the caller via return value; shouldn't reach here.
      break;

    default:
      console.log(`unknown command "${raw}" — try /help`);
  }
}

// ---------------------------------------------------------------------------
// Main REPL loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  banner();

  const rl = createInterface({ input, output, terminal: false });

  // Use a flag instead of process.exit so readline closes cleanly.
  let running = true;

  while (running) {
    let line: string;
    try {
      line = await rl.question("» ");
    } catch {
      // EOF (Ctrl-D) — exit cleanly.
      break;
    }

    line = line.trim();
    if (!line) continue;

    // Quit commands
    if (line === "/quit" || line === "/exit") {
      console.log("Bye.");
      running = false;
      break;
    }

    if (line.startsWith("/")) {
      dispatchSlash(line);
      continue;
    }

    // Non-slash input → agent turn
    try {
      const { text, usage } = await agent.send(line);
      console.log("\n" + text + "\n");
      printUsagePanel(usage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`API error: ${msg}`);
      console.log("  hint: make sure ANTHROPIC_API_KEY is set in your environment.");
      console.log();
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
