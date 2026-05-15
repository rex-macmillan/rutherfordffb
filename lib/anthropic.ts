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
/**
 * Defensive unwrap for tool_use.input.
 *
 * Even though our schemas declare top-level properties (no wrapper), the
 * model sometimes adds a semantic wrapper that mirrors the tool name —
 * e.g. tool `submit_evaluation` gets called with
 *   { evaluation: { verdict, teamA, ... } }
 * instead of
 *   { verdict, teamA, ... }
 *
 * If we find exactly one top-level object key and the expected field is
 * underneath it, unwrap. Otherwise return the input unchanged.
 */
export function unwrapToolInput<T extends Record<string, any>>(
  input: any,
  expectedKey: keyof T,
): T {
  if (input && typeof input === "object") {
    if (expectedKey in input) return input as T;
    const keys = Object.keys(input);
    if (
      keys.length === 1 &&
      input[keys[0]] &&
      typeof input[keys[0]] === "object" &&
      expectedKey in input[keys[0]]
    ) {
      return input[keys[0]] as T;
    }
  }
  return input as T;
}

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
