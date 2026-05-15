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

const KEEPER_ITEM = {
  type: "object" as const,
  properties: {
    playerId: { type: "string" },
    name: { type: "string" },
    keeperRound: {
      type: "number",
      description: "The round this keeper costs (per §2 mapping).",
    },
    positionalRank: {
      type: "string",
      description:
        "Position-specific rank, e.g. 'RB5', 'QB12', 'WR23'. Use the annotated value from the roster prompt.",
    },
    typicalDraftRound: {
      type: "string",
      description:
        "Where this player would typically be picked in a clean 12-team PPR snake draft, given the positional rank. Format like 'R3' or 'R3-R4'. Be honest — a WR23 doesn't go in R2, they go R3-R4.",
    },
    equityRounds: {
      type: "number",
      description:
        "Signed number: (typical draft round) - (keeper round). Positive = you're keeping below market = good. Negative = overpaying. ~0 = market price. Example: WR23 (typical R3-R4) at R2 keeper = -1.5 equity.",
    },
    multiYearOutlook: {
      type: "string",
      description:
        "How many seasons can this player realistically stay a keeper given §2 escalation? Examples: 'one-shot (escalates to R1 next year)', '3-year ladder R6→R5→R4', 'declining player, one-shot only'.",
    },
    rationale: {
      type: "string",
      description:
        "2-3 sentences. Must reference the equity calculation and multi-year outlook. Avoid generic praise like 'great player'.",
    },
  },
  required: [
    "playerId",
    "name",
    "keeperRound",
    "positionalRank",
    "typicalDraftRound",
    "equityRounds",
    "multiYearOutlook",
    "rationale",
  ],
};

