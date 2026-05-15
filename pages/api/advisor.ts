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
        "Signed number: (keeper round) - (typical draft round). POSITIVE means keeper round number is LATER than typical draft round = you're paying a cheap pick for a premium player = good. NEGATIVE means keeper round is EARLIER than typical = paying an expensive pick for a low-value player = overpay. Examples: Achane R6 keeper / R1 typical = +5. Spears R6 keeper / R11 typical = -5 (BAD, paying R6 for waiver-tier RB). LaPorta R7 keeper / R6 typical = +1. Wilson R1 keeper / R2.5 typical = -1.5.",
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
  // Sort by precomputed value score (descending) so the top candidates appear
  // first. Players without a score fall to the bottom.
  const sorted = [...roster].sort((a, b) => {
    const av = a.valueScore ?? -Infinity;
    const bv = b.valueScore ?? -Infinity;
    return bv - av;
  });
  return sorted
    .map((p) => {
      const posRank = posRanks.get(p.playerId);
      const posLabel = posRank ? `${p.position}${posRank}` : p.position;
      const score =
        p.valueScore != null ? `value ${p.valueScore.toFixed(2)}` : "value —";
      return `- ${p.name} (${posLabel}, ${p.teamAbbr}) | overall PPR ${
        p.pprRank ?? "—"
      } | keeper R${p.keeperRound ?? "—"} | ${score}${
        p.prevKeeper ? " [escalated by consecutive keeps]" : ""
      } | id: ${p.playerId}`;
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

  const userPrompt = `==================================================================
LEAGUE CONFIG (always relevant)
==================================================================

  - 12-team league, 1 starting QB, PPR scoring, snake draft, 17 rounds.
  - Max 4 keepers per team (managers may declare 0-4).
  - Entry fee scales with keeper count: $150 base / $175 (2 keepers) /
    $225 (3 keepers) / $300 (4 keepers).
  - §2 round mapping (drafted_last_year → keeper_cost_this_year):
      R1→R1, R2→R1, R3→R2, R4→R3, R5→R4, R6→R5, R7→R6, R8→R6, R9→R7,
      R10→R8, R11→R9, R12→R10, R13-R14→R10, R15-R17→R11, undrafted→R6.
  - §3 (duplicate-round tie-break): if two of YOUR keepers share the
    same round cost, the second one slides to the NEXT round (later).
  - §6 (slide-up for missing picks): if you traded away the round your
    keeper would naturally occupy, the keeper slides EARLIER first
    (your next-earlier owned round), then later as a fallback.
  - Once you keep a player, their NEXT-YEAR cost re-applies §2 to this
    year's cost (R6 keeper → R5 next year → R4 → R3 → …). Effectively
    a multi-year ladder.

==================================================================
TEAM
==================================================================

Team: ${body.teamName}${
    body.managerName ? ` (manager: ${body.managerName})` : ""
  }

Current roster, sorted by precomputed value score (DESCENDING). Annotation key:
  - "QB12" / "RB5" / "TE7" — POSITIONAL rank in this league pool (NOT overall PPR rank).
  - "value X.XX" — server-computed value score = (equity + scarcity_bonus) * tier_weight.
    Strongly positive (≥ +1.5) = likely keep. Near zero = borderline.
    Strongly negative (≤ -0.5) = likely drop (overpaying for the keeper slot).
  - Use this score as a strong PRIOR, not the final answer — your own
    framework analysis can override it (e.g. for trajectory/injury reasons),
    but you must JUSTIFY any deviation explicitly.

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
    Use these benchmarks for a clean 12-team 1QB PPR snake draft.
    Numbers represent a SINGLE round (not "earliest to latest" — pick the
    most representative round for that tier):
      - RB1-RB6           → R1
      - RB7-RB12          → R2
      - RB13-RB20         → R4
      - RB21-RB30         → R7
      - RB31-RB40         → R11
      - RB41+             → R14+ or undrafted
      - WR1-WR8           → R2
      - WR9-WR15          → R3
      - WR16-WR24         → R4
      - WR25-WR36         → R7
      - WR37-WR50         → R11
      - WR51+             → R14+ or undrafted
      - TE1-TE3           → R4 (elite tier)
      - TE4-TE8           → R6
      - TE9-TE14          → R10
      - TE15+             → R14+ or undrafted
      - QB1-QB6 (1QB)     → R6
      - QB7-QB12 (1QB)    → R10
      - QB13+             → R14+

    For UNRANKED players (no positional rank because they're not on the
    league's top-200 board), treat typical round as R15+ / undrafted —
    they're free in any practical sense.

(2) EQUITY = (keeper round) - (typical draft round).
    POSITIVE = keeper round number is LATER than the player's typical
    draft round = you're paying a cheap pick for a premium player = GOOD.
    NEGATIVE = keeper round number is EARLIER than typical = you're
    paying an expensive pick for a low-value player = BAD.

    The intuition: lower round numbers are more expensive picks (R1 is
    the most expensive). So you want your KEEPER round number to be
    BIGGER than the player's typical draft round number — the bigger
    the gap, the cheaper you got them.

    Examples (work the arithmetic carefully each time):
      - Achane (RB5,  keeper R6)   = 6 - 1   = +5    excellent (R1 player at R6 cost)
      - London (WR8,  keeper R4)   = 4 - 2   = +2    very good
      - LaPorta (TE6, keeper R7)   = 7 - 6   = +1    fair (+ TE scarcity premium)
      - Dart (QB12,   keeper R10)  = 10 - 10 = 0     market
      - Spears (RB46, keeper R6)   = 6 - 11  = -5    OVERPAY (waiver-tier RB at R6 cost)
      - Wilson (WR15, keeper R1)   = 1 - 2.5 = -1.5  OVERPAY (mid-WR at R1 cost)
      - Adams (WR23,  keeper R2)   = 2 - 3.5 = -1.5  OVERPAY
      - Diggs (WR54,  keeper R6)   = 6 - 14  = -8    catastrophic overpay (undrafted-tier)

    CRITICAL: if a player is RB31+ / WR37+ / TE13+ / QB13+ (depth tier),
    their typical round is R11-R17 or undrafted. Keeping them at R6 is
    a HUGE negative equity (-5 to -10), NOT positive. Do not confuse
    "keeper round is earlier than typical" with "good deal" — it's the
    opposite of good.

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

    AUTO-DROP rules (apply first, before computing equity-based keep):
      - Positional rank is in DEPTH tier (RB31+, WR37+, TE13+, QB13+).
        These are bench / waiver-pool players. The keeper slot is more
        valuable than the player, regardless of how late they "typically"
        go. Examples: Spears (RB46), Tracy (RB41), Johnston (WR44),
        Pearsall (WR39), unranked / undrafted players. ALWAYS drop.
      - Equity ≤ -1 round (clear overpay).
      - Player is unranked AND keeper cost is R8 or earlier (you're
        spending a real pick on someone the market wouldn't draft).

    KEEP rules (after auto-drops are out):
      - Equity ≥ +1.5 AND positional rank in starter tier
        (RB1-24, WR1-30, TE1-10, QB1-12). The starter tier is the actual
        bar — equity alone is not enough if the player isn't startable.
      - Equity ≥ 0 AND elite tier (RB1-12, WR1-15, TE1-6, QB1-8) AND
        long multi-year ladder AND ascending trajectory.

    BORDERLINE: starter-tier player with equity in [0, +1.5), or
    elite-tier player with equity in [-1, 0).

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

  1. perPlayerAnalysis: ANALYZE EVERY player on the roster who has a keeper
     cost listed (do not skip anyone — even depth players sometimes turn up
     as the right 4th keeper). Fill typical draft round, equity, multi-year,
     age/trajectory, and verdict for each.
  2. recommendedKeepers: ordered list of verdict='keep' entries. MUST be a
     subset of perPlayerAnalysis. Maximum 4.
  3. alternatives: verdict='borderline' entries with what would tip them.
     STRICT RULE: a playerId in alternatives MUST NOT also appear in
     recommendedKeepers. They are mutually exclusive — a player is either
     a recommended keeper OR a borderline alternative, never both.
  4. keeperCountAdvice: dollar+pick math for going from 3 → 4 keepers.
  5. trapsAvoided: name the specific name-brand traps you rejected.
  6. keyConsiderations + riskAssessment.

CRITICAL OUTPUT RULES:
  - recommendedKeepers and alternatives have ZERO overlap (no playerId
    appears in both arrays).
  - Be willing to recommend 2 or 3 keepers if the 4th-best option is
    genuinely negative equity. Don't fill 4 slots out of completeness.
  - Use the precomputed value scores as a prior. If you deviate from the
    value-score ranking, explicitly justify why in the player's rationale
    (e.g. "value score higher but he's 32 and on a new team — discounted").
  - Consider the WHOLE roster, not just the famous names. The 4th-best
    keeper is often someone whose name you don't recognize.`;

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

    const result: any = unwrapToolInput(toolUse.input, "recommendedKeepers");

    // Enforce non-overlap: a playerId in recommendedKeepers cannot also be
    // in alternatives. Recommended is the source of truth — strip dupes
    // from alternatives. This catches the model's "honorable mention but
    // also recommended" slip-up.
    if (Array.isArray(result?.recommendedKeepers) && Array.isArray(result?.alternatives)) {
      const recIds = new Set<string>(
        result.recommendedKeepers.map((k: any) => k.playerId),
      );
      result.alternatives = result.alternatives.filter(
        (a: any) => !recIds.has(a.playerId),
      );
    }

    return res.status(200).json({
      result,
      usage: response.usage,
    });
  } catch (e: any) {
    console.error("advisor error:", e);
    return res
      .status(500)
      .json({ error: "anthropic_error", message: e?.message ?? "Unknown error" });
  }
}
