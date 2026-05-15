import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse, unwrapToolInput } from "../../lib/anthropic";
import { systemBlocks } from "../../lib/aiPrompts";

interface RosterPlayer {
  playerId: string;
  name: string;
  position: string;
  teamAbbr: string;
  pprRank: number | null;
  keeperRound: number | null;
  prevKeeper?: boolean;
  valueScore?: number | null;
}

interface AdvisorRequest {
  teamName: string;
  managerName?: string;
  roster: RosterPlayer[];
  /** All rostered players league-wide — used to compute positional ranks
      so QB / TE keepers aren't penalized by their deflated overall PPR
      rank. Optional; if missing, advisor falls back to overall rank only. */
  leagueWidePool?: RosterPlayer[];
  missingPicks: number[];
  extraPicks: number[];
}

const RECOMMEND_TOOL = {
  name: "submit_recommendation",
  description: "Submit the final keeper recommendation for this team.",
  input_schema: {
    type: "object" as const,
    properties: {
      recommendedKeepers: {
        type: "array",
        description:
          "Between 0 and 4 players you'd actually keep. Each must reference a playerId from the roster.",
        items: {
          type: "object",
          properties: {
            playerId: { type: "string" },
            name: { type: "string" },
            keeperRound: { type: "number" },
            rationale: {
              type: "string",
              description:
                "1-2 sentences explaining why this player at this round is a strong keep.",
            },
          },
          required: ["playerId", "name", "keeperRound", "rationale"],
        },
      },
      alternatives: {
        type: "array",
        description:
          "Borderline players that didn't make the cut but are close. Up to 3.",
        items: {
          type: "object",
          properties: {
            playerId: { type: "string" },
            name: { type: "string" },
            keeperRound: { type: "number" },
            reason: { type: "string" },
          },
          required: ["playerId", "name", "keeperRound", "reason"],
        },
      },
      keeperCountAdvice: {
        type: "string",
        description:
          "Discussion of how many keepers to take given the 3rd/4th keeper entry-fee cost (+$50/+$75). Explain whether spending the extra is worth it for THIS roster.",
      },
      keyConsiderations: {
        type: "array",
        items: { type: "string" },
        description:
          "Bullet-style insights: pick-slide-up implications, consecutive-keep escalation risk, undervalued late-round keepers, etc.",
      },
      riskAssessment: {
        type: "string",
        description:
          "Brief on the riskiest part of the recommendation — injury concerns, age cliff, schedule, ADP volatility.",
      },
    },
    required: [
      "recommendedKeepers",
      "alternatives",
      "keeperCountAdvice",
      "keyConsiderations",
      "riskAssessment",
    ],
  },
};

/**
 * Build a playerId → positional rank map from a league-wide player pool.
 * QBs are ordered among QBs, RBs among RBs, etc. This is what we use to
 * normalize value — overall PPR rank deflates QBs and TEs because they
 * don't catch as many passes, so a QB at overall rank 92 is actually
 * QB12-ish (a real starter), not a bench scrub.
 */
function buildPositionalRanks(pool: RosterPlayer[]): Map<string, number> {
  const byPos = new Map<string, RosterPlayer[]>();
  for (const p of pool) {
    if (p.pprRank == null) continue;
    if (!byPos.has(p.position)) byPos.set(p.position, []);
    byPos.get(p.position)!.push(p);
  }
  const out = new Map<string, number>();
  byPos.forEach((arr) => {
    arr.sort((a, b) => (a.pprRank ?? 9999) - (b.pprRank ?? 9999));
    arr.forEach((p, idx) => out.set(p.playerId, idx + 1));
  });
  return out;
}

function formatRoster(
  roster: RosterPlayer[],
  posRanks: Map<string, number>,
): string {
  const sorted = [...roster].sort((a, b) => (a.pprRank ?? 9999) - (b.pprRank ?? 9999));
  return sorted
    .map((p) => {
      const posRank = posRanks.get(p.playerId);
      const posLabel = posRank ? `${p.position}${posRank}` : p.position;
      return `- ${p.name} (${posLabel}, ${p.teamAbbr}) | overall PPR: ${
        p.pprRank ?? "—"
      } | Keeper cost: R${p.keeperRound ?? "—"}${
        p.prevKeeper ? " [escalated due to consecutive keeps]" : ""
      } | playerId: ${p.playerId}`;
    })
    .join("\n");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!anthropic) {
    const r = notConfiguredResponse();
    return res.status(r.status).json(r.body);
  }

  const body = req.body as AdvisorRequest;
  if (!body?.roster?.length) {
    return res
      .status(400)
      .json({ error: "missing_roster", message: "roster is required" });
  }

  // Compute positional ranks from the league-wide pool when available, so
  // the player labels show QB12 / TE7 etc instead of just position letters.
  // Falls back to roster-only ranks when the league pool isn't passed.
  const posRanks = buildPositionalRanks(body.leagueWidePool ?? body.roster);

  const userPrompt = `Team: ${body.teamName}${
    body.managerName ? ` (manager: ${body.managerName})` : ""
  }

Current roster (each player annotated with positional rank — QB12 means he's the 12th-best QB league-wide, NOT his overall position):
${formatRoster(body.roster, posRanks)}

Draft pick situation for this team:
- Extra picks gained via trade: ${body.extraPicks.length ? body.extraPicks.map((r) => `R${r}`).join(", ") : "none"}
- Missing picks (traded away): ${body.missingPicks.length ? body.missingPicks.map((r) => `R${r}`).join(", ") : "none"}

IMPORTANT — how to read the value of each player:

  Overall PPR rank deflates QBs and TEs because they accrue fewer points
  in PPR scoring. So a QB at overall rank 92 might be QB12 (a real
  fantasy starter) — at R10 keeper cost that's positive equity, not
  garbage. Conversely, a WR at overall rank 92 is WR40-ish (deep bench).
  Use the positional rank annotated next to each player, NOT just the
  overall rank, when judging value-at-keeper-cost. Especially for QB and
  TE, where positional scarcity matters more than overall rank.

Recommend which keepers this manager should declare. Account for:
1. Value at the keeper cost — compare POSITIONAL rank vs the round they'd cost.
   A QB12 at R10 is roughly fair-to-positive equity. A QB6 at R8 is great.
2. Position scarcity — elite TE or QB1 are scarcer than another WR.
3. The §6 slide-up rule if any missing picks would force keepers to slide.
4. The §3 duplicate-round rule if multiple keepers share the same cost.
5. Entry-fee economics — is the 3rd (+$50) or 4th (+$75) keeper worth it?
   Frame this as "the 4th keeper costs $75 of cash + an Rx pick; is the
   surplus value of THIS specific Rx player worth that?"
6. Consecutive-keep escalation for next year — flag anyone whose cost will
   rise meaningfully if kept twice in a row.

Make sure to evaluate EVERY position group, including QBs and TEs at their
positional ranks. Do not skip a player just because their overall rank looks
low — re-read their positional rank first.

Call submit_recommendation with your structured analysis.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.balanced,
      max_tokens: 2048,
      system: systemBlocks(),
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: "tool", name: "submit_recommendation" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return res.status(502).json({
        error: "no_tool_use",
        message: "Model did not return structured output.",
      });
    }

    return res.status(200).json({
      result: unwrapToolInput(toolUse.input, "recommendedKeepers"),
      usage: response.usage,
    });
  } catch (e: any) {
    console.error("advisor error:", e);
    return res
      .status(500)
      .json({ error: "anthropic_error", message: e?.message ?? "Unknown error" });
  }
}
