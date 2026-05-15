/**
 * Server-side Anthropic client.
 *
 * Lives in /lib but is ONLY imported from /pages/api/* routes. The SDK is
 * never bundled into the browser because the API key would be exposed.
 *
 * If ANTHROPIC_API_KEY is missing we export `null` and the API routes return
 * a 503 with a setup hint — keeps the dev experience honest without forcing
 * key setup for non-AI features.
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

export const anthropic: Anthropic | null = apiKey
  ? new Anthropic({ apiKey })
  : null;

export const isAnthropicEnabled = anthropic !== null;

/**
 * Model picks per workload:
 *  - opus-4-7: trade evaluator (complex reasoning over rules + economics)
 *  - sonnet-4-6: keeper advisor + draft recap (balance of cost & quality)
 *  - haiku-4-5: rules chat (low latency, mostly retrieval-grounded)
 *
 * Update these in one place when a newer model ships.
 */
export const MODELS = {
  reasoning: "claude-opus-4-7",
  balanced: "claude-sonnet-4-6",
  fast: "claude-haiku-4-5-20251001",
} as const;

/**
 * Standard error response shape for API routes. Use 503 for "not configured"
 * so the client can distinguish a setup problem from a real failure.
 */
export function notConfiguredResponse() {
  return {
    status: 503 as const,
    body: {
      error: "ai_not_configured",
      message:
        "AI features require ANTHROPIC_API_KEY env var. Locally: set it in .env.local. On Vercel: add it under Settings → Environment Variables and redeploy.",
    },
  };
}
