# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # next dev — http://localhost:3000
npm run build        # next build
npm start            # next start (after build)
npm run lint         # next lint (eslint-config-next)
npm test             # vitest run (one-shot)
npm run test:watch   # vitest in watch mode
```

A single test file:
```bash
npx vitest run lib/__tests__/keepers.test.ts
```

## Architecture

Next.js 14 (pages router), React 18, TypeScript. UI is **Tailwind v4** + **Radix UI** primitives (custom wrappers in `components/ui/`). Data is **TanStack Query**. Shared state is **Supabase** (optional, with localStorage fallback). AI features use the **Anthropic SDK** server-side (optional, gracefully disabled without a key). Tests are **Vitest** against the pure-math module.

```
pages/        — page shells: read identity, call composite hooks, render
components/   — JSX (Layout, panels/, ui/, page-specific components)
components/ui — Tailwind+Radix primitives (Button, Sheet, Tabs, Card, Skeleton, Avatar, Table)
components/panels — Tab bodies for the LeaguePanel (rules, deltas, keepers, best available)
lib/          — data + pure math + state (no JSX except identity.tsx and cn.ts)
supabase/     — schema.sql
```

### Data flow (Keeper Helper as the canonical example)

```
IdentityProvider (cookie)
  → useCurrentLeague()
      → useSleeperUser + useNFLState + useUserLeagues
  → useKeeperHelperData(league, season)
      → useRosters + useLeagueUsers + useTradedPicks + usePlayers +
        useFCRanks + previous-league equivalents + useLeagueChainDraftPicks
      → derivePlayerRows(...)            // pure, in lib/derivePlayerRows.ts
      → computeDraftDeltas(...)          // pure, in lib/keepers.ts
  → useLeagueKeepers(leagueId)           // Supabase OR localStorage
  → assignKeeperSlots(...)               // pure, in lib/keepers.ts
```

Pages stay tiny because every step above is a hook or a pure function. **Never** put a `useEffect` with a 100-line fetch chain in a page — add a query in [lib/sleeperQueries.ts](lib/sleeperQueries.ts) or a composite hook in [lib/leagueHooks.ts](lib/leagueHooks.ts).

### Source of truth for the league rules

The round-cost mapping table from §2 of [keeper_league_rulebook.md](keeper_league_rulebook.md) is encoded **exactly once** in [lib/keeperCostTable.ts](lib/keeperCostTable.ts). Everything else — `calculateKeeperRound`, the `KeeperRulesPanel`, the interactive `SlideUpDemo` — consumes it. If the rules change, edit that file AND update the rulebook markdown to match.

The four load-bearing rules each live in one module, exercised by tests:

- **§2 round mapping** → [lib/keeperCostTable.ts](lib/keeperCostTable.ts) (`calculateKeeperRound`)
- **§2 consecutive-keep escalation** → [lib/keepers.ts](lib/keepers.ts) (`buildKeeperHistory`, `computeKeeperCost`)
- **§3 + §6 slide-up / tie-break** → [lib/keepers.ts](lib/keepers.ts) (`assignKeeperSlots`) — the [components/SlideUpDemo.tsx](components/SlideUpDemo.tsx) on the rules page calls this directly, so the demo can never go out of sync with production behavior.
- **§6 traded-pick deltas** → [lib/keepers.ts](lib/keepers.ts) (`computeDraftDeltas`)

All four are exercised by tests in [lib/__tests__/keepers.test.ts](lib/__tests__/keepers.test.ts) — including the multi-keeper slide-up example from §6.

### Identity

[lib/identity.tsx](lib/identity.tsx) holds the user's Sleeper username in a 1-year cookie. [components/UsernameGate.tsx](components/UsernameGate.tsx) renders before the rest of the app and blocks until the username is set and validated against the Sleeper API. There is intentionally **no real auth** — friend-league trust model.

### Shared league state (Supabase, optional)

[lib/leagueState.ts](lib/leagueState.ts) exposes `useLeagueKeepers(leagueId)` and `useRosterKeepers(leagueId, rosterId)`. Both transparently switch between Supabase and localStorage based on whether `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.

**Supabase setup:**
1. Create a project at supabase.com (free tier).
2. SQL Editor → run [supabase/schema.sql](supabase/schema.sql).
3. Copy `.env.example` to `.env.local`, fill in URL + anon key.
4. `npm run dev`. The home page subtitle will switch to "Shared league mode — your selections are visible to everyone."

### TanStack Query

All Sleeper + FantasyCalc fetching goes through hooks in [lib/sleeperQueries.ts](lib/sleeperQueries.ts). Stale times are tuned per endpoint volatility (players blob 24h, matchups 5m, league metadata 1h). The `QueryClient` is constructed once per app in [pages/_app.tsx](pages/_app.tsx) with `refetchOnWindowFocus: false`.

Adding a new endpoint: add a thin wrapper to [lib/sleeperApi.ts](lib/sleeperApi.ts), then a hook in [lib/sleeperQueries.ts](lib/sleeperQueries.ts).

### UI: Tailwind + Radix

