/**
 * Cached system context shared across all AI routes.
 *
 * The rulebook content is loaded once at import time and embedded into a
 * system message with `cache_control: { type: 'ephemeral' }` so Anthropic
 * caches it and subsequent requests pay ~10% of the input tokens for that
 * block. This matters because the rulebook is long and every AI feature
 * needs it as grounding.
 *
 * Server-only — only imported from /pages/api/*.
 */

import fs from "fs";
import path from "path";

let cachedRulebook: string | null = null;

export function getRulebook(): string {
  if (cachedRulebook) return cachedRulebook;
  const filePath = path.join(process.cwd(), "keeper_league_rulebook.md");
  cachedRulebook = fs.readFileSync(filePath, "utf-8");
  return cachedRulebook;
}

export const BASE_ROLE = `You are an expert fantasy football analyst for a specific 12-team PPR keeper league. The league has unusual rules that materially change how decisions should be made:

- Players can be kept indefinitely, but each consecutive keep escalates their cost via the round-mapping table.
- Trading away a draft pick triggers a 50% insurance fee on next year's buy-in.
- If your keeper's natural round is gone (traded away), they SLIDE UP to the next-earlier round you own — not down.
- If two of your keepers cost the same round, they stack into later rounds.
- Undrafted/waiver pickups default to a 6th-round keeper cost.
- The 3rd keeper costs +$50 over base, the 4th costs +$75.

You ground every recommendation in the rulebook below. Cite specific sections (e.g., "§6 slide-up rule") when the rule materially affects your answer.`;

/**
 * Build the standard system blocks for any AI route. The rulebook block is
 * marked cacheable so repeated calls re-use the cache.
 */
export function systemBlocks(extra?: string) {
  const blocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    {
      type: "text",
      text: BASE_ROLE,
    },
    {
      type: "text",
      text: `=== LEAGUE RULEBOOK ===\n\n${getRulebook()}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (extra) blocks.push({ type: "text", text: extra });
  return blocks;
}
