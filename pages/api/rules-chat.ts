import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODELS, notConfiguredResponse } from "../../lib/anthropic";
import { systemBlocks } from "../../lib/aiPrompts";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
}

/**
 * Streaming endpoint. Responses are server-sent as plain text chunks (no SSE
 * framing) so the client can pipe them straight to UI state. We use Haiku
 * because chat-style rules grounding is mostly retrieval and benefits more
 * from latency than from reasoning depth.
 */
export const config = {
  api: {
    responseLimit: false,
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
  if (!body?.messages?.length) {
    return res
      .status(400)
      .json({ error: "bad_request", message: "messages array required" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache, no-transform");

  try {
    const stream = anthropic.messages.stream({
      model: MODELS.fast,
      max_tokens: 1024,
      system: systemBlocks(
        `You are answering questions about this specific keeper league's rules. Keep replies concise (1-3 short paragraphs max unless asked for detail). When a question hinges on a specific rule, cite the section number (e.g., "§6"). If a question is about something the rulebook doesn't cover, say so plainly rather than guessing.`,
      ),
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(event.delta.text);
      }
    }
    res.end();
  } catch (e: any) {
    console.error("rules chat error:", e);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "anthropic_error", message: e?.message ?? "Unknown" });
    } else {
      res.write(`\n\n[stream error: ${e?.message ?? "unknown"}]`);
      res.end();
    }
  }
}
