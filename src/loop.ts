/**
 * SkillAgent — the reference Agent SDK loop (Layer A, the SDK "edges").
 *
 * Ties the pure core together with the live Messages API:
 *  - injects a skill as its own { type:"skill" } block (NOT a tool_result),
 *  - runs the agentic tool loop (incl. the model-invocable clear_skill tool),
 *  - fires the eviction triggers (evict-after / threshold) before each send,
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
import { clearSkillToolDef, handleClearSkill } from "./tools/clearSkill";

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
export type StackStepKind = "tool" | "wipe" | "answer";

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
  private skillMeta = new Map<string, { evictAfter?: EvictAfter; stepInjected: number }>();
  private pendingEdits?: AppliedEdits;

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

  /** Inject a skill's SKILL.md body as its own { type:"skill" } content block. */
  injectSkill(name: string): InjectResult {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return { ok: false, message: `No skill named "${name}". Try /skills.` };

    const invocationId = `inv-${++this.invCounter}-${name}`;
    const block: ContentBlock = {
      type: "skill",
      skill_name: name,
      invocation_id: invocationId,
      body: skill.body,
    };
    this.messages.push({ role: "user", content: [block] });
    const messageIndex = this.messages.length - 1;

    this.sideTable.push({
      invocationId,
      skillName: name,
      messageIndex,
      tokenLen: skill.tokenLen,
      ephemeral: skill.frontmatter.ephemeral,
    });
    this.skillMeta.set(invocationId, {
      evictAfter: skill.frontmatter.evictAfter,
      stepInjected: this.step,
    });

    return {
      ok: true,
      message: `Injected "${name}" (~${skill.tokenLen} tok, ephemeral=${skill.frontmatter.ephemeral}).`,
    };
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

    this.messages = res.messages;
    this.sideTable = res.sideTable;
    this.pendingEdits = mergeEdits(this.pendingEdits, res.appliedEdits);
    return {
      ok: true,
      message: `Cleared "${name}" (~${res.appliedEdits.tokensFreed} tok freed, ${res.appliedEdits.tokensReprocessed} to reprocess once).`,
      appliedEdits: res.appliedEdits,
    };
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
   * `evicted` when its body is wiped. `cutIndex` marks the earliest wiped skill:
   * the point where the cached prefix `P` ends and the KV cache was re-linked.
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

    this.messages.forEach((m, i) => {
      const rec = skillByIndex.get(i);
      if (rec) {
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
      const tool = blocks.find((b) => (b as ContentBlock).type === "tool_use") as
        | { name?: string }
        | undefined;
      const step: StackStepKind = !tool
        ? "answer"
        : tool.name === clearSkillToolDef.name
          ? "wipe"
          : "tool";
      curAI.steps!.push(step);
      curAI.tokens += estimateMessageTokens(m);
    });

    let cutIndex: number | null = null;
    for (let k = 0; k < items.length; k++) {
      if (items[k]!.kind === "skill" && items[k]!.evicted) {
        cutIndex = k;
        break;
      }
    }

    return { items, cutIndex, reprocessPending: this.pendingEdits !== undefined };
  }

  /** Run one user turn through the agentic tool loop. Requires an API key. */
  async send(userText: string, opts: SendOptions = {}): Promise<{ text: string; usage: UsageRecord[] }> {
    this.step++;
    this.messages.push({ role: "user", content: userText });

    // Triggers fire "before each send" (PRD §6/§8).
    if (this.cfg.autoTriggers) this.applyAutoTriggers();

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
      for (const block of resp.content) {
        const b = block as unknown as { type: string; id: string; name: string; input: unknown };
        if (b.type !== "tool_use") continue;

        if (b.name === clearSkillToolDef.name) {
          const outcome = handleClearSkill(b.input as { skill_name: string }, this.messages, this.sideTable);
          if (outcome.ok && outcome.result) {
            this.messages = outcome.result.messages;
            this.sideTable = outcome.result.sideTable;
            this.pendingEdits = mergeEdits(this.pendingEdits, outcome.result.appliedEdits);
          }
          toolResults.push({ type: "tool_result", tool_use_id: b.id, content: outcome.toolResultText });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: `Unknown tool: ${b.name}`,
            is_error: true,
          });
        }
      }
      this.messages.push({ role: "user", content: toolResults });
    }

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

    const req: Record<string, unknown> = {
      model: this.cfg.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: this.cfg.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: buildAnthropicMessages(this.messages),
      tools: [
        {
          name: clearSkillToolDef.name,
          description: clearSkillToolDef.description,
          input_schema: clearSkillToolDef.input_schema,
        },
      ],
    };
    if (this.cfg.system) {
      req.system = [{ type: "text", text: this.cfg.system, cache_control: { type: "ephemeral" } }];
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
    this.pendingEdits = undefined;
    this.usageLog.push(rec);
    usage.push(rec);
    this.cfg.onUsage?.(rec);
    return resp;
  }

  /** evict-after: used + token-threshold triggers (policy). */
  private applyAutoTriggers(): void {
    // 1. evict-after: used — ephemeral skills injected on an earlier step.
    const used = this.sideTable
      .filter((r) => {
        if (r.evicted || !r.ephemeral) return false;
        const meta = this.skillMeta.get(r.invocationId);
        return meta?.evictAfter?.kind === "used" && meta.stepInjected < this.step;
      })
      .map((r) => r.invocationId);

    if (used.length) {
      const res = clearSkillUses(this.messages, this.sideTable, { target: used });
      this.messages = res.messages;
      this.sideTable = res.sideTable;
      this.pendingEdits = mergeEdits(this.pendingEdits, res.appliedEdits);
    }

    // 2. token threshold — policy mode, cost-gated, oldest-first.
    const threshold = this.cfg.thresholdTokens ?? Infinity;
    if (this.contextTokens() > threshold) {
      const M = estimateTail(threshold, Math.max(1, this.avgStepTokens()));
      const res = clearSkillUses(this.messages, this.sideTable, { estimatedTail: M });
      this.messages = res.messages;
      this.sideTable = res.sideTable;
      this.pendingEdits = mergeEdits(this.pendingEdits, res.appliedEdits);
    }
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
