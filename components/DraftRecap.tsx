import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";
import { cn } from "../lib/cn";

interface DraftPickInfo {
  pick: number;
  round: number;
  team: string;
  player: string;
  position: string;
  pprRank: number | null;
  isKeeper: boolean;
}

interface Recap {
  headlines: string[];
  teamRecaps: {
    team: string;
    grade: string;
    summary: string;
    keyPicks: string[];
  }[];
}

const gradeColor = (grade: string) => {
  const letter = grade.charAt(0).toUpperCase();
  return {
    A: "bg-emerald-100 text-emerald-800",
    B: "bg-brand-100 text-brand-800",
    C: "bg-amber-100 text-amber-800",
    D: "bg-orange-100 text-orange-800",
    F: "bg-red-100 text-red-800",
  }[letter] ?? "bg-ink-100 text-ink-800";
};

export function DraftRecap({
  season,
  picks,
  disabled,
}: {
  season: string;
  picks: DraftPickInfo[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, picks }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRecap(json.result);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Post-draft recap</CardTitle>
        {!recap && (
          <Button onClick={run} disabled={disabled || busy}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {disabled && !recap && (
          <p className="text-sm text-ink-500">
            Recap generates once the draft is complete.
          </p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {busy && (
          <>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
        {recap && (
          <>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                Headlines
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {recap.headlines.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recap.teamRecaps.map((t) => (
                <div
                  key={t.team}
                  className="rounded-lg border border-ink-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 break-words font-semibold">{t.team}</div>
                    <div
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-bold",
                        gradeColor(t.grade),
                      )}
                    >
                      {t.grade}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{t.summary}</p>
                  {t.keyPicks.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-ink-600">
                      {t.keyPicks.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
