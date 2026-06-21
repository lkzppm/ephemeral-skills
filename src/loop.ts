/**
 * SkillAgent — the reference Agent SDK loop (Layer A, the SDK "edges").
 *
 * Ties the pure core together with the live Messages API:
 *  - injects a skill as its own { type:"skill" } block (NOT a tool_result),
 *  - runs the agentic tool loop (the model loads skills via invoke_skill),
 *  - fires the deterministic eviction triggers (evict-after / threshold),
 *  - converts internal messages → Anthropic params and places a rolling cache
 *    breakpoint after the stable prefix P,
 *  - records per-request cache usage so callers can see the economics.
 *
 * Everything Anthropic-specific lives HERE; src/clearSkillUses.ts stays pure.
 * See spec/concepts/cache-correctness.md and spec/concepts/showcase-cli.md.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LoadedSkill } from "./skillLoader";
import type { EvictAfter } from "./frontmatter";
import {
  clearSkillUses,
  estimateTail,
  type Message,
  type ContentBlock,
  type SkillRecord,
  type AppliedEdits,
} from "./clearSkillUses";
import { invokeSkillToolDef } from "./tools/invokeSkill";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 2048;
const TOOL_LOOP_GUARD = 16;

export interface AgentConfig {
  /** API key; falls back to ANTHROPIC_API_KEY in the environment. */
  apiKey?: string;
  /** Model id. Default claude-opus-4-8. */
  model?: string;
  maxTokens?: number;
  /** System prompt (gets its own cache breakpoint). */
  system?: string;
  /** Skill registry available for injection (from loadSkills). */
  skills?: LoadedSkill[];
  /** Wire the automatic triggers (evict-after: used + token threshold). Default false. */
  autoTriggers?: boolean;
  /** Context-token threshold for the policy trigger. Default Infinity (off). */
  thresholdTokens?: number;
  /** Send adaptive thinking. Default false (cleaner cache/cost measurement). */
  thinking?: boolean;
  /** Per-request usage callback (the CLI uses it to print a panel). */
  onUsage?: (u: UsageRecord) => void;
  /** Fired when a frontmatter `evict-after: used` skill is auto-evicted at the
   *  end of a turn (deterministic, not model-driven). */
  onAutoEvict?: (skillNames: string[], edits: AppliedEdits) => void;
  /** Fired when the model loads a skill's full body via the invoke_skill tool. */
  onSkillInvoke?: (skillName: string) => void;
}

export interface UsageRecord {
  step: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Eviction accounting applied just before this request, if any. */
  appliedEdits?: AppliedEdits;
}

/** A single step inside one agentic turn (one model call). */
export type StackStepKind = "tool" | "answer";

/** One append-ordered block of the live context window, for the CLI visualizer. */
export type StackItemKind = "system" | "user" | "skill" | "ai";

export interface StackItem {
  kind: StackItemKind;
  label: string;
  tokens: number;
  /** skill only: the body has been wiped to a stub. */
  evicted?: boolean;
  /** ai only: the per-call steps of the loop, in order. */
  steps?: StackStepKind[];
}

export interface ContextStack {
  items: StackItem[];
  /** Index into `items` of the earliest wiped skill — where the KV cache was
   *  re-linked (the prefix `P` ends just before it). null = nothing evicted. */
  cutIndex: number | null;
  /** True while a wipe's one-time reprocess (`ω·X`) is still owed — i.e. a skill
   *  was cleared but no request has paid for it yet. Once the next request
   *  settles, the tail re-caches and this is false again. */
  reprocessPending: boolean;
}

/** A JSON-serializable snapshot of all of a SkillAgent's mutable state — enough
 *  to resume the exact conversation in a fresh process. The static config
 *  (skills registry, system prompt, callbacks) is NOT saved: it's supplied at
 *  construction and re-applied around `restore()`. Used by the CLI's /resume. */
export interface AgentSnapshot {
  messages: Message[];
  sideTable: SkillRecord[];
  usageLog: UsageRecord[];
  step: number;
  invCounter: number;
  skillMeta: [string, { evictAfter?: EvictAfter; stepInjected: number }][];
  pendingEdits?: AppliedEdits;
  pendingCutMsgIndex?: number;
}

/** Options for one agent turn. */
export interface SendOptions {
  /** Streaming text callback — receives the full text accumulated so far. */
  onDelta?: (full: string) => void;
}

