import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { draftPollDates } from "../lib/draftPollConfig";
import { findMyRosterId, useCurrentLeague } from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
import { useDraftPoll } from "../lib/pollState";
import { useLeagueUsers, useRosters } from "../lib/sleeperQueries";
import { cn } from "../lib/cn";

type Tab = "form" | "results";
type DateChoice = "works" | "no";

const POLL_DATES = draftPollDates();

function choicesFromResponse(
  available: string[],
  unavailable: string[],
): Record<string, DateChoice> {
  const out: Record<string, DateChoice> = {};
  available.forEach((d) => {
    out[d] = "works";
  });
  unavailable.forEach((d) => {
    out[d] = "no";
  });
  return out;
}

function splitChoices(choices: Record<string, DateChoice>) {
  const available: string[] = [];
  const unavailable: string[] = [];
  Object.entries(choices).forEach(([date, choice]) => {
    if (choice === "works") available.push(date);
    if (choice === "no") unavailable.push(date);
  });
  return { available, unavailable };
}

export default function DraftPollPage() {
  const { username } = useIdentity();
  const { league, isLoading: leagueLoading } = useCurrentLeague();
  const leagueId = league?.league_id;

  const rostersQ = useRosters(leagueId);
  const usersQ = useLeagueUsers(leagueId);
  const { data: responses, isLoading: pollLoading, save, isShared, error } =
    useDraftPoll(leagueId);

  const myRosterId = useMemo(() => {
    if (!rostersQ.data || !usersQ.data || !username) return undefined;
    return findMyRosterId(usersQ.data, rostersQ.data, username);
  }, [rostersQ.data, usersQ.data, username]);

  const teams = useMemo(() => {
    if (!rostersQ.data || !usersQ.data) return [];
    const ownerToName = new Map<string, string>();
    usersQ.data.forEach((u) => {
      ownerToName.set(
        u.user_id,
        u.metadata?.team_name || u.display_name || "Unknown",
      );
    });
    return rostersQ.data
      .map((r) => ({
        rosterId: r.roster_id,
        teamName: ownerToName.get(r.owner_id) || `Team ${r.roster_id}`,
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [rostersQ.data, usersQ.data]);

  const myResponse = useMemo(
    () => responses.find((r) => r.rosterId === myRosterId),
    [responses, myRosterId],
  );

  const hasSubmitted = myResponse != null;

  const [tab, setTab] = useState<Tab>("form");
  const [choices, setChoices] = useState<Record<string, DateChoice>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!myResponse) return;
    setChoices(
      choicesFromResponse(
        myResponse.availableDates,
        myResponse.unavailableDates,
      ),
    );
    setNotes(myResponse.notes ?? "");
  }, [myResponse]);

  const loading = leagueLoading || rostersQ.isLoading || usersQ.isLoading || pollLoading;

  const setDateChoice = (dateId: string, choice: DateChoice) => {
    setChoices((prev) => {
      const next = { ...prev };
      if (next[dateId] === choice) {
        delete next[dateId];
      } else {
        next[dateId] = choice;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (myRosterId == null) return;
    const { available, unavailable } = splitChoices(choices);
    if (available.length === 0 && unavailable.length === 0) {
      setSaveError("Mark at least one date as works or doesn't work.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await save({
        rosterId: myRosterId,
        username,
        availableDates: available,
        unavailableDates: unavailable,
        notes: notes.trim() || undefined,
      });
      setTab("results");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save your response.");
    } finally {
      setSaving(false);
    }
  };

  const dateStats = useMemo(() => {
    return POLL_DATES.map((date) => {
      let works = 0;
      let blocked = 0;
      responses.forEach((r) => {
        if (r.availableDates.includes(date.id)) works++;
        else if (r.unavailableDates.includes(date.id)) blocked++;
      });
      const flexible = responses.length - works - blocked;
      return { date, works, blocked, flexible };
    }).sort((a, b) => {
      if (b.works !== a.works) return b.works - a.works;
      return a.blocked - b.blocked;
    });
  }, [responses]);

  const respondedIds = useMemo(
    () => new Set(responses.map((r) => r.rosterId)),
    [responses],
  );

  const responseChoice = (
    resp: (typeof responses)[0] | undefined,
    dateId: string,
  ): DateChoice | null => {
    if (!resp) return null;
    if (resp.availableDates.includes(dateId)) return "works";
    if (resp.unavailableDates.includes(dateId)) return "no";
    return null;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Draft date poll
        </h1>
        <p className="text-sm text-ink-500">
          Night drafts only — Aug 30 through Sep 7. Tap{" "}
          <strong className="font-medium text-ink-700">Works</strong> or{" "}
          <strong className="font-medium text-ink-700">Doesn&apos;t work</strong>{" "}
          for each day; leave a day blank if you&apos;re flexible. Once we pick a
          date, we&apos;ll nail down the start time.
        </p>
      </div>

      {!isShared && (
        <Card>
          <CardBody className="space-y-2 text-sm text-ink-700">
            <p className="font-medium text-ink-900">Supabase required</p>
            <p>
              The poll stores responses in Supabase so everyone in the league can
              see them. Add your Supabase URL and publishable key to{" "}
              <code className="text-xs">.env.local</code>, then run{" "}
              <code className="text-xs">supabase/schema.sql</code> in the SQL
              editor.
            </p>
          </CardBody>
        </Card>
      )}

      {!leagueLoading && !league && (
        <Card>
          <CardBody className="text-sm text-ink-700">
            No Sleeper leagues found for <strong>{username}</strong>.
          </CardBody>
        </Card>
      )}

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">
            {(error as Error).message}
          </CardBody>
        </Card>
      )}

      {loading && isShared && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isShared && league && !loading && (
        <>
          {myRosterId == null && (
            <Card>
              <CardBody className="text-sm text-amber-900">
                Your Sleeper username doesn&apos;t match a roster in this league.
                Use <em>Switch user</em> in the menu if you go by a different
                handle.
              </CardBody>
            </Card>
          )}

          <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab("form")}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-4 text-sm font-medium transition-colors",
                tab === "form"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              Your availability
            </button>
            <button
              type="button"
              onClick={() => hasSubmitted && setTab("results")}
              disabled={!hasSubmitted}
              title={hasSubmitted ? undefined : "Submit your availability first"}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-4 text-sm font-medium transition-colors",
                tab === "results"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
                !hasSubmitted && "cursor-not-allowed opacity-50",
              )}
            >
              League results
            </button>
          </div>

          {tab === "form" && myRosterId != null && (
            <Card>
              <CardHeader>
                <CardTitle>Which nights work?</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {POLL_DATES.map((date) => {
                    const choice = choices[date.id];
                    return (
                      <li
                        key={date.id}
                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">{date.label}</div>
                          {date.note && (
                            <div className="text-xs text-ink-500">{date.note}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            aria-pressed={choice === "works"}
                            onClick={() => setDateChoice(date.id, "works")}
                            className={cn(
                              "min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors",
                              choice === "works"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
                            )}
                          >
                            Works
                          </button>
                          <button
                            type="button"
                            aria-pressed={choice === "no"}
                            onClick={() => setDateChoice(date.id, "no")}
                            className={cn(
                              "min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors",
                              choice === "no"
                                ? "border-red-200 bg-red-50 text-red-800"
                                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
                            )}
                          >
                            Doesn&apos;t work
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <p className="text-xs text-ink-500">
                  Tap again to clear a day and mark yourself flexible on it.
                </p>

                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-ink-700">
                    Anything else? <span className="font-normal text-ink-400">(optional)</span>
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Shift work, vacation, prefer Sunday over midweek, etc."
                    className="w-full rounded-md border border-ink-300 px-3 py-2 text-base text-ink-900 shadow-sm"
                  />
                </label>

                {saveError && (
                  <p className="text-sm text-red-700">{saveError}</p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={saving} onClick={handleSave}>
                    {hasSubmitted ? "Update response" : "Submit availability"}
                  </Button>
                  {hasSubmitted && (
                    <button
                      type="button"
                      onClick={() => setTab("results")}
                      className="text-sm text-brand-700 underline"
                    >
                      View league results →
                    </button>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {tab === "results" && hasSubmitted && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Best dates (most &quot;works&quot; votes)</CardTitle>
                </CardHeader>
                <CardBody className="space-y-3">
                  {dateStats.map(({ date, works, blocked, flexible }) => {
                    const total = teams.length;
                    const pct = total ? (works / total) * 100 : 0;
                    return (
                      <div key={date.id} className="space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-ink-800">{date.label}</span>
                          <span className="tabular-nums text-ink-500">
                            {works} works · {blocked} blocked
                            {flexible > 0 && ` · ${flexible} flexible`}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-[width]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    By team{" "}
                    <span className="font-normal text-ink-500">
                      ({responses.length} / {teams.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                        <tr>
                          <th className="sticky left-0 z-10 bg-ink-50 px-3 py-2 text-left">
                            Team
                          </th>
                          {POLL_DATES.map((d) => (
                            <th key={d.id} className="px-1.5 py-2 text-center">
                              {d.shortLabel}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map((t) => {
                          const resp = responses.find((r) => r.rosterId === t.rosterId);
                          const pending = !respondedIds.has(t.rosterId);
                          return (
                            <tr
                              key={t.rosterId}
                              className={cn(
                                "border-t border-ink-100",
                                pending && "bg-amber-50/40",
                                t.rosterId === myRosterId && "bg-brand-50/30",
                              )}
                            >
                              <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-medium">
                                {t.teamName}
                                {pending && (
                                  <span className="ml-1 text-xs font-normal text-amber-700">
                                    (pending)
                                  </span>
                                )}
                              </td>
                              {POLL_DATES.map((d) => {
                                const c = responseChoice(resp, d.id);
                                return (
                                  <td key={d.id} className="px-1.5 py-2 text-center">
                                    {c === "works" ? (
                                      <span className="text-emerald-600" title="Works">
                                        ✓
                                      </span>
                                    ) : c === "no" ? (
                                      <span className="text-red-500" title="Doesn't work">
                                        ✗
                                      </span>
                                    ) : (
                                      <span className="text-ink-300" title="Flexible">
                                        —
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="max-w-[10rem] truncate px-3 py-2 text-ink-600">
                                {resp?.notes ?? ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
                    ✓ works · ✗ doesn&apos;t work · — flexible / no preference
                  </p>
                </CardBody>
              </Card>

              <p className="text-xs text-ink-400">
                Results update as managers submit.{" "}
                <Link href="/teams" className="underline">
                  Team directory
                </Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
