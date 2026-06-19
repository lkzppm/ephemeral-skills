/**
 * Skill loader — discovers and loads all SKILL.md files under a given
 * directory, returning typed LoadedSkill records ready for the agent loop.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSkillFrontmatter, type SkillFrontmatter } from "./frontmatter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadedSkill {
  /** Display / lookup name: frontmatter.name ?? subdirectory name. */
  name: string;
  frontmatter: SkillFrontmatter;
  body: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  /** Rough token estimate: Math.ceil(body.length / 4). */
  tokenLen: number;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scan `dir` for subdirectories that contain a `SKILL.md` file, parse each
 * one, and return the results sorted by name ascending.
 *
 * Returns an empty array if `dir` does not exist.
 */
export function loadSkills(dir: string): LoadedSkill[] {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const skills: LoadedSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    const raw = readFileSync(skillPath, "utf-8");
    const { frontmatter, body } = parseSkillFrontmatter(raw);

    const name = frontmatter.name ?? entry.name;
    const tokenLen = Math.ceil(body.length / 4);

    skills.push({ name, frontmatter, body, path: skillPath, tokenLen });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