export interface InjectResult {
  ok: boolean;
  message: string;
}

export interface ClearResult {
  ok: boolean;
  message: string;
  appliedEdits?: AppliedEdits;
}

export class SkillAgent {
  messages: Message[] = [];
  sideTable: SkillRecord[] = [];
  usageLog: UsageRecord[] = [];

  private cfg: AgentConfig;
  private skills: LoadedSkill[];
  private client?: Anthropic;
  private step = 0;
  private invCounter = 0;
  private skillMeta = new Map<
    string,
    { evictAfter?: EvictAfter; stepInjected: number }
  >();
  private pendingEdits?: AppliedEdits;
  /** Message index of the earliest skill in the current pending-reprocess batch
   *  — the live KV re-link cut. Set when an eviction happens, cleared the moment
   *  the next request pays the reprocess (alongside `pendingEdits`). */
  private pendingCutMsgIndex?: number;
  private systemCache?: string;

  constructor(cfg: AgentConfig = {}) {
    this.cfg = cfg;
    this.skills = cfg.skills ?? [];
  }

  private getClient(): Anthropic {
    if (!this.client) {
      // Auth resolves from config or .env / environment. ANTHROPIC_API_KEY is the
      // standard path; ANTHROPIC_AUTH_TOKEN (+ ANTHROPIC_BASE_URL) lets you front
      // the Messages API with a bearer token via a gateway/proxy instead of a key.
      const opts: { apiKey?: string; authToken?: string; baseURL?: string } = {};
      const apiKey = this.cfg.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (apiKey) opts.apiKey = apiKey;
      if (process.env.ANTHROPIC_AUTH_TOKEN) opts.authToken = process.env.ANTHROPIC_AUTH_TOKEN;
      if (process.env.ANTHROPIC_BASE_URL) opts.baseURL = process.env.ANTHROPIC_BASE_URL;
      this.client = new Anthropic(opts);
    }
    return this.client;
  }

  listSkills(): LoadedSkill[] {
    return this.skills;
  }

  /**
   * The system prompt plus an always-present, lightweight **skill index** — each
   * skill's name + one-line description (a few tokens each). This is what makes
   * the model aware of skills it can pull in; it loads any one's full SKILL.md on
   * demand via the invoke_skill tool. Stable across the session, so it caches
   * with the system block. Returns undefined when there's nothing to send.
   */
  private buildSystem(): string | undefined {
    if (this.systemCache === undefined) {
      const base = this.cfg.system ?? "";
      if (this.skills.length === 0) {
        this.systemCache = base;
      } else {
        const rows = this.skills.map(
          (s) => `- ${s.name}: ${s.frontmatter.description ?? "(no description)"}`,
        );
        const index = [
          "# Available skills",
          "",
          "These skills are available but NOT loaded — you see only each name and a one-line description here (a few tokens). When the task genuinely calls for one, call the `invoke_skill` tool with its exact name to pull the full SKILL.md guidance into context, then apply it. Load a skill only when you'll actually use it.",
          "",
          ...rows,
        ].join("\n");
        this.systemCache = base ? `${base}\n\n${index}` : index;
      }
    }
    return this.systemCache === "" ? undefined : this.systemCache;
  }

  /**
   * Build a skill's `{ type:"skill" }` block + its side-table record for a given
   * destination message index, and register its eviction metadata. Shared by
   * `injectSkill` (human, its own message) and the model's invoke_skill tool
   * (loads the body into the tool-results message mid-turn). Does NOT push.
   */
  private makeSkillBlock(
    name: string,
    messageIndex: number,
  ): { block: ContentBlock; record: SkillRecord } | null {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return null;

    const invocationId = `inv-${++this.invCounter}-${name}`;
    const block: ContentBlock = {
      type: "skill",
      skill_name: name,
      invocation_id: invocationId,
      body: skill.body,
    };
    const record: SkillRecord = {
      invocationId,
      skillName: name,
      messageIndex,
      tokenLen: skill.tokenLen,
      ephemeral: skill.frontmatter.ephemeral,
    };
    this.skillMeta.set(invocationId, {
      evictAfter: skill.frontmatter.evictAfter,
      stepInjected: this.step,
    });
    return { block, record };
  }

