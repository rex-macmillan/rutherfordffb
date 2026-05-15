import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse } from "../../lib/anthropic";
import { systemBlocks } from "../../lib/aiPrompts";

interface SidePlayer {
  playerId: string;
  name: string;
  position: string;
  teamAbbr: string;
  pprRank: number | null;
  keeperRound: number | null;
}

interface SideRoster {
  teamName: string;
  roster: SidePlayer[];
  /** Player ids currently saved as keepers for this team. */
  savedKeeperIds: string[];
  /** Rounds this team is missing from trades. */
  missingPicks: number[];
  extraPicks: number[];
  /** Whether this team has already paid the 50% insurance fee this season. */
  insuranceFeeAlreadyPaid?: boolean;
}

interface TradeProposal {
  /** Players going FROM A TO B */
  aSendsPlayers: string[]; // playerIds
  /** Rounds (this season) A is sending to B */
  aSendsPicks: number[];
  bSendsPlayers: string[];
  bSendsPicks: number[];
}

interface RequestBody {
  teamA: SideRoster;
  teamB: SideRoster;
  trade: TradeProposal;
  season: string;
}

const EVAL_TOOL = {
  name: "submit_evaluation",
  description: "Submit a structured analysis of the proposed trade.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: {
        type: "string",
        enum: ["fair", "team_a_wins", "team_b_wins"],
      },
      confidenceNote: {
        type: "string",
        description:
          "Short note on how confident you are and what would shift the verdict.",
      },
      teamA: { $ref: "#/definitions/sideAnalysis" },
      teamB: { $ref: "#/definitions/sideAnalysis" },
      keeperEconomics: {
        type: "string",
        description:
          "Explanation of how keeper costs change for each side after this trade. Mention the §2 escalation rule if any acquired player has been kept before. Mention if a side is acquiring a keeper-eligible bargain.",
      },
      pickIntegrity: {
        type: "string",
        description:
          "Per §6: does either side now have a keeper whose natural round was traded away? Will their keeper slide up? Concrete: 'Team A keeps Olave (R4) but traded their R4 — Olave slides to their R3, displacing X if applicable.'",
      },
      insuranceFee: {
        type: "string",
        description:
          "Per §6: which side(s) trigger the 50% insurance fee. Note explicitly if either side has already paid it this season.",
      },
      recommendation: {
        type: "string",
        description:
          "2-4 sentence final recommendation in plain language.",
      },
    },
    required: [
      "verdict",
      "confidenceNote",
      "teamA",
      "teamB",
      "keeperEconomics",
      "pickIntegrity",
      "insuranceFee",
      "recommendation",
    ],
    definitions: {
      sideAnalysis: {
        type: "object",
        properties: {
          immediateValueDelta: {
            type: "string",
            description:
              "Net value gain/loss for this side based on PPR ranks. Example: '+R32 → -R56 net = -24 ranks'.",
          },
          assetsGained: {
            type: "array",
            items: { type: "string" },
          },
          assetsLost: {
            type: "array",
            items: { type: "string" },
          },
          fitNote: {
            type: "string",
            description: "How well the gained assets fit this side's roster shape.",
          },
        },
        required: ["immediateValueDelta", "assetsGained", "assetsLost", "fitNote"],
      },
    },
  },
};

const playerOneLine = (p: SidePlayer) =>
  `${p.name} (${p.position} ${p.teamAbbr}, PPR rank ${
    p.pprRank ?? "—"
  }, keeper R${p.keeperRound ?? "—"})`;

function formatSide(side: SideRoster, label: "A" | "B") {
  const savedSet = new Set(side.savedKeeperIds);
  const roster = side.roster
    .map((p) => `  - ${playerOneLine(p)}${savedSet.has(p.playerId) ? " [saved keeper]" : ""}`)
    .join("\n");
  return `Team ${label}: ${side.teamName}
${roster}
  Picks: ${side.extraPicks.length ? `+${side.extraPicks.map((r) => `R${r}`).join(",")} ` : ""}${
    side.missingPicks.length ? `-${side.missingPicks.map((r) => `R${r}`).join(",")}` : ""
  } (baseline: 1 pick per round)
  Insurance fee paid this season: ${side.insuranceFeeAlreadyPaid ? "yes" : "no"}`;
}

function describeTrade(req: RequestBody) {
  const lookup = (id: string) =>
    req.teamA.roster.find((p) => p.playerId === id) ??
    req.teamB.roster.find((p) => p.playerId === id);

  const fmt = (ids: string[]) =>
    ids.length
      ? ids.map((id) => playerOneLine(lookup(id)!)).join(", ")
      : "(none)";
  const fmtPicks = (picks: number[]) =>
    picks.length ? picks.map((r) => `R${r}`).join(",") + ` ${req.season} pick(s)` : "(none)";

  return `Team A sends to Team B:
  Players: ${fmt(req.trade.aSendsPlayers)}
  Picks: ${fmtPicks(req.trade.aSendsPicks)}

Team B sends to Team A:
  Players: ${fmt(req.trade.bSendsPlayers)}
  Picks: ${fmtPicks(req.trade.bSendsPicks)}`;
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

  const body = req.body as RequestBody;
  if (!body?.teamA || !body?.teamB || !body?.trade) {
    return res
      .status(400)
      .json({ error: "bad_request", message: "teamA, teamB, trade required" });
  }

  const userPrompt = `Evaluate this proposed offseason trade. Season: ${body.season}.

${formatSide(body.teamA, "A")}

${formatSide(body.teamB, "B")}

Proposed trade:
${describeTrade(body)}

Analyze step by step, then call submit_evaluation. Pay special attention to:
- Whether either side is acquiring a player whose keeper cost is meaningfully out of step with their PPR rank.
- Whether either side ends up with a keeper that needs to slide per §6 (a keeper whose natural round is now missing).
- Whether the §3 duplicate-round rule will force a sliding chain on either side after the trade.
- Whether the trade triggers the 50% insurance fee for either side (per §6, only the FIRST outgoing pick of the season triggers it).`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.reasoning, // Opus for the harder rule reasoning.
      max_tokens: 3072,
      system: systemBlocks(),
      tools: [EVAL_TOOL],
      tool_choice: { type: "tool", name: "submit_evaluation" },
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
    console.error("trade evaluator error:", e);
    return res
      .status(500)
      .json({ error: "anthropic_error", message: e?.message ?? "Unknown error" });
  }
}
