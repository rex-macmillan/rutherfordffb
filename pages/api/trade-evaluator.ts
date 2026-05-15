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
    // Field order matters: the model fills tool input top-to-bottom, so the
    // analysis fields come FIRST and the verdict is dead last. This forces
    // the model to do the full analysis before committing to who won.
    properties: {
      teamA: sideAnalysisSchema,
      teamB: sideAnalysisSchema,
      keeperEconomics: {
        type: "string",
        description:
          "Explanation of how keeper costs change for each side after this trade. Mention §2 escalation if any acquired player has been kept before. Identify if a side is acquiring a keeper-cost bargain.",
      },
      pickIntegrity: {
        type: "string",
        description:
          "Per §6: does either side now have a keeper whose natural round was traded away? Will their keeper slide up? Be concrete: 'Team A keeps Olave (R4) but traded their R4 — Olave slides to their R3.'",
      },
      insuranceFee: {
        type: "string",
        description:
          "Per §6: which side(s) trigger the 50% insurance fee. Note explicitly if either side has already paid it this season.",
      },
      recommendation: {
        type: "string",
        description:
          "2-4 sentence final recommendation in plain language. End with a statement of WHICH TEAM benefits more from this trade based on the analysis above.",
      },
      confidenceNote: {
        type: "string",
        description:
          "Short note on how confident you are and what would shift the verdict.",
      },
      // The verdict is the LAST field. Re-read everything above before
      // picking a value. The enum names are written to be literal answers to
      // the question \"who got more net value?\" so there is no ambiguity.
      verdict: {
        type: "string",
        enum: [
          "team_a_got_more_value",
          "team_b_got_more_value",
          "roughly_fair",
        ],
        description:
          "Final verdict. After reading your own analysis above (especially the recommendation field), pick the team that RECEIVED more net value (after accounting for keeper-cost economics). The side that GAVE UP the better asset is the loser. If the recommendation field said 'Team X is the clear winner' or similar, this verdict MUST be team_x_got_more_value.",
      },
    },
    required: [
      "teamA",
      "teamB",
      "keeperEconomics",
      "pickIntegrity",
      "insuranceFee",
      "recommendation",
      "confidenceNote",
      "verdict",
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

Fill the submit_evaluation tool's fields IN ORDER, top to bottom. Do the analysis BEFORE you fill the verdict (the verdict is the last field on purpose).

The key reasoning principle for THIS league:

  Raw PPR rank is only half the story. Keeper-cost economics often invert
  the rank-based winner. A R6 keeper at PPR rank 11 is one of the most
  valuable assets in the league — near-free elite production. A R1 keeper
  at PPR rank 9 is good but pays maximum cost every year. When two players
  of similar rank are exchanged at very different keeper costs, the side
  receiving the cheaper-keeper player almost always wins on cost-adjusted
  value.

Critical direction check (this is where models routinely flip the answer):

  - Team A SENDS: ${body.trade.aSendsPlayers.length || body.trade.aSendsPicks.length ? "(see proposed trade above)" : "(nothing)"}
  - Team A RECEIVES: ${body.trade.bSendsPlayers.length || body.trade.bSendsPicks.length ? "(see proposed trade above)" : "(nothing)"}
  - Same for Team B in reverse.

  When you fill teamA.assetsGained, that's what Team A RECEIVES.
  When you fill teamA.assetsLost, that's what Team A GAVE UP.
  Team A "wins" only if what they RECEIVE is more valuable than what they GAVE.
  Team A does NOT win if they gave up the more valuable asset.

When you reach the recommendation field, state which team benefits more in plain language. When you reach the verdict field (last), pick the enum that matches what you wrote in recommendation. If recommendation says "Team B is the winner", verdict MUST be team_b_got_more_value.

Also analyze:
- §6 slide-up: does either side now have a keeper whose natural round is missing?
- §3 duplicate-round chain on either side after the trade.
- §6 insurance fee: only the FIRST outgoing pick of the season triggers it.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.balanced, // Sonnet 4.6 — Opus 4.7 was returning empty tool calls
      max_tokens: 4096,
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
        debug: {
          stop_reason: response.stop_reason,
          content: response.content,
        },
      });
    }

    const result: any = unwrapToolInput(toolUse.input, "verdict");

    // Text-based sanity check: if the recommendation field clearly declares
    // a winner that contradicts the verdict enum, flip the verdict. The
    // recommendation is the model's final natural-language conclusion, so
    // when it disagrees with the verdict pill, the recommendation is more
    // reliable. (This catches the model's self-inversion bug.)
    const rec: string = (result?.recommendation ?? "").toLowerCase();
    const v: string = result?.verdict ?? "";
    const recSaysA =
      /(team a|team\s*a)[^.]{0,80}(winner|wins|benefits more|comes out ahead)/.test(rec);
    const recSaysB =
      /(team b|team\s*b)[^.]{0,80}(winner|wins|benefits more|comes out ahead)/.test(rec);
    if (recSaysA && v !== "team_a_got_more_value") {
      result.verdict = "team_a_got_more_value";
      result.confidenceNote =
        (result.confidenceNote ? `${result.confidenceNote} ` : "") +
        "(verdict normalized: recommendation declared Team A the winner)";
    } else if (recSaysB && v !== "team_b_got_more_value") {
      result.verdict = "team_b_got_more_value";
      result.confidenceNote =
        (result.confidenceNote ? `${result.confidenceNote} ` : "") +
        "(verdict normalized: recommendation declared Team B the winner)";
    }

    return res.status(200).json({
      result,
      usage: response.usage,
      debug: {
        stop_reason: response.stop_reason,
        model: response.model,
        // If result came back empty, the full content array helps diagnose.
        rawContent:
          result && Object.keys(result).length === 0 ? response.content : undefined,
      },
    });
  } catch (e: any) {
    // Surface the underlying Anthropic error so it shows up in the UI debug
    // panel and in Vercel logs.
    const detail = {
      message: e?.message ?? "Unknown error",
      status: e?.status,
      type: e?.error?.type ?? e?.name,
      anthropic_error: e?.error?.error?.message ?? e?.error?.message,
    };
    console.error("trade evaluator error:", detail, e);
    return res.status(500).json({
      error: "anthropic_error",
      message: detail.anthropic_error ?? detail.message,
      detail,
    });
  }
}
