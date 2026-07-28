/**
 * Build-time feature flags.
 *
 * `NEXT_PUBLIC_` is required on these names so the same value is readable in
 * the browser (to hide nav links) and on the server (to reject API calls).
 * They hold no secrets, so shipping them to the client is fine.
 *
 * Both flags below gate features that bill per Anthropic request, so they are
 * OFF unless explicitly enabled. Set them in `.env.local` to work on the
 * feature locally; leave them unset in production to keep the routes dark.
 */

/** Accepts "1" or "true" (any case) as on; everything else, including unset, is off. */
function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export const FEATURES = {
  advisor: enabled(process.env.NEXT_PUBLIC_ENABLE_ADVISOR),
  tradeEvaluator: enabled(process.env.NEXT_PUBLIC_ENABLE_TRADE_EVALUATOR),
} as const;

export type FeatureName = keyof typeof FEATURES;

/**
 * Body for API routes whose feature flag is off. 404 rather than 503 so a
 * disabled route is indistinguishable from one that was never built.
 */
export function featureDisabledResponse() {
  return {
    status: 404 as const,
    body: { error: "feature_disabled", message: "Not found." },
  };
}
