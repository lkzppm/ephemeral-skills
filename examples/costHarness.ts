/**
 * costHarness.ts — M3 empirical cost harness.
 *
 * Drives a real Agent SDK loop through the canonical fat-skill scenario
 * (inject → use → evict → tail) and validates the ρ·s·M > ω·X cost model
 * against actual Messages API cache usage.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… tsx examples/costHarness.ts [tailTurns]
 *   TAIL=12 tsx examples/costHarness.ts
 *
 * Output:
 *   stdout — CSV + SUMMARY block
 *   examples/out/usage.csv — same CSV persisted to disk
 *
 * Requires real API access; makes ~9 requests by default (2 use + 6 tail + overhead).
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  loadSkills,
  SkillAgent,
  type UsageRecord,
} from "../src/index";

// ---------------------------------------------------------------------------
// Guard: must have API key before doing anything else
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Set ANTHROPIC_API_KEY to run the cost harness — it makes real API calls (~9 requests).",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants (cost-model parameters from docs/cost-model.md)
// ---------------------------------------------------------------------------

const RHO = 0.1;   // cache-read price relative to fresh input
const OMEGA = 1.25; // cache-write price relative to fresh input (5-min TTL)

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Resolve skills directory next to this file's package root --------
  const harnessDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const skillsDir = join(harnessDir, "skills");
  const skills = loadSkills(skillsDir);

  if (skills.length === 0) {
    throw new Error(`No skills found under ${skillsDir}. Build the skills first.`);
  }

  // --- Pick the fat ephemeral skill ------------------------------------
  // Prefer "regex-cookbook"; fall back to the largest ephemeral skill.
  let fatSkill =
    skills.find((sk) => sk.name === "regex-cookbook" && sk.frontmatter.ephemeral) ??
    skills
      .filter((sk) => sk.frontmatter.ephemeral)
      .sort((a, b) => b.tokenLen - a.tokenLen)[0];

  if (!fatSkill) {
    throw new Error(
      "No ephemeral skill found. At least one skill needs ephemeral:true in its frontmatter.",
    );
  }

  const fatName = fatSkill.name;
  const s = fatSkill.tokenLen; // declared skill-body token estimate

  // --- TAIL turn count -------------------------------------------------
  const tailArg = process.argv[2] ?? process.env.TAIL;
  const N = tailArg !== undefined ? parseInt(tailArg, 10) : 6;
  if (isNaN(N) || N < 1) throw new Error(`Invalid tail turn count: ${tailArg}`);

  console.log(`\n=== M3 Cost Harness — fat skill: "${fatName}" (s≈${s} tok), tail N=${N} ===\n`);

  // --- Construct SkillAgent -------------------------------------------
  const agent = new SkillAgent({
    skills,
    system:
      "You are a precise coding assistant. Answer concisely and technically. " +
      "When given domain knowledge, apply it directly to the task at hand.",
    autoTriggers: false,  // explicit control for clean measurement
    thinking: false,       // keep output small and cache-stable
    maxTokens: 512,        // cheap; we care about input cache metrics, not output
  });

  // --- SCENARIO --------------------------------------------------------

  // Step 1: inject the fat skill
  const injectResult = agent.injectSkill(fatName);
  if (!injectResult.ok) throw new Error(`injectSkill failed: ${injectResult.message}`);
  console.log(`[inject] ${injectResult.message}`);

  // Step 2: USE phase — 2 turns that exercise the skill knowledge.
  // These build the lived band X.
  console.log("\n[use phase] sending 2 turns that apply the skill knowledge…");
  await agent.send(
    "Using the backend knowledge you have, explain the key tradeoffs between " +
    "PUT and PATCH for a REST API, and when you would choose each.",
  );
  await agent.send(
    "Now give a concrete example: I have a /users/{id} endpoint. " +
    "Draft the HTTP contract (method, path, request body shape, success code) " +
    "for both a full-replace and a partial-update operation.",
  );

  const useRecords = agent.usageLog.slice(); // snapshot after USE phase

  // Step 3: EVICT — clear the fat skill (ephemeral ⇒ should succeed).
  console.log("\n[evict] clearing fat skill…");
  const ev = agent.clearSkill(fatName);
  if (!ev.ok) throw new Error(`clearSkill failed: ${ev.message}`);
  console.log(`[evict] ${ev.message}`);
  const evEdits = ev.appliedEdits;

  // Step 4: TAIL phase — N more turns where the skill is absent.
  // The cache-read per step should drop by ≈ ρ·s.
  console.log(`\n[tail phase] sending ${N} follow-up turns…`);
  for (let i = 1; i <= N; i++) {
    await agent.send(
      `Tail turn ${i}/${N}: In one sentence, what is the key rule for ` +
      `choosing an HTTP status code for a validation error?`,
    );
  }

  // --- Collect records -------------------------------------------------
  const log: UsageRecord[] = agent.usageLog;

  // --- CSV output -------------------------------------------------------
  const csvHeader = "step,cache_read,cache_creation,input,output,skills_evicted,tokens_freed,tokens_reprocessed";
  const csvRows = log.map((r) => {
    const ae = r.appliedEdits;
    return [
      r.step,
      r.cacheReadTokens,
      r.cacheCreationTokens,
      r.inputTokens,
      r.outputTokens,
      ae?.skillsEvicted ?? 0,
      ae?.tokensFreed ?? 0,
      ae?.tokensReprocessed ?? 0,
    ].join(",");
  });
  const csv = [csvHeader, ...csvRows].join("\n") + "\n";

  console.log("\n--- CSV ---");
  console.log(csv);

  // Write CSV to examples/out/usage.csv
  const outDir = join(harnessDir, "examples", "out");
  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, "usage.csv");
  writeFileSync(csvPath, csv, "utf-8");
  console.log(`[csv] written to ${csvPath}\n`);

  // --- SUMMARY ----------------------------------------------------------
  // Predicted values from the cost model
  const predictedFreed = evEdits?.tokensFreed ?? 0;
  const predictedReprocessed = evEdits?.tokensReprocessed ?? 0; // X
  const X = predictedReprocessed;

  // Split log into USE phase and TAIL phase.
  // The USE records are the ones before the eviction record;
  // the eviction is attached to the first request after clearSkill() is called.
  // In the loop, appliedEdits is attached to the first request AFTER the pending
  // edits are set — i.e., the first tail turn carries the eviction's appliedEdits.
  const evictionRecordIdx = log.findIndex((r) => (r.appliedEdits?.skillsEvicted ?? 0) > 0);
  const useLogs = evictionRecordIdx > 0 ? log.slice(0, evictionRecordIdx) : useRecords;
  const tailLogs = evictionRecordIdx >= 0 ? log.slice(evictionRecordIdx) : [];

  // Observed metrics
  const avgUseRead =
    useLogs.length > 0
      ? useLogs.reduce((sum, r) => sum + r.cacheReadTokens, 0) / useLogs.length
      : 0;
  const avgTailRead =
    tailLogs.length > 0
      ? tailLogs.reduce((sum, r) => sum + r.cacheReadTokens, 0) / tailLogs.length
      : 0;
  const observedReadDrop = avgUseRead - avgTailRead;
  const predictedReadDrop = RHO * s;

  // One-time cache_creation spike at the eviction/first-tail request
  const evictionRecord = evictionRecordIdx >= 0 ? log[evictionRecordIdx] : undefined;
  const observedCreationSpike = evictionRecord?.cacheCreationTokens ?? 0;
  const predictedCreationSpike = OMEGA * X;

  // Break-even tail length
  const Mstar = X > 0 && s > 0 ? (OMEGA * X) / (RHO * s) : 0;

  // Measured Δ vs predicted Δ
  const predictedDelta = RHO * s * N - OMEGA * X;
  // Observed Δ: savings from reduced cache_read across tail minus the spike cost.
  // Per-step saving ≈ observedReadDrop * (1 token = 1 unit cost).
  // But the actual token costs differ from the dollar model; compare token deltas.
  const observedDelta = observedReadDrop * N - observedCreationSpike;

  // Within-noise check: 20% tolerance
  const noiseTolerance = 0.20;
  const readDropMatch =
    predictedReadDrop > 0
      ? Math.abs(observedReadDrop - predictedReadDrop) / predictedReadDrop < noiseTolerance
      : observedReadDrop === 0;
  const creationSpikeMatch =
    predictedCreationSpike > 0
      ? Math.abs(observedCreationSpike - predictedCreationSpike) / predictedCreationSpike < noiseTolerance
      : observedCreationSpike === 0;

  console.log("--- SUMMARY ---");
  console.log(`Skill:              ${fatName}`);
  console.log(`s (declared):       ${s} tokens`);
  console.log(`N (tail turns):     ${N}`);
  console.log("");
  console.log("EVICTION (appliedEdits):");
  console.log(`  tokensFreed:        ${predictedFreed}  (≈ s = ${s})`);
  console.log(`  tokensReprocessed:  ${predictedReprocessed}  (X, the lived band)`);
  console.log("");
  console.log("PREDICTED (from cost model, ρ=0.1, ω=1.25):");
  console.log(`  per-tail-step cache_read drop:  ρ·s = ${predictedReadDrop.toFixed(0)} tok`);
  console.log(`  one-time cache_creation spike:  ω·X = ${predictedCreationSpike.toFixed(0)} tok`);
  console.log(`  break-even tail M* =            ω·X/(ρ·s) = ${Mstar.toFixed(1)} turns`);
  console.log(`  N=${N} ${N > Mstar ? ">" : "<="} M*=${Mstar.toFixed(1)} → eviction ${N > Mstar ? "PAYS OFF" : "does NOT pay off yet"}`);
  console.log(`  predicted Δ (token savings):    ρ·s·N − ω·X = ${predictedDelta.toFixed(0)} tok`);
  console.log("");
  console.log("OBSERVED:");
  console.log(`  avg cache_read in USE phase:    ${avgUseRead.toFixed(0)} tok`);
  console.log(`  avg cache_read in TAIL phase:   ${avgTailRead.toFixed(0)} tok`);
  console.log(`  observed cache_read drop/turn:  ${observedReadDrop.toFixed(0)} tok  (predicted: ${predictedReadDrop.toFixed(0)})`);
  console.log(`  observed creation spike:        ${observedCreationSpike} tok  (predicted: ${predictedCreationSpike.toFixed(0)})`);
  console.log(`  observed Δ (token savings):     ${observedDelta.toFixed(0)} tok  (predicted: ${predictedDelta.toFixed(0)})`);
  console.log("");
  console.log("MODEL AGREEMENT:");
  console.log(
    `  cache_read drop: ${readDropMatch ? "WITHIN noise (<20%)" : "OUTSIDE noise (>20%) — check tokenizer or prefix shape"}`,
  );
  console.log(
    `  creation spike:  ${creationSpikeMatch ? "WITHIN noise (<20%)" : "OUTSIDE noise (>20%) — check tokenizer or prefix shape"}`,
  );
  console.log(
    observedReadDrop > 0 || observedCreationSpike > 0
      ? "\nObserved deltas are non-zero. The eviction is measurably affecting cache " +
        "usage in the expected directions."
      : "\nNo cache deltas observed — caching may not be active (check that prompt " +
        "caching is supported for this model/region) or the context is too short.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