const RECOMMEND_TOOL = {
  name: "submit_recommendation",
  description: "Submit the final keeper recommendation for this team.",
  input_schema: {
    type: "object" as const,
    // Order matters — model fills top to bottom. Force the per-player
    // analysis FIRST, then derive count advice + recommendations from it.
    properties: {
      perPlayerAnalysis: {
        type: "array",
        description:
          "REQUIRED first step. Score EVERY non-trivial keeper candidate on the roster (top ~10 by positional rank or any player with keeper cost ≤ R10). Be rigorous about the equity math — do not skip players just because they have famous names or just because their overall PPR rank looks low. This is the working-out that the final recommendation derives from.",
        items: {
          ...KEEPER_ITEM,
          properties: {
            ...KEEPER_ITEM.properties,
            verdict: {
              type: "string",
              enum: ["keep", "borderline", "drop"],
              description:
                "Based on equityRounds + multiYearOutlook + age/trajectory.",
            },
          },
          required: [...KEEPER_ITEM.required, "verdict"],
        },
      },
      recommendedKeepers: {
        type: "array",
        description:
          "Final ranked list (best first) of 0–4 players this manager should declare. Must be drawn from perPlayerAnalysis entries with verdict='keep'. Order by overall value (equity + multi-year potential).",
        items: KEEPER_ITEM,
      },
      alternatives: {
        type: "array",
        description:
          "Up to 3 borderline players that didn't make the final cut but were close. Should be the verdict='borderline' entries from perPlayerAnalysis.",
        items: {
          type: "object",
          properties: {
            playerId: { type: "string" },
            name: { type: "string" },
            keeperRound: { type: "number" },
            reason: {
              type: "string",
              description:
                "Why borderline — what specifically would push them onto the list (e.g., 'if you have conviction on his sophomore leap', 'if Adams's ADP rises pre-draft').",
            },
          },
          required: ["playerId", "name", "keeperRound", "reason"],
        },
      },
      keeperCountAdvice: {
        type: "string",
        description:
          "How many keepers to take. Frame as: '3 keepers ($225) keeps these N positive-equity locks. The 4th (+$75) would be X — is it worth $75 + an Rx pick for that specific player?' Explicitly state the dollar+pick cost of going from 3→4.",
      },
      trapsAvoided: {
        type: "array",
        items: { type: "string" },
        description:
          "List of name-brand traps this analysis explicitly REJECTED, with one-line reason. e.g. 'Davante Adams (R2 / WR23): negative equity (~R3-4 market value), R2→R1 escalation makes it one-shot, age 32 declining'. Empty array is fine if no such traps exist on this roster.",
      },
      keyConsiderations: {
        type: "array",
        items: { type: "string" },
        description:
          "Other insights: slide-up impacts (§6), duplicate-round chains (§3), consecutive-keep escalation paths, etc.",
      },
      riskAssessment: {
        type: "string",
        description:
          "What's the riskiest part of the recommendation? Injury, schedule, ADP fragility, etc.",
      },
    },
    required: [
      "perPlayerAnalysis",
      "recommendedKeepers",
      "alternatives",
      "keeperCountAdvice",
      "trapsAvoided",
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

Current roster (each player annotated with POSITIONAL rank — QB12 means he's the 12th-best QB league-wide, NOT his overall PPR rank):
${formatRoster(body.roster, posRanks)}

Draft pick situation for this team:
- Extra picks gained via trade: ${body.extraPicks.length ? body.extraPicks.map((r) => `R${r}`).join(", ") : "none"}
- Missing picks (traded away): ${body.missingPicks.length ? body.missingPicks.map((r) => `R${r}`).join(", ") : "none"}

==================================================================
EVALUATION FRAMEWORK — apply RIGOROUSLY to every viable candidate
==================================================================

For each keeper-eligible player (top ~10 by positional rank + anyone with
keeper cost ≤ R10), do this math BEFORE recommending anything:

(1) TYPICAL DRAFT ROUND from positional rank.
    Use these benchmarks for a clean 12-team PPR snake draft:
      - RB1-RB6           → R1
      - RB7-RB12          → R2
      - RB13-RB20         → R3-R4
      - RB21-RB30         → R5-R7
      - RB31+             → R8+
      - WR1-WR8           → R1-R2
      - WR9-WR15          → R2-R3
      - WR16-WR24         → R3-R4
      - WR25-WR36         → R5-R7
      - WR37+             → R8+
      - TE1-TE3           → R3-R5 (elite tier)
      - TE4-TE8           → R5-R8
      - TE9-TE14          → R9-R12
      - QB1-QB6 (1QB)     → R5-R8 (only if you reach)
      - QB7-QB12 (1QB)    → R9-R12
      - QB13+             → R13+

(2) EQUITY = (typical draft round) - (keeper round).
    POSITIVE = below market = good keeper. NEGATIVE = overpay.
    Examples:
      - Achane (RB5, R6 keeper)    = R1 - R6  = +5    excellent
      - London (WR8, R4 keeper)    = R2 - R4  = +2    very good
      - LaPorta (TE6, R7 keeper)   = R6 - R7  = +1 + TE scarcity premium
      - Dart (QB12, R10 keeper)    = R10 - R10 = 0    fair + multi-year
      - Adams (WR23, R2 keeper)    = R3.5 - R2 = -1.5 NEGATIVE (TRAP)
      - Wilson (WR15, R1 keeper)   = R2.5 - R1 = -1.5 NEGATIVE (TRAP)

(3) MULTI-YEAR LADDER. Apply §2 to find next year's cost.
      R10 → R8 → R7 → R6 ...     long ladder, ascending value
      R6  → R5 → R4 → R3 ...     4-year keeper potential
      R4  → R3 → R2 → R1         3-year ladder
      R2  → R1                   ONE-SHOT (R1 is the practical ceiling)
      R1  → R1                   stays R1 (only worth it for true elites)
    A young player with a long ladder is worth MORE than the equity number
    alone suggests. An aging player at a one-shot threshold is worth LESS.

(4) AGE / TRAJECTORY. Brief signal:
      - 32+ years old      → declining, one-shot at best
      - 28-31              → peak, multi-year if equity supports
      - <28                → ascending, multi-year is more valuable

(5) VERDICT for each player: keep / borderline / drop.
    Keep: equity ≥ +1.5 round, OR (≥ 0 equity AND long multi-year ladder
          AND ascending trajectory).
    Drop: equity ≤ 0 AND short ladder (≤1 more year of keepability).
    Borderline: in between.

==================================================================
NAME-BRAND TRAPS — actively flag and reject
==================================================================

These are the recurring blind spots. Catch them explicitly:

  - "Famous WR at R1-R2 keeper" who's actually a WR15-WR25 in the rankings.
    A 30+ year old name brand on a new team is the classic trap. Common
    examples: Davante Adams, Mike Evans, Stefon Diggs, DeAndre Hopkins.
    They feel like value because the name is big. The cost-vs-positional-
    rank math says otherwise. The §2 escalation to R1 makes them one-shot.
    DROP these unless equity is meaningfully positive.

  - "Aging RB at R3-R5 keeper" similarly — Derrick Henry late-career, etc.

  - Deflated-rank QB/TE underrating. A QB12 at R10 looks like "nothing
    special" if you compare overall ranks, but at a position rank of 12
    in a 1QB league, that's a real starter at market-or-below cost with
    multi-year upside. Don't dismiss it.

  - The "only big-name asset" trap. Sometimes a roster has one famous
    player who's actually negative equity, but the model wants to
    recommend SOMEONE. Be willing to recommend FEWER than 4 keepers if
    the math doesn't support more.

==================================================================
DELIVERABLE
==================================================================

Fill the tool fields in order (the schema declares them in the order you
should reason):

  1. perPlayerAnalysis: do the math for every viable candidate (typical
     draft round, equity, multi-year, age/trajectory, verdict).
  2. recommendedKeepers: ordered list of verdict='keep' entries.
  3. alternatives: verdict='borderline' entries with what would tip them.
  4. keeperCountAdvice: dollar+pick math for going from 3 → 4 keepers.
  5. trapsAvoided: name the specific name-brand traps you rejected.
  6. keyConsiderations + riskAssessment.

Be willing to recommend 2 or 3 keepers if the 4th-best option is genuinely
negative equity. Avoid filling 4 slots out of completeness — recommend the
math, not the slot count.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.balanced,
      max_tokens: 6144,
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