  /** Inject a skill's SKILL.md body as its own { type:"skill" } content block. */
  injectSkill(name: string): InjectResult {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return { ok: false, message: `No skill named "${name}". Try /skills.` };

    const made = this.makeSkillBlock(name, this.messages.length)!;
    this.messages.push({ role: "user", content: [made.block] });
    this.sideTable.push(made.record);

    return {
      ok: true,
      message: `Injected "${name}" (~${skill.tokenLen} tok, ephemeral=${skill.frontmatter.ephemeral}).`,
    };
  }

  /**
   * Surface a skill's SUMMARY (name + description) to the model as a suggestion,
   * WITHOUT loading its full body — progressive disclosure. The model then loads
   * the full SKILL.md on demand via invoke_skill. This is the human counterpart
   * to that flow (the /use, /<name>, mention, and picker paths). For a forced
   * full load (e.g. the cost harness's controlled measurement) use injectSkill.
   */
  suggestSkill(name: string): InjectResult {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return { ok: false, message: `No skill named "${name}". Try /skills.` };

    const desc = skill.frontmatter.description ?? "";
    this.messages.push({
      role: "user",
      content:
        `[Skill suggestion from the user: "${name}" — ${desc} ` +
        `Call invoke_skill("${name}") to load its full instructions if it is relevant to the task.]`,
    });
    return { ok: true, message: `Suggested "${name}" (summary only; the model can invoke_skill to load it).` };
  }

  /** Manual eviction (the /clear-skill command). `force` overrides the strict gate. */
  clearSkill(name: string, opts: { force?: boolean } = {}): ClearResult {
    const targets = this.sideTable.filter((r) => r.skillName === name && !r.evicted);
    if (targets.length === 0) return { ok: false, message: `No active skill "${name}" to clear.` };

    const res = clearSkillUses(this.messages, this.sideTable, {
      target: targets.map((r) => r.invocationId),
      force: opts.force,
    });

    if (res.appliedEdits.skillsEvicted === 0) {
      return {
        ok: false,
        message: `"${name}" is ephemeral:false — not cleared. Re-run with --force to override.`,
      };
    }

    const before = this.evictedIds();
    this.messages = res.messages;
    this.sideTable = res.sideTable;
    this.notePending(before, res.appliedEdits);
    return {
      ok: true,
      message: `Cleared "${name}" (~${res.appliedEdits.tokensFreed} tok freed, ${res.appliedEdits.tokensReprocessed} to reprocess once).`,
      appliedEdits: res.appliedEdits,
    };
  }

  /** Invocation ids of every skill currently evicted — a snapshot taken before an
   *  eviction so `notePending` can tell which records flipped this round. */
  private evictedIds(): Set<string> {
    return new Set(this.sideTable.filter((r) => r.evicted).map((r) => r.invocationId));
  }

  /**
   * Record an eviction's edits as pending and anchor the live re-link cut at the
   * EARLIEST skill that flipped to evicted this round (where the cached prefix `P`
   * breaks). Both clear together the moment the next request pays the reprocess.
   */
  private notePending(beforeEvicted: Set<string>, edits: AppliedEdits): void {
    this.pendingEdits = mergeEdits(this.pendingEdits, edits);
    const newly = this.sideTable.filter((r) => r.evicted && !beforeEvicted.has(r.invocationId));
    if (newly.length === 0) return;
    const earliest = Math.min(...newly.map((r) => r.messageIndex));
    this.pendingCutMsgIndex =
      this.pendingCutMsgIndex === undefined ? earliest : Math.min(this.pendingCutMsgIndex, earliest);
  }

  /** Rough total context size, in estimated tokens — includes the system prompt
   *  (sent as its own cached block), not just the message array. */
  contextTokens(): number {
    let total = this.cfg.system ? Math.ceil(this.cfg.system.length / 4) : 0;
    for (const m of this.messages) total += estimateMessageTokens(m);
    return total;
  }

  contextStats() {
    return {
      messageCount: this.messages.length,
      estimatedTokens: this.contextTokens(),
      skills: this.sideTable.map((r) => ({
        name: r.skillName,
        ephemeral: r.ephemeral,
        evicted: !!r.evicted,
        tokenLen: r.tokenLen,
      })),
    };
  }

