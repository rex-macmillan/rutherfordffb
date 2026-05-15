import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { useCurrentLeague, useKeeperHelperData } from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
import { cn } from "../lib/cn";

interface Recommendation {
  recommendedKeepers: {
    playerId: string;
    name: string;
    keeperRound: number;
    rationale: string;
  }[];
  alternatives: {
    playerId: string;
    name: string;
    keeperRound: number;
    reason: string;
  }[];
  keeperCountAdvice: string;
  keyConsiderations: string[];
  riskAssessment: string;
}

export default function AdvisorPage() {
  const { username } = useIdentity();
  const { league, season, isLoading: leagueLoading } = useCurrentLeague();
  const { data, isLoading: dataLoading } = useKeeperHelperData(league, season);

  const [selectedRoster, setSelectedRoster] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [usage, setUsage] = useState<any>(null);

  // Default to the user's own roster if we can match it.
  useMemo(() => {
    if (!data || selectedRoster !== "") return;
    if (!username) return;
    const owner = data.currentUsers.find(
      (u) =>
        u.display_name?.toLowerCase() === username.toLowerCase() ||
        u.metadata?.team_name?.toLowerCase() === username.toLowerCase(),
    );
    const myRoster = data.currentRosters.find((r) => r.owner_id === owner?.user_id);
    if (myRoster) setSelectedRoster(myRoster.roster_id);
  }, [data, username, selectedRoster]);

  const teamOptions = data?.teams ?? [];
  const team = teamOptions.find((t) => t.rosterId === selectedRoster);

  const runAdvisor = async () => {
    if (!data || selectedRoster === "" || !team) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const toPayload = (p: typeof data.rows[number]) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        teamAbbr: p.teamAbbr,
        pprRank: p.pprRank,
        keeperRound: p.keeperRound,
        prevKeeper: p.prevKeeper,
        valueScore: p.valueScore,
      });

      const roster = data.rows
        .filter((p) => p.rosterId === selectedRoster)
        .map(toPayload);

      // Send the entire league-wide rostered pool too, so the server can
      // compute positional ranks (QB12, TE7, etc.) and the model judges
      // value with positional context instead of overall PPR rank alone.
      const leagueWidePool = data.rows
        .filter((p) => p.rosterId >= 0 && p.pprRank != null)
        .map(toPayload);

      const delta = data.deltas.get(selectedRoster as number);

      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName: team.teamName,
          managerName: username,
          roster,
          leagueWidePool,
          missingPicks: delta?.missing ?? [],
          extraPicks: delta?.extra ?? [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult(json.result);
      setUsage(json.usage);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = !leagueLoading && !dataLoading && !!data;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Keeper Advisor</h1>
        <p className="text-sm text-ink-500">
          Claude analyzes your roster against this league&apos;s rules and
          recommends which keepers to declare — accounting for keeper-cost
          escalation, slide-up rules, and the +$50/+$75 entry-fee economics.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Team
            <select
              className="min-w-[220px] rounded-md border border-ink-300 px-2 py-1.5 text-sm text-ink-900 normal-case"
              value={selectedRoster}
              onChange={(e) => setSelectedRoster(parseInt(e.target.value))}
              disabled={!ready}
            >
              <option value="">Select a team…</option>
              {teamOptions.map((t) => (
                <option key={t.rosterId} value={t.rosterId}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={runAdvisor}
            disabled={!ready || selectedRoster === "" || busy}
          >
            {busy ? "Thinking…" : "Run advisor"}
          </Button>
          {usage && (
            <span className="ml-auto text-xs text-ink-500">
              {usage.input_tokens} in / {usage.output_tokens} out
              {usage.cache_read_input_tokens
                ? ` (${usage.cache_read_input_tokens} cached)`
                : ""}
            </span>
          )}
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      )}

      {busy && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recommended Keepers ({result.recommendedKeepers.length})</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {result.recommendedKeepers.map((k, idx) => (
                <div key={k.playerId} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {idx + 1}. {k.name}
                    </div>
                    <div className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                      R{k.keeperRound}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{k.rationale}</p>
                </div>
              ))}
              {result.recommendedKeepers.length === 0 && (
                <p className="text-sm text-ink-500">
                  Advisor recommends no keepers this year.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Keeper-count economics</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-700">{result.keeperCountAdvice}</p>
            </CardBody>
          </Card>

          {result.alternatives.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Honorable mentions</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {result.alternatives.map((a) => (
                  <div key={a.playerId} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-ink-500">R{a.keeperRound}</span>
                    <span className="text-ink-700">— {a.reason}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Key considerations</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
                {result.keyConsiderations.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk assessment</CardTitle>
            </CardHeader>
            <CardBody>
              <p className={cn("text-sm text-ink-700")}>{result.riskAssessment}</p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
