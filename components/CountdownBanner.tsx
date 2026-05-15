import { useEffect, useMemo, useState } from "react";
import { useCurrentLeague } from "../lib/leagueHooks";
import { useDraft, useLeagueDrafts } from "../lib/sleeperQueries";
import { cn } from "../lib/cn";

/**
 * Sitewide banner showing how long until the keeper deadline (T-48hrs before
 * the draft) and how long until the draft itself. Sleeper exposes the draft's
 * `start_time` (epoch ms) on the draft object.
 */

const KEEPER_DEADLINE_OFFSET_MS = 48 * 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "passed";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function CountdownBanner() {
  const { league } = useCurrentLeague();
  const draftsQ = useLeagueDrafts(league?.league_id);
  const draftId = draftsQ.data?.[0]?.draft_id;
  const draftQ = useDraft(draftId);

  // Re-tick every minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => {
    const startTime = draftQ.data?.start_time;
    if (!startTime) return null;
    const draftMs = Number(startTime) - now;
    const keeperMs = Number(startTime) - KEEPER_DEADLINE_OFFSET_MS - now;
    return { draftMs, keeperMs };
  }, [draftQ.data, now]);

  if (!view) return null;

  const tone =
    view.keeperMs > 7 * 24 * 60 * 60 * 1000
      ? "bg-brand-50 text-brand-900 border-brand-100"
      : view.keeperMs > 0
      ? "bg-amber-50 text-amber-900 border-amber-200"
      : "bg-ink-100 text-ink-700 border-ink-200";

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm shadow-sm",
        tone,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">Keeper deadline:</span>
        <span className="tabular-nums">{formatRemaining(view.keeperMs)}</span>
      </div>
      <div className="flex items-center gap-2 text-ink-600">
        <span>Draft:</span>
        <span className="tabular-nums">{formatRemaining(view.draftMs)}</span>
      </div>
    </div>
  );
}