  /**
   * Append-ordered view of the live context window as a stack of blocks —
   * `[sys] [you·1] [AI·1] [skill] [you·2] [AI·2] …` — in the exact order they
   * entered context. Each `ai` item carries its per-call steps (tool / wipe /
   * answer) so an agentic loop expands in place; a `skill` item flips to
   * `evicted` when its body is wiped. `cutIndex` marks the LIVE re-link: the
   * earliest skill in the current pending-reprocess batch, where the cached
   * prefix `P` ends. It is set only while a reprocess is owed (`pendingEdits`);
   * once the next request pays it the prefix is contiguous again and the cut
   * clears — the grey `✗` chip stays as the permanent "evicted" record.
   */
  contextStack(): ContextStack {
    const items: StackItem[] = [];
    if (this.cfg.system) {
      items.push({ kind: "system", label: "sys", tokens: Math.ceil(this.cfg.system.length / 4) });
    }

    const skillByIndex = new Map<number, SkillRecord>();
    for (const r of this.sideTable) skillByIndex.set(r.messageIndex, r);

    let userCount = 0;
    let aiCount = 0;
    let curAI: StackItem | null = null;
    // items[] position of the skill at pendingCutMsgIndex (the live re-link cut).
    let cutItemIdx: number | null = null;

    this.messages.forEach((m, i) => {
      const rec = skillByIndex.get(i);
      if (rec) {
        if (i === this.pendingCutMsgIndex) cutItemIdx = items.length;
        items.push({
          kind: "skill",
          label: rec.skillName,
          tokens: rec.evicted ? estimateMessageTokens(m) : rec.tokenLen,
          evicted: !!rec.evicted,
        });
        curAI = null;
        return;
      }

      const blocks = Array.isArray(m.content) ? m.content : [];
      if (m.role === "user") {
        const isToolResult = blocks.some((b) => (b as ContentBlock).type === "tool_result");
        if (isToolResult) return; // a tool round inside the open AI loop — not its own block
        userCount++;
        items.push({ kind: "user", label: `you·${userCount}`, tokens: estimateMessageTokens(m) });
        curAI = null;
        return;
      }

      // assistant: one model call = one step inside the current AI loop.
      if (!curAI) {
        aiCount++;
        curAI = { kind: "ai", label: `AI·${aiCount}`, tokens: 0, steps: [] };
        items.push(curAI);
      }
      const tool = blocks.some((b) => (b as ContentBlock).type === "tool_use");
      curAI.steps!.push(tool ? "tool" : "answer");
      curAI.tokens += estimateMessageTokens(m);
    });

    // The cut is the live re-link only — meaningless once the reprocess settles.
    const cutIndex = this.pendingEdits !== undefined ? cutItemIdx : null;

    return { items, cutIndex, reprocessPending: this.pendingEdits !== undefined };
  }

  /** A JSON-serializable snapshot of all mutable state (see AgentSnapshot). */
  snapshot(): AgentSnapshot {
    return {
      messages: this.messages,
      sideTable: this.sideTable,
      usageLog: this.usageLog,
      step: this.step,
      invCounter: this.invCounter,
      skillMeta: [...this.skillMeta.entries()],
      pendingEdits: this.pendingEdits,
      pendingCutMsgIndex: this.pendingCutMsgIndex,
    };
  }

  /** Rehydrate from a `snapshot()` (deep-copied, so the caller's object isn't
   *  aliased into live state). Construct the agent with the same skills/system,
   *  then `restore()` to continue the conversation. */
  restore(s: AgentSnapshot): void {
    const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
    this.messages = clone(s.messages) ?? [];
    this.sideTable = clone(s.sideTable) ?? [];
    this.usageLog = clone(s.usageLog) ?? [];
    this.step = s.step ?? 0;
    this.invCounter = s.invCounter ?? 0;
    this.skillMeta = new Map(clone(s.skillMeta) ?? []);
    this.pendingEdits = clone(s.pendingEdits);
    this.pendingCutMsgIndex = s.pendingCutMsgIndex;
  }

