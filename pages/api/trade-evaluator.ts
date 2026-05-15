import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse, unwrapToolInput } from "../../lib/anthropic";
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

// Inlined twice on purpose — Anthropic's tool_use schema doesn't resolve
// JSON-Schema $ref, so trying to share via `definitions` made the model
// return empty objects for teamA/teamB.
const sideAnalysisSchema = {
  type: "object" as const,
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
};

const EVAL_TOOL = {
  name: "submit_evaluation",
  description: "Submit a structured analysis of the proposed trade.",
  input_schema: {
    type: "object" as const,
    properties: {
      // IMPORTANT: This field must be filled BEFORE the verdict. It forces
      // an explicit answer to the question "which side received more value"
      // so the verdict can't drift to the wrong team via single-shot
      // tool-call error.
      valueWinner: {
        type: "string",
        enum: ["a", "b", "neither"],
        description:
          "Which side ended up with MORE NET VALUE after accounting for keeper cost economics. 'a' = Team A received more value (Team B gave more away). 'b' = Team B received more value. 'neither' = within ~10% of each other. This MUST match the verdict (a → team_a_wins, b → team_b_wins, neither → fair).",
      },
      verdict: {
        type: "string",
        enum: ["fair", "team_a_wins", "team_b_wins"],
        description:
          "Derived from valueWinner. Use team_a_wins iff valueWinner === 'a'.",
      },
      confidenceNote: {
        type: "string",
        description:
          "Short note on how confident you are and what would shift the verdict.",
      },
      teamA: sideAnalysisSchema,
      teamB: sideAnalysisSchema,
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
      "valueWinner",
      "verdict",
      "confidenceNote",
      "teamA",
      "teamB",
      "keeperEconomics",
      "pickIntegrity",
      "insuranceFee",
      "recommendation",
    ],
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

Reason step by step BEFORE calling submit_evaluation:

STEP 1 — Inventory direction.
List exactly what each team RECEIVES (not what they had before). Be explicit:
  "Team A receives: <players + picks from Team B>"
  "Team B receives: <players + picks from Team A>"

STEP 2 — Rank the assets.
For each player moving in this trade, write one line:
  "<player> (PPR rank N, keeper cost RX) — keeper value: <how mispriced vs rank>"
A 6th-round keeper at PPR rank 11 (e.g. Achane R6) is one of the most valuable assets in the league. A 1st-round keeper at PPR rank 9 (e.g. Jeanty R1) is good but expensive. The cost-adjusted analysis often inverts raw rank.

STEP 3 — Sum value per side.
Add up the keeper-cost-adjusted value of what EACH SIDE RECEIVED. The side that received the most total cost-adjusted value is the winner.

STEP 4 — Sanity check.
Re-read STEP 1. The valueWinner you're about to submit MUST be the side that RECEIVED more, NOT the side that GAVE more. Common error: confusing "X gave up the more valuable asset" (which means X LOSES) with "X wins". If X gave up the more valuable asset, the OTHER side wins.

STEP 5 — Fill the tool.
Set valueWinner first ('a' if Team A received more value, 'b' if Team B received more value, 'neither' for within ~10%). Then set verdict to match (a→team_a_wins, b→team_b_wins, neither→fair). These two fields MUST be consistent.

Also analyze:
- Whether either side ends up with a keeper that needs to slide per §6 (a keeper whose natural round is now missing).
- Whether the §3 duplicate-round rule will force a sliding chain on either side.
- Whether the trade triggers the 50% insurance fee per §6 (only the FIRST outgoing pick of the season triggers it).`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.reasoning,
      max_tokens: 4096,
      temperature: 0, // deterministic for this critical reasoning task
      system: systemBlocks(),
      tools: [EVAL_TOOL],
      // tool_choice: 'any' lets the model think out loud first, then commit
      // to the tool when ready — instead of single-shot tool emission.
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return res.status(502).json({
        error: "no_tool_use",
        message: "Model did not return structured output.",
      });
    }

    const result: any = unwrapToolInput(toolUse.input, "verdict");

    // Enforce consistency: valueWinner is the source of truth, verdict
    // derives from it. If the model produced a mismatch, fix it server-side
    // so the UI never shows a contradictory pill.
    const derived: Record<string, string> = {
      a: "team_a_wins",
      b: "team_b_wins",
      neither: "fair",
    };
    if (result?.valueWinner && derived[result.valueWinner]) {
      const expected = derived[result.valueWinner];
      if (result.verdict !== expected) {
        result.verdict = expected;
        result.confidenceNote =
          (result.confidenceNote ? `${result.confidenceNote} ` : "") +
          `(verdict normalized from model output to match valueWinner=${result.valueWinner})`;
      }
    }

    return res.status(200).json({
      result,
      usage: response.usage,
    });
  } catch (e: any) {
    console.error("trade evaluator error:", e);
    return res
      .status(500)
      .json({ error: "anthropic_error", message: e?.message ?? "Unknown error" });
  }
}
