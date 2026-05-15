import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse } from "../../lib/anthropic";
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

function formatRoster(roster: RosterPlayer[]): string {
  const sorted = [...roster].sort((a, b) => (a.pprRank ?? 9999) - (b.pprRank ?? 9999));
  return sorted
    .map(
      (p) =>
        `- ${p.name} (${p.position}, ${p.teamAbbr}) | PPR rank: ${
          p.pprRank ?? "—"
        } | Keeper cost: R${p.keeperRound ?? "—"}${
          p.prevKeeper ? " [escalated due to consecutive keeps]" : ""
        } | playerId: ${p.playerId}`,
    )
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

  const userPrompt = `Team: ${body.teamName}${
    body.managerName ? ` (manager: ${body.managerName})` : ""
  }

Current roster (with computed keeper costs already applied):
${formatRoster(body.roster)}

Draft pick situation for this team:
- Extra picks gained via trade: ${body.extraPicks.length ? body.extraPicks.map((r) => `R${r}`).join(", ") : "none"}
- Missing picks (traded away): ${body.missingPicks.length ? body.missingPicks.map((r) => `R${r}`).join(", ") : "none"}

Recommend which keepers this manager should declare. Account for:
1. Raw value at the keeper cost (compare PPR rank vs the round they'd cost).
2. The §6 slide-up rule if any missing picks would force keepers to slide earlier.
3. The §3 duplicate-round rule if multiple keepers share the same cost.
4. The entry-fee economics — is the 3rd ($150 → $225) or 4th ($150 → $300) keeper worth the cost?
5. Consecutive-keep escalation risk for next year.

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
      result: toolUse.input,
      usage: response.usage,
    });
  } catch (e: any) {
    console.error("advisor error:", e);
    return res
      .status(500)
      .json({ error: "anthropic_error", message: e?.message ?? "Unknown error" });
  }
}
