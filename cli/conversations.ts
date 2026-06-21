/**
 * Conversation persistence — the on-disk format + helpers shared by the CLI
 * (`/resume`, autosave) and the mock generator.
 *
 * Format: one JSON document per conversation under `conversations/`, rewritten
 * after each settled turn. A document is self-contained:
 *   - `agent` — a SkillAgent.snapshot() (messages, side-table, usage, counters):
 *     everything the model + visualizer need to continue exactly where it left off.
 *   - `transcript` — the CLI's rendered chat entries, so the chat redraws verbatim
 *     (skill / system / usage lines aren't all reconstructable from the messages).
 * JSON (not JSONL) because a turn mutates earlier state — eviction flips a skill's
 * `evicted` flag and rewrites its block — so the whole document is rewritten, not
 * appended. Conversations are small, so a full rewrite per turn is trivial.
 */

import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import type { AgentSnapshot } from "../src/index";

export type EntryKind = "user" | "assistant" | "system" | "usage" | "error" | "skill";

export interface Entry {
  id: number;
  kind: EntryKind;
  text: string;
}

export interface SavedConversation {
  version: 1;
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  transcript: Entry[];
  agent: AgentSnapshot;
}

export const conversationsDir = fileURLToPath(new URL("../conversations", import.meta.url));

/** A filesystem-safe, readable slug from free text (e.g. the first message). */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "chat"
  );
}

/** A sortable, unique-enough id: ISO timestamp (to the second) + a title slug. */
export function newConversationId(firstMessage: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${stamp}_${slugify(firstMessage)}`;
}

/** Write (or overwrite) one conversation document. Creates the dir on demand. */
export function saveConversation(conv: SavedConversation): void {
  if (!existsSync(conversationsDir)) mkdirSync(conversationsDir, { recursive: true });
  writeFileSync(`${conversationsDir}/${conv.id}.json`, JSON.stringify(conv, null, 2), "utf-8");
}

/** All saved conversations, newest first. Corrupt/foreign files are skipped. */
export function listConversations(): SavedConversation[] {
  if (!existsSync(conversationsDir)) return [];
  const out: SavedConversation[] = [];
  for (const f of readdirSync(conversationsDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(readFileSync(`${conversationsDir}/${f}`, "utf-8")) as SavedConversation;
      if (c && Array.isArray(c.transcript) && c.agent) out.push(c);
    } catch {
      // skip unreadable / corrupt files
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Number of human turns in a conversation (for the /resume list). */
export function turnCount(conv: SavedConversation): number {
  return conv.transcript.filter((e) => e.kind === "user").length;
}