Tailwind v4 with `@import "tailwindcss"` in [styles/globals.css](styles/globals.css). Brand + ink palette + position tints live in a `@theme` block. The `cn()` helper in [lib/cn.ts](lib/cn.ts) merges classes (clsx + tailwind-merge).

Primitives live in [components/ui/](components/ui/) — minimal Tailwind+Radix wrappers (no shadcn CLI, no class-variance-authority — they were overkill for this surface area). Use them; don't reach for plain `<button>` or `<table>` unless intentionally.

### LeaguePanel (single Sheet replacing 4 sidebars)

[components/LeaguePanel.tsx](components/LeaguePanel.tsx) is a slide-out panel built on Radix Dialog with internal Tabs. Each page registers its tab list via `usePanelTabs(tabs)`. The trigger button lives in the top nav and hides itself when no tabs are registered.

When adding a new panel tab, build a body component in [components/panels/](components/panels/) and register it in the page's `usePanelTabs(useMemo(() => [...]))`. **Memoize the tabs array** — `usePanelTabs` calls `setTabs` in a `useEffect` keyed on the array, so an un-memoized literal will infinite-loop.

### Countdown banner

[components/CountdownBanner.tsx](components/CountdownBanner.tsx) reads the upcoming draft's `start_time` from `useDraft` and shows the keeper deadline (T-48h) + the draft itself. Re-ticks once per minute. Hides when no draft data is available.

### Team detail pages

[pages/team/[rosterId].tsx](pages/team/[rosterId].tsx) is the per-roster drill-down: avatar + owner name, saved keepers, draft pick deltas, roster broken out by position with keeper costs and value scores. Reachable from the team chips on the home page.

### AI features (Anthropic)

Server-side only. The Anthropic client lives in [lib/anthropic.ts](lib/anthropic.ts) and is exported as `null` when `ANTHROPIC_API_KEY` is missing. Every API route under `pages/api/*` checks `if (!anthropic)` and returns a 503 with a setup message — no AI feature crashes the site when the key is absent.

**Setup:**
1. Get an API key at console.anthropic.com.
2. Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local`.
3. Restart `npm run dev`. The `/advisor`, `/trade-evaluator`, rules chat, and draft recap features come online.

**Prompt architecture:**

[lib/aiPrompts.ts](lib/aiPrompts.ts) builds the system blocks for every route. The rulebook (which is long) is sent as a cacheable block (`cache_control: { type: "ephemeral" }`) so Anthropic caches it across requests — subsequent calls pay ~10% of input tokens for that block. Every route shares the same cached prefix so the cache hit rate is high.

**Model selection** (in `lib/anthropic.ts` → `MODELS`):
- `MODELS.reasoning` (Opus 4.7) — Trade Evaluator, where multi-step rule reasoning matters.
- `MODELS.balanced` (Sonnet 4.6) — Keeper Advisor, Draft Recap.
- `MODELS.fast` (Haiku 4.5) — Rules chat (low-latency, grounded retrieval).

**Structured outputs:**

Advisor / Trade Evaluator / Draft Recap all use **tool use with `tool_choice: { type: "tool", name: ... }`** to force structured JSON. The tool schema defines the shape of the output. This is more reliable than asking for JSON in the prompt.

**Streaming:**

Rules chat uses `anthropic.messages.stream(...)` and writes text deltas to the response body as plain chunked text. The client reads with a `ReadableStream` reader. No SSE framing — keep it simple.

**Adding a new AI feature:**
1. Add an API route under `pages/api/<feature>.ts` that imports `anthropic`, `MODELS`, and `systemBlocks` from `lib/`.
2. Check `if (!anthropic) return notConfiguredResponse()` first.
3. Use `systemBlocks()` (or `systemBlocks("extra context")`) for the system prompt so the rulebook gets cached.
4. For structured output, define a tool schema and use `tool_choice: { type: "tool", name: ... }`.
5. Build the frontend page or component to POST to the route.

### Things NOT to do

- Don't write a new `useEffect` data-fetching block in a page. Add a query hook.
- Don't inline the round-cost mapping. Import `KEEPER_COST_TABLE` or `calculateKeeperRound` from `lib/keeperCostTable.ts`.
- Don't duplicate keeper-math logic — `assignKeeperSlots` is the only function that decides which round a keeper occupies.
- Don't hardcode `username = "rex-macmillan"`. Use `useIdentity()`.
- Don't write directly to `localStorage` for keeper data. Use `useLeagueKeepers`.
- Don't add a new bespoke `.module.css` file. Use Tailwind classes; if a pattern is repeated, extract a small component in `components/ui/`.
- Don't pass a fresh tabs array to `usePanelTabs` on every render — memoize it.
- Don't import `lib/anthropic.ts` or `lib/aiPrompts.ts` from anywhere outside `pages/api/*`. They are server-only and contain the API key.
- Don't prefix the Anthropic key with `NEXT_PUBLIC_`. That would ship it to the browser.
- Don't inline the rulebook as a string literal in an API route. Use `systemBlocks()` — that's the only place it should be loaded so the cache key stays consistent.