  /** Run one user turn through the agentic tool loop. Requires an API key. */
  async send(userText: string, opts: SendOptions = {}): Promise<{ text: string; usage: UsageRecord[] }> {
    this.step++;
    this.messages.push({ role: "user", content: userText });

    if (this.cfg.autoTriggers) {
      // Policy trigger (token threshold) — prune an over-budget context before
      // we pay to process it. (The frontmatter `evict-after: used` trigger fires
      // at the END of the turn that uses a skill — see below.)
      this.applyThresholdTrigger();
    }

    const usage: UsageRecord[] = [];
    let finalText = "";
    let guard = 0;

    // Stream text deltas to the caller as one growing string across the whole
    // turn (so any pre-tool narration stays visible alongside the final answer).
    let streamed = "";
    const onText = opts.onDelta
      ? (delta: string) => {
          streamed += delta;
          opts.onDelta!(streamed);
        }
      : undefined;

    while (guard++ < TOOL_LOOP_GUARD) {
      const label = `turn ${this.step}${guard > 1 ? "." + guard : ""}`;
      const resp = await this.callModel(label, usage, onText);
      this.messages.push({ role: "assistant", content: resp.content as unknown as ContentBlock[] });

      if (resp.stop_reason !== "tool_use") {
        finalText = collectText(resp.content);
        break;
      }

      const toolResults: ContentBlock[] = [];
      // Skill bodies loaded by invoke_skill this round — appended to the
      // tool-results message so they enter context as their own skill blocks.
      const loadedBlocks: ContentBlock[] = [];
      // Index the tool-results message will land at (its blocks include the
      // loaded skills), so the side-table records point at the right message.
      const resultsIndex = this.messages.length;

      // Skills the model loaded this round — fired to onSkillInvoke AFTER the
      // block is live in `this.messages` (below), so a realtime re-render shows
      // the full-size skill block the instant it lands, mid-loop.
      const invokedNames: string[] = [];

      for (const block of resp.content) {
        const b = block as unknown as { type: string; id: string; name: string; input: unknown };
        if (b.type !== "tool_use") continue;

        if (b.name === invokeSkillToolDef.name) {
          const name = (b.input as { skill_name?: string }).skill_name ?? "";
          const made = this.makeSkillBlock(name, resultsIndex);
          if (made) {
            loadedBlocks.push(made.block);
            this.sideTable.push(made.record);
            invokedNames.push(name);
            toolResults.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `Loaded skill "${name}" (~${made.record.tokenLen} tok) — its full guidance is now in context. Apply it.`,
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `No skill named "${name}". Available: ${this.skills.map((s) => s.name).join(", ")}.`,
              is_error: true,
            });
          }
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: `Unknown tool: ${b.name}`,
            is_error: true,
          });
        }
      }
      this.messages.push({ role: "user", content: [...toolResults, ...loadedBlocks] });
      // Now the block is in the live message array, so contextStack() renders it
      // at full size — notify so the CLI repaints before the next model call.
      for (const name of invokedNames) this.cfg.onSkillInvoke?.(name);
    }

    // Deterministic frontmatter trigger: this turn has now consumed any live
    // `evict-after: used` skill, so wipe it NOW — at the end of the turn that
    // used it. It stayed at full size for the whole turn; the one-time reprocess
    // lands on the next request (the first to send the stub), which is where the
    // cut re-links. Not model-driven.
    if (this.cfg.autoTriggers) this.evictUsedSkills();

    // When streaming, return everything the caller already saw (incl. any
    // pre-tool narration), so the settled transcript matches the live text.
    return { text: onText ? streamed || finalText : finalText, usage };
  }

  // --- internals --------------------------------------------------------------

  private async callModel(
    label: string,
    usage: UsageRecord[],
    onText?: (delta: string) => void,
  ): Promise<Anthropic.Message> {
    const client = this.getClient();

    // The model's only tool is invoke_skill (progressive disclosure). Eviction is
    // deterministic (frontmatter / threshold) + human /clear-skill — never a tool
    // the model calls, mirroring clear_tool_uses (a context-management strategy).
    const req: Record<string, unknown> = {
      model: this.cfg.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: this.cfg.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: buildAnthropicMessages(this.messages),
      tools: [invokeSkillToolDef].map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    };
    const sys = this.buildSystem();
    if (sys) {
      req.system = [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }];
    }
    if (this.cfg.thinking) req.thinking = { type: "adaptive" };

    // Stream so the CLI can paint text as it arrives; finalMessage() still gives
    // the assembled Message (with cache usage) for the tool loop + accounting.
    const stream = client.messages.stream(req as unknown as Anthropic.MessageStreamParams);
    if (onText) stream.on("text", (delta: string) => onText(delta));
    const resp = (await stream.finalMessage()) as Anthropic.Message;

    // Cache-token fields are returned on the wire whenever caching is active;
    // type them structurally so this compiles across SDK versions.
    const u = resp.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    const rec: UsageRecord = {
      step: label,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      appliedEdits: this.pendingEdits,
    };
    // The reprocess for any pending eviction is paid by this very request, so the
    // cut/rebuilt indicators settle: the re-linked prefix is warm again.
    this.pendingEdits = undefined;
    this.pendingCutMsgIndex = undefined;
    this.usageLog.push(rec);
    usage.push(rec);
    this.cfg.onUsage?.(rec);
    return resp;
  }

  /** Token-threshold policy trigger — cost-gated, oldest-first. Runs before a send. */
  private applyThresholdTrigger(): void {
    const threshold = this.cfg.thresholdTokens ?? Infinity;
    if (this.contextTokens() > threshold) {
      const M = estimateTail(threshold, Math.max(1, this.avgStepTokens()));
      const before = this.evictedIds();
      const res = clearSkillUses(this.messages, this.sideTable, { estimatedTail: M });
      this.messages = res.messages;
      this.sideTable = res.sideTable;
      this.notePending(before, res.appliedEdits);
    }
  }

  /**
   * Deterministic `evict-after: used` eviction — runs at the END of a turn,
   * wiping every live ephemeral skill whose frontmatter says `evict-after: used`.
   * The skill stayed at full size for the entire turn that used it; this evicts
   * it the instant that turn finishes. Fully harness-driven — there is no model
   * tool for eviction. The one-time reprocess is paid on the next request — the
   * first to send the stub — which is where the cut re-links.
   */
  private evictUsedSkills(): void {
    const targets = this.sideTable.filter((r) => {
      if (r.evicted || !r.ephemeral) return false;
      const meta = this.skillMeta.get(r.invocationId);
      return meta?.evictAfter?.kind === "used";
    });
    if (targets.length === 0) return;

    const before = this.evictedIds();
    const res = clearSkillUses(this.messages, this.sideTable, {
      target: targets.map((r) => r.invocationId),
    });
    if (res.appliedEdits.skillsEvicted === 0) return;

    this.messages = res.messages;
    this.sideTable = res.sideTable;
    this.notePending(before, res.appliedEdits);
    this.cfg.onAutoEvict?.([...new Set(targets.map((r) => r.skillName))], res.appliedEdits);
  }

  private avgStepTokens(): number {
    return this.step <= 0 ? this.contextTokens() : this.contextTokens() / this.step;
  }
}

