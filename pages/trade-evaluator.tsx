import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { useCurrentLeague, useKeeperHelperData } from "../lib/leagueHooks";
import { useLeagueKeepers } from "../lib/leagueState";
import { cn } from "../lib/cn";
import type { PlayerRow } from "../lib/derivePlayerRows";

interface SideAnalysis {
  immediateValueDelta: string;
  assetsGained: string[];
  assetsLost: string[];
  fitNote: string;
}

type Verdict =
  | "roughly_fair"
  | "team_a_got_more_value"
  | "team_b_got_more_value";

interface Evaluation {
  verdict: Verdict;
  confidenceNote: string;
  teamA: SideAnalysis;
  teamB: SideAnalysis;
  keeperEconomics: string;
  pickIntegrity: string;
  insuranceFee: string;
  recommendation: string;
}

const verdictLabel: Record<Verdict, string> = {
  roughly_fair: "Roughly fair",
  team_a_got_more_value: "Team A got more value",
  team_b_got_more_value: "Team B got more value",
};

const verdictTone: Record<Verdict, string> = {
  roughly_fair: "bg-emerald-50 text-emerald-800 border-emerald-200",
  team_a_got_more_value: "bg-amber-50 text-amber-800 border-amber-200",
  team_b_got_more_value: "bg-amber-50 text-amber-800 border-amber-200",
};

