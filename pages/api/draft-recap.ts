import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse, unwrapToolInput } from "../../lib/anthropic";
import { systemBlocks } from "../../lib/aiPrompts";

interface DraftPickInfo {
  pick: number;
  round: number;
  team: string;
  player: string;
  position: string;
  pprRank: number | null;
  isKeeper: boolean;
}

interface RequestBody {
  season: string;
  picks: DraftPickInfo[];
}

const RECAP_TOOL = {
  name: "submit_recap",
  description: "Submit a per-team draft recap.",
  input_schema: {
    type: "object" as const,
    properties: {
      headlines: {
        type: "array",
        description:
          "3-5 league-wide headlines — biggest reach, best value, surprise QB run, etc.",
        items: { type: "string" },
      },
      teamRecaps: {
        type: "array",
        description: "One recap per team.",
        items: {
          type: "object",
          properties: {
            team: { type: "string" },
            grade: { type: "string", description: "A+ through F" },
            summary: {
              type: "string",
              description:
                "2-3 sentences. Note their positional strategy, biggest steal, biggest reach, keeper impact.",
            },
            keyPicks: {
              type: "array",
              items: { type: "string" },
              description: "Specific picks (with round.pick) worth calling out.",
            },
          },
          required: ["team", "grade", "summary", "keyPicks"],
        },
      },
    },
    required: ["headlines", "teamRecaps"],
  },
};

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
  if (!body?.picks?.length) {
    return res.status(400).json({ error: "no_picks" });
  }

  const formatted = body.picks
    .sort((a, b) => a.pick - b.pick)
    .map(
      (p) =>
        `${p.round}.${p.pick} ${p.team} — ${p.player} (${p.position}, PPR rank ${
          p.pprRank ?? "—"
        })${p.isKeeper ? " [KEEPER]" : ""}`,
    )
    .join("\n");

  const userPrompt = `Generate a narrative recap of the ${body.season} draft.

Picks in order:
${formatted}

Use the rulebook's keeper rules to factor in keeper costs — a R6 keeper of a top-30 player is excellent value, an R2 keeper of a top-40 player is mediocre. Call submit_recap with structured output.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.balanced,
      max_tokens: 4096,
      system: systemBlocks(),
      tools: [RECAP_TOOL],
      tool_choice: { type: "tool", name: "submit_recap" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return res.status(502).json({ error: "no_tool_use" });
    }
    return res
      .status(200)
      .json({ result: unwrapToolInput(toolUse.input, "headlines"), usage: response.usage });
  } catch (e: any) {
    console.error("draft recap error:", e);
    return res.status(500).json({ error: "anthropic_error", message: e?.message });
  }
}