// --- module-level helpers -----------------------------------------------------

function estimateMessageTokens(m: Message): number {
  return typeof m.content === "string"
    ? Math.ceil(m.content.length / 4)
    : Math.ceil(JSON.stringify(m.content).length / 4);
}

function collectText(content: unknown[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
    .map((b) => b.text)
    .join("\n");
}

function mergeEdits(a: AppliedEdits | undefined, b: AppliedEdits): AppliedEdits {
  if (!a) return b;
  return {
    skillsEvicted: a.skillsEvicted + b.skillsEvicted,
    tokensFreed: a.tokensFreed + b.tokensFreed,
    tokensReprocessed: a.tokensReprocessed + b.tokensReprocessed,
  };
}

/** Render a { type:"skill" } block to the text the model actually sees. */
function renderSkillBlock(b: ContentBlock): string {
  const name = (b.skill_name as string) ?? "skill";
  const id = (b.invocation_id as string) ?? "";
  const body = (b.body as string) ?? "";
  return `<skill name="${name}"${id ? ` id="${id}"` : ""}>\n${body}\n</skill>`;
}

function convertContent(content: string | ContentBlock[]): Record<string, unknown>[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((b) =>
    b.type === "skill" ? { type: "text", text: renderSkillBlock(b) } : (b as Record<string, unknown>),
  );
}

/**
 * Convert internal messages → Anthropic params:
 *  - render skill blocks to text (the API has no "skill" block type),
 *  - merge consecutive same-role messages (keeps the API happy + the prefix stable),
 *  - place a rolling cache breakpoint on the last block (caches the stable prefix P;
 *    when a mid-array skill becomes a stub, the prefix match breaks there → ω·X once,
 *    and every later read is ≈ρ·s smaller).
 */
function buildAnthropicMessages(messages: Message[]): { role: string; content: Record<string, unknown>[] }[] {
  const out: { role: string; content: Record<string, unknown>[] }[] = [];
  for (const m of messages) {
    const blocks = convertContent(m.content);
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  if (out.length) {
    const lastMsg = out[out.length - 1];
    const i = lastMsg.content.length - 1;
    if (i >= 0) lastMsg.content[i] = { ...lastMsg.content[i], cache_control: { type: "ephemeral" } };
  }
  return out;
}