export default function TradeEvaluatorPage() {
  const { league, season, isLoading: leagueLoading } = useCurrentLeague();
  const { data, isLoading: dataLoading } = useKeeperHelperData(league, season);
  const { data: allKeepers } = useLeagueKeepers(league?.league_id);

  const [teamARosterId, setTeamA] = useState<number | "">("");
  const [teamBRosterId, setTeamB] = useState<number | "">("");
  const [aSendsPlayers, setAPlayers] = useState<Set<string>>(new Set());
  const [bSendsPlayers, setBPlayers] = useState<Set<string>>(new Set());
  const [aSendsPicks, setAPicks] = useState<Set<number>>(new Set());
  const [bSendsPicks, setBPicks] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [usage, setUsage] = useState<any>(null);

  const teams = data?.teams ?? [];
  const teamA = teams.find((t) => t.rosterId === teamARosterId);
  const teamB = teams.find((t) => t.rosterId === teamBRosterId);

  const rosterA = useMemo(
    () => data?.rows.filter((p) => p.rosterId === teamARosterId) ?? [],
    [data, teamARosterId],
  );
  const rosterB = useMemo(
    () => data?.rows.filter((p) => p.rosterId === teamBRosterId) ?? [],
    [data, teamBRosterId],
  );

  const deltaA = data?.deltas.get(teamARosterId as number);
  const deltaB = data?.deltas.get(teamBRosterId as number);

  // Picks each side currently holds (1..17 minus missing + extras).
  const picksHeld = (deltaA: any) => {
    if (!deltaA) return [];
    const set = new Set<number>();
    for (let r = 1; r <= 17; r++) set.add(r);
    deltaA.missing.forEach((r: number) => set.delete(r));
    return Array.from(set).sort((a, b) => a - b);
  };

  const togglePlayer = (set: Set<string>, setter: typeof setAPlayers, pid: string) => {
    const next = new Set(set);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setter(next);
  };
  const togglePick = (set: Set<number>, setter: typeof setAPicks, r: number) => {
    const next = new Set(set);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setter(next);
  };

  const evaluate = async () => {
    if (!data || !teamA || !teamB) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const savedA =
        allKeepers.find((k) => k.rosterId === teamARosterId)?.playerIds ?? [];
      const savedB =
        allKeepers.find((k) => k.rosterId === teamBRosterId)?.playerIds ?? [];

      const sideFor = (
        rosterId: number,
        roster: PlayerRow[],
        delta: any,
        savedIds: string[],
        teamName: string,
      ) => ({
        teamName,
        roster: roster.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          position: p.position,
          teamAbbr: p.teamAbbr,
          pprRank: p.pprRank,
          keeperRound: p.keeperRound,
        })),
        savedKeeperIds: savedIds,
        missingPicks: delta?.missing ?? [],
        extraPicks: delta?.extra ?? [],
        insuranceFeeAlreadyPaid: false, // TODO: surface this in UI
      });

      const body = {
        season,
        teamA: sideFor(
          teamARosterId as number,
          rosterA,
          deltaA,
          savedA,
          teamA.teamName,
        ),
        teamB: sideFor(
          teamBRosterId as number,
          rosterB,
          deltaB,
          savedB,
          teamB.teamName,
        ),
        trade: {
          aSendsPlayers: Array.from(aSendsPlayers),
          bSendsPlayers: Array.from(bSendsPlayers),
          aSendsPicks: Array.from(aSendsPicks),
          bSendsPicks: Array.from(bSendsPicks),
        },
      };

      const res = await fetch("/api/trade-evaluator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  const canEvaluate =
    teamARosterId !== "" &&
    teamBRosterId !== "" &&
    teamARosterId !== teamBRosterId &&
    aSendsPlayers.size + aSendsPicks.size > 0 &&
    bSendsPlayers.size + bSendsPicks.size > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trade Evaluator</h1>
        <p className="text-sm text-ink-500">
          Unlike generic trade analyzers, this one understands{" "}
          <em>this league&apos;s</em> rules — keeper cost escalation, slide-up
          mechanics, and the 50% insurance fee.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TeamPanel
          label="Team A"
          teams={teams}
          rosterId={teamARosterId}
          onChange={setTeamA}
          roster={rosterA}
          picks={picksHeld(deltaA)}
          selectedPlayers={aSendsPlayers}
          onTogglePlayer={(pid) => togglePlayer(aSendsPlayers, setAPlayers, pid)}
          selectedPicks={aSendsPicks}
          onTogglePick={(r) => togglePick(aSendsPicks, setAPicks, r)}
        />
        <TeamPanel
          label="Team B"
          teams={teams}
          rosterId={teamBRosterId}
          onChange={setTeamB}
          roster={rosterB}
          picks={picksHeld(deltaB)}
          selectedPlayers={bSendsPlayers}
          onTogglePlayer={(pid) => togglePlayer(bSendsPlayers, setBPlayers, pid)}
          selectedPicks={bSendsPicks}
          onTogglePick={(r) => togglePick(bSendsPicks, setBPicks, r)}
        />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            className="w-full min-h-11 sm:w-auto"
            onClick={evaluate}
            disabled={!canEvaluate || busy}
          >
            {busy ? "Evaluating…" : "Evaluate trade"}
          </Button>
          {!canEvaluate && ready && (
            <span className="text-xs text-ink-500">
              Pick two different teams and at least one asset from each side.
            </span>
          )}
          {usage && (
            <span className="text-xs text-ink-500 sm:ml-auto">
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
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-semibold",
                    verdictTone[result.verdict] ??
                      "bg-ink-100 text-ink-700 border-ink-200",
                  )}
                >
                  {verdictLabel[result.verdict] ?? result.verdict ?? "(no verdict)"}
                </span>
                {result.confidenceNote && (
                  <span className="text-xs text-ink-500">{result.confidenceNote}</span>
                )}
              </div>
              {result.recommendation && (
                <p className="mt-3 text-sm text-ink-800">{result.recommendation}</p>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {result.teamA && (
              <SideCard label={`Team A: ${teamA?.teamName}`} side={result.teamA} />
            )}
            {result.teamB && (
              <SideCard label={`Team B: ${teamB?.teamName}`} side={result.teamB} />
            )}
          </div>

          {result.keeperEconomics && (
            <Card>
              <CardHeader>
                <CardTitle>Keeper economics (§2)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-700">{result.keeperEconomics}</p>
              </CardBody>
            </Card>
          )}
          {result.pickIntegrity && (
            <Card>
              <CardHeader>
                <CardTitle>Pick integrity (§6)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-700">{result.pickIntegrity}</p>
              </CardBody>
            </Card>
          )}
          {result.insuranceFee && (
            <Card>
              <CardHeader>
                <CardTitle>Insurance fee (§6)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-700">{result.insuranceFee}</p>
              </CardBody>
            </Card>
          )}

          <details className="text-xs text-ink-500">
            <summary className="cursor-pointer select-none">
              Raw response (debug)
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-ink-100 p-2 text-[0.7rem] text-ink-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function TeamPanel({
  label,
  teams,
  rosterId,
  onChange,
  roster,
  picks,
  selectedPlayers,
  onTogglePlayer,
  selectedPicks,
  onTogglePick,
}: {
  label: string;
  teams: { rosterId: number; teamName: string }[];
  rosterId: number | "";
  onChange: (id: number | "") => void;
  roster: PlayerRow[];
  picks: number[];
  selectedPlayers: Set<string>;
  onTogglePlayer: (pid: string) => void;
  selectedPicks: Set<number>;
  onTogglePick: (r: number) => void;
}) {
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => (a.pprRank ?? 9999) - (b.pprRank ?? 9999)),
    [roster],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <CardTitle>{label}</CardTitle>
        <select
          className="w-full min-h-11 rounded-md border border-ink-300 px-2 py-2.5 text-base sm:w-auto sm:min-h-0 sm:py-1 sm:text-sm"
          value={rosterId}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : parseInt(v));
          }}
        >
          <option value="">Select team…</option>
          {teams.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>
              {t.teamName}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardBody className="space-y-3">
        {rosterId === "" ? (
          <p className="text-sm text-ink-500">Pick a team.</p>
        ) : (
          <>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                Players this side sends
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200">
                {sortedRoster.map((p) => (
                  <button
                    key={p.playerId}
                    onClick={() => onTogglePlayer(p.playerId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b border-ink-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-ink-50 sm:py-1.5",
                      selectedPlayers.has(p.playerId) && "bg-brand-50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          selectedPlayers.has(p.playerId)
                            ? "bg-brand-600"
                            : "bg-ink-300",
                        )}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-ink-500">{p.position}</span>
                    </span>
                    <span className="text-xs text-ink-500">
                      #{p.pprRank ?? "—"} · R{p.keeperRound ?? "—"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                Picks this side sends
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-1">
                {picks.map((r) => (
                  <button
                    key={r}
                    onClick={() => onTogglePick(r)}
                    className={cn(
                      "min-h-9 min-w-11 rounded border px-2.5 py-1.5 text-xs sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1",
                      selectedPicks.has(r)
                        ? "border-brand-300 bg-brand-100 text-brand-900"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    R{r}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function SideCard({ label, side }: { label: string; side: Partial<SideAnalysis> }) {
  const gained = side.assetsGained ?? [];
  const lost = side.assetsLost ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-sm">
        {side.immediateValueDelta && (
          <div>
            <span className="font-medium">Value delta: </span>
            <span className="text-ink-700">{side.immediateValueDelta}</span>
          </div>
        )}
        {gained.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Gained
            </div>
            <ul className="list-disc pl-5">
              {gained.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {lost.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-red-700">
              Lost
            </div>
            <ul className="list-disc pl-5">
              {lost.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {side.fitNote && <div className="text-ink-700">{side.fitNote}</div>}
      </CardBody>
    </Card>
  );
}
